const axios = require('axios');
const logger = require('../../config/logger/loggerClient.js');
const BaseNumeroDetalleModel = require('../../models/baseNumeroDetalle.model.js');
const LlamadaModel = require('../../models/llamada.model.js');

const ULTRAVOX_API_URL = process.env.ULTRAVOX_API_URL || 'https://bot.ai-you.io/api/calls/ultravox';
const BATCH_SIZE = 100; // Tamaño de cada bloque de llamadas (recomendado: 100)
const BATCH_DELAY_MS = 500; // Delay entre bloques (500ms)
const RETRY_WAIT_MS = 60000; // Espera entre rondas de reintentos (60 segundos)

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
     * @param {number} idCampania - ID de la campaña
     * @param {number} maxIntentos - Máximo de intentos permitidos (default 1)
     */
    async cargarUniversoPendiente(idCampania, maxIntentos = 1) {
        const detalleModel = new BaseNumeroDetalleModel();
        return await detalleModel.getAllUniversoPendientePorCampania(idCampania, maxIntentos);
    }

    formatearTelefono(telefono) {
        const limpio = String(telefono).replace(/\D/g, '');
        return limpio.startsWith('51') ? limpio : `51${limpio}`;
    }

    /**
     * Pequeña pausa entre bloques
     */
<<<<<<< Updated upstream
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
=======
    async procesarLlamadasAsync({ idEjecucion, idCampania, idsBaseNumero, idEmpresa, tipificaciones, prompt, canal, ruta_tool, voiceCode }) {
        const ejecucionModel = new CampaniaEjecucionModel();
        const llamadaModel = new LlamadaModel();
>>>>>>> Stashed changes

    /**
     * Procesa una ronda de llamadas en bloques.
     * @returns {Object} { enviadas, fallidas }
     */
    async procesarRonda({ idEjecucion, idCampania, idEmpresa, numeros, tipificaciones, prompt, voiceCode, toolRuta, canal, configLlamadas, ronda }) {
        const llamadaModel = new LlamadaModel();
        let enviadas = 0;
        let fallidas = 0;

        const totalNumeros = numeros.length;
        const totalBloques = Math.ceil(totalNumeros / BATCH_SIZE);

        logger.info(`[LlamadaService] Ronda ${ronda}: ${totalNumeros} números a procesar en ${totalBloques} bloques`);

        for (let i = 0; i < totalNumeros; i += BATCH_SIZE) {
            // Verificar si fue cancelada
            const estado = this.ejecucionesActivas.get(idEjecucion);
            if (!estado?.active) {
                logger.info(`[LlamadaService] Ejecución ${idEjecucion} cancelada en ronda ${ronda}, bloque ${Math.floor(i / BATCH_SIZE) + 1}`);
                break;
            }

            const bloque = numeros.slice(i, i + BATCH_SIZE);
            const numBloque = Math.floor(i / BATCH_SIZE) + 1;

            logger.info(`[LlamadaService] Ronda ${ronda} - Bloque ${numBloque}/${totalBloques} (${bloque.length} números)`);

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
                        plataforma: process.env.PLATAFORMA || 'APP',
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

            const resultados = await Promise.allSettled(promesas);

            for (const resultado of resultados) {
                if (resultado.status === 'fulfilled' && resultado.value.success) {
                    enviadas++;
                } else {
                    fallidas++;
                }
            }

            if (i + BATCH_SIZE < totalNumeros) {
                await this.sleep(BATCH_DELAY_MS);
            }
        }

        return { enviadas, fallidas };
    }

    /**
     * Procesa llamadas con reintentos automáticos dentro de la misma ejecución.
     * Hace rondas hasta que todos los números estén contactados o alcancen max_intentos.
     * El estado de la ejecución se calcula dinámicamente desde la tabla llamada.
     */
    async procesarLlamadasAsync({ idEjecucion, idCampania, idEmpresa, tipificaciones, prompt, voiceCode, toolRuta, canal, configLlamadas }) {
        if (this.ejecucionesActivas.has(idEjecucion)) {
            logger.warn(`[LlamadaService] Ejecución ${idEjecucion} ya está en proceso`);
            return;
        }

        this.ejecucionesActivas.set(idEjecucion, { active: true });

        try {
            const maxIntentos = configLlamadas?.max_intentos || 1;
            let ronda = 1;
            let totalEnviadas = 0;
            let totalFallidas = 0;

<<<<<<< Updated upstream
            // Bucle de rondas de reintentos
            while (ronda <= maxIntentos) {
                const estado = this.ejecucionesActivas.get(idEjecucion);
                if (!estado?.active) {
                    logger.info(`[LlamadaService] Ejecución ${idEjecucion} cancelada antes de ronda ${ronda}`);
                    break;
=======
            // 1. Cargar todos los números de todas las bases
            const numeros = await this.cargarTodosLosNumeros(idsBaseNumero);
            const totalNumeros = numeros.length;
            let indicePendiente = 0;
            let completadas = 0;
            let fallidas = 0;
            const llamadasEnVuelo = new Set(); // provider_call_id de llamadas despachadas

            logger.info(`[LlamadaService] Ejecución ${idEjecucion}: ${totalNumeros} números a procesar`);

            // 2. Despachar lote inicial (hasta MAX_CONCURRENT)
            const despacharLote = async () => {
                const sesiones = await this.getSesionesActivas(idEmpresa);
                const slotsDisponibles = MAX_CONCURRENT - sesiones.length;

                if (slotsDisponibles <= 0) return;

                const cantidadADespachar = Math.min(slotsDisponibles, totalNumeros - indicePendiente);

                const promesas = [];
                for (let i = 0; i < cantidadADespachar; i++) {
                    const num = numeros[indicePendiente];
                    if (!num) break;
                    indicePendiente++;

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
                            canal: canal,
                            ruta_tool: ruta_tool,
                            empresa: {
                                id: num.id_empresa,
                                nombre: num.nombre_comercial,
                            }
                        }
                    };

                    promesas.push(
                        this.realizarLlamada(body)
                            .then(async (result) => {
                                completadas++;
                                // console.log(result);
                                if (result?.success) {
                                    await llamadaModel.create({
                                        id_empresa: idEmpresa,
                                        id_campania: idCampania,
                                        id_base_numero: num._idBase,
                                        id_base_numero_detalle: num.id,
                                        id_campania_ejecucion: idEjecucion,
                                        provider_call_id: result.data.channelId
                                    });
                                    llamadasEnVuelo.add(result.data.channelId);
                                }
                            })
                            .catch(() => {
                                fallidas++;
                                logger.error(`[LlamadaService] Fallo llamada a ${telefono}`);
                            })
                    );
>>>>>>> Stashed changes
                }

                // Cargar números pendientes (ya excluye exitosas y las que alcanzaron max_intentos)
                const numeros = await this.cargarUniversoPendiente(idCampania, maxIntentos);

                if (numeros.length === 0) {
                    logger.info(`[LlamadaService] Ronda ${ronda}: No hay números pendientes, finalizando`);
                    break;
                }

                logger.info(`[LlamadaService] Ejecución ${idEjecucion} - Iniciando ronda ${ronda}/${maxIntentos} con ${numeros.length} números`);

                // Procesar esta ronda
                const { enviadas, fallidas } = await this.procesarRonda({
                    idEjecucion, idCampania, idEmpresa, numeros,
                    tipificaciones, prompt, voiceCode, toolRuta, canal, configLlamadas,
                    ronda
                });

                totalEnviadas += enviadas;
                totalFallidas += fallidas;

                logger.info(`[LlamadaService] Ronda ${ronda} completada: ${enviadas} enviadas, ${fallidas} fallidas`);

                // Si hay más rondas y aún estamos activos, esperar antes de reintentar
                if (ronda < maxIntentos && this.ejecucionesActivas.get(idEjecucion)?.active) {
                    logger.info(`[LlamadaService] Esperando ${RETRY_WAIT_MS / 1000}s antes de ronda ${ronda + 1}...`);
                    await this.sleep(RETRY_WAIT_MS);
                }

                ronda++;
            }

            logger.info(`[LlamadaService] Ejecución ${idEjecucion} finalizada: ${totalEnviadas} enviadas en ${ronda - 1} rondas`);

        } catch (error) {
            logger.error(`[LlamadaService] Error en ejecución ${idEjecucion}: ${error.message}`);
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
