const axios = require('axios');
const logger = require('../../config/logger/loggerClient.js');
const BaseNumeroDetalleModel = require('../../models/baseNumeroDetalle.model.js');
const LlamadaModel = require('../../models/llamada.model.js');
const CampaniaEjecucionModel = require('../../models/campaniaEjecucion.model.js');

const ULTRAVOX_API_URL = process.env.ULTRAVOX_API_URL || 'https://bot.ai-you.io/api/calls/ultravox';
const BATCH_SIZE = 100; // Tamaño de cada bloque de llamadas (recomendado: 100)
const BATCH_DELAY_MS = 500; // Delay entre bloques (500ms)

class LlamadaService {
    constructor() {
        this.client = axios.create({
            baseURL: ULTRAVOX_API_URL,
            headers: { 'Content-Type': 'application/json', "X-Origin-Service": "portabilidad-bitel.ai-you.io" },
            timeout: 30000
        });
        // Map de ejecuciones activas: idEjecucion -> { active: bool, ... }
        this.ejecucionesActivas = new Map();
    }

    /**
     * Obtiene las sesiones activas en Ultravox para una empresa
     */
    async getSesionesActivas(idEmpresa) {
        try {
            const response = await this.client.get(`/sessions/${idEmpresa}`);
            return response.data?.data || [];
        } catch (error) {
            logger.error(`[LlamadaService] Error al obtener sesiones activas: ${error.message}`);
            return [];
        }
    }

    /**
     * Realiza una llamada via Ultravox
     */
    async realizarLlamada(body) {
        try {
            console.log(`[LlamadaService.realizarLlamada] Llamando a: ${body.destination}`);
            const response = await this.client.post('', body);
            console.log(`[LlamadaService.realizarLlamada] Respuesta:`, JSON.stringify(response.data));
            return response.data;
        } catch (error) {
            console.log(`[LlamadaService.realizarLlamada] Error HTTP:`, error.response?.status, JSON.stringify(error.response?.data));
            logger.error(`[LlamadaService] Error al realizar llamada a ${body.destination}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Carga TODOS los números pendientes de llamar para una campaña.
     */
    async cargarUniversoPendiente(idCampania) {
        const detalleModel = new BaseNumeroDetalleModel();
        return await detalleModel.getAllUniversoPendientePorCampania(idCampania);
    }

    formatearTelefono(telefono) {
        const limpio = String(telefono).replace(/\D/g, '');
        return limpio.startsWith('51') ? limpio : `51${limpio}`;
    }

    /**
     * Pequeña pausa entre bloques
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Procesa llamadas en bloques.
     * Asterisk maneja la concurrencia, solo enviamos en bloques para no saturar la API.
     */
    async procesarLlamadasAsync({ idEjecucion, idCampania, idEmpresa, tipificaciones, prompt, voiceCode, toolRuta, canal, configLlamadas }) {
        const ejecucionModel = new CampaniaEjecucionModel();
        const llamadaModel = new LlamadaModel();

        // Evitar doble ejecución
        if (this.ejecucionesActivas.has(idEjecucion)) {
            logger.warn(`[LlamadaService] Ejecución ${idEjecucion} ya está en proceso`);
            return;
        }

        this.ejecucionesActivas.set(idEjecucion, { active: true });

        try {
            await ejecucionModel.iniciarEjecucion(idEjecucion);

            // 1. Cargar universo de números pendientes
            const numeros = await this.cargarUniversoPendiente(idCampania);
            const totalNumeros = numeros.length;
            let completadas = 0;
            let fallidas = 0;

            logger.info(`[LlamadaService] Ejecución ${idEjecucion}: ${totalNumeros} números a procesar en bloques de ${BATCH_SIZE}`);

            // 2. Procesar en bloques
            for (let i = 0; i < totalNumeros; i += BATCH_SIZE) {
                // Verificar si fue cancelada
                const estado = this.ejecucionesActivas.get(idEjecucion);
                if (!estado?.active) {
                    logger.info(`[LlamadaService] Ejecución ${idEjecucion} cancelada en bloque ${Math.floor(i / BATCH_SIZE) + 1}`);
                    break;
                }

                const bloque = numeros.slice(i, i + BATCH_SIZE);
                const numBloque = Math.floor(i / BATCH_SIZE) + 1;
                const totalBloques = Math.ceil(totalNumeros / BATCH_SIZE);

                logger.info(`[LlamadaService] Procesando bloque ${numBloque}/${totalBloques} (${bloque.length} números)`);

                // Crear promesas para este bloque
                const promesas = bloque.map(async (num) => {
                    const telefono = this.formatearTelefono(num.telefono);
                    const body = {
                        destination: telefono,
                        data: {
                            nombre_completo: num.nombre,
                            celular: telefono,
                            id_empresa: num.id_empresa,
                            ...(num.json_adicional || {})
                        },
                        extras: {
                            voice: voiceCode,
                            tipificaciones,
                            prompt: prompt,
                            tool_ruta: toolRuta,
                            canal: canal,
                            empresa: {
                                id: num.id_empresa,
                                nombre: num.nombre_comercial,
                            },
                            config_llamadas: configLlamadas || null
                        }
                    };

                    try {
                        const result = await this.realizarLlamada(body);
                        if (result?.success) {
                            await llamadaModel.create({
                                id_empresa: idEmpresa,
                                id_campania: idCampania,
                                id_base_numero: num.id_base_numero,
                                id_base_numero_detalle: num.id,
                                id_campania_ejecucion: idEjecucion,
                                provider_call_id: result.data.channelId
                            });
                            return { success: true, telefono };
                        }
                        return { success: false, telefono, error: 'No success en respuesta' };
                    } catch (error) {
                        console.error(`[LlamadaService] Error en llamada ${telefono}:`, error.message);
                        return { success: false, telefono, error: error.message };
                    }
                });

                // Ejecutar bloque en paralelo
                const resultados = await Promise.allSettled(promesas);

                // Contar resultados
                for (const resultado of resultados) {
                    if (resultado.status === 'fulfilled' && resultado.value.success) {
                        completadas++;
                    } else {
                        fallidas++;
                    }
                }

                // Pequeño delay entre bloques para no saturar
                if (i + BATCH_SIZE < totalNumeros) {
                    await this.sleep(BATCH_DELAY_MS);
                }
            }

            // 3. Finalizar ejecución
            await ejecucionModel.finalizarEjecucion(idEjecucion, {
                resultado: JSON.stringify({ total: totalNumeros, completadas, fallidas })
            });

            logger.info(`[LlamadaService] Ejecución ${idEjecucion} finalizada: ${completadas} ok, ${fallidas} fallidas de ${totalNumeros}`);

        } catch (error) {
            logger.error(`[LlamadaService] Error en ejecución ${idEjecucion}: ${error.message}`);
            await ejecucionModel.finalizarEjecucion(idEjecucion, {
                estado_ejecucion: 'fallido',
                mensaje_error: error.message
            }).catch(() => {});
        } finally {
            this.ejecucionesActivas.delete(idEjecucion);
        }
    }

    /**
     * Cancela una ejecución activa
     */
    cancelarEjecucion(idEjecucion) {
        const estado = this.ejecucionesActivas.get(idEjecucion);
        if (estado) {
            estado.active = false;
            logger.info(`[LlamadaService] Ejecución ${idEjecucion} marcada para cancelar`);
            return true;
        }
        return false;
    }

    /**
     * Retorna las ejecuciones activas actualmente en memoria
     */
    getEjecucionesActivas() {
        return Array.from(this.ejecucionesActivas.keys());
    }
}

module.exports = new LlamadaService();
