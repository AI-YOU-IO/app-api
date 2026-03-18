const axios = require('axios');
const logger = require('../../config/logger/loggerClient.js');
const BaseNumeroDetalleModel = require('../../models/baseNumeroDetalle.model.js');
const LlamadaModel = require('../../models/llamada.model.js');
const CampaniaEjecucionModel = require('../../models/campaniaEjecucion.model.js');

const ULTRAVOX_API_URL = process.env.ULTRAVOX_API_URL || 'https://bot.ai-you.io/api/calls/ultravox';
const MAX_CONCURRENT = process.env.MAX_NUM_CONCURRENT;
const POLL_INTERVAL = 10000; // 10 segundos

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
            const response = await this.client.post('', body);
            return response.data;
        } catch (error) {
            logger.error(`[LlamadaService] Error al realizar llamada a ${body.destination}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Carga TODOS los números pendientes de llamar para una campaña.
     * Obtiene las bases desde campania_base_numero y filtra los ya llamados.
     * @param {number} idCampania - ID de la campaña
     * @returns {Array} Array de números pendientes
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
     * Inicia el procesamiento async de llamadas.
     * Mantiene hasta 200 llamadas concurrentes, polleando cada 10s.
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

            // 1. Cargar universo de números pendientes (excluye ya llamados)
            const numeros = await this.cargarUniversoPendiente(idCampania);
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
                            tool_ruta: toolRuta,
                            canal: canal,
                            empresa: {
                                id: num.id_empresa,
                                nombre: num.nombre_comercial,
                            },
                            config_llamadas: configLlamadas || null
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
                }

                await Promise.allSettled(promesas);
            };

            // 3. Despachar lote inicial
            await despacharLote();

            // 4. Poll loop: cada 10s revisar sesiones y despachar más
            await new Promise((resolve) => {
                const interval = setInterval(async () => {
                    // Verificar si fue cancelada
                    const estado = this.ejecucionesActivas.get(idEjecucion);
                    if (!estado?.active) {
                        clearInterval(interval);
                        resolve();
                        return;
                    }

                    // Marcar como finalizadas las llamadas que ya no están en sesiones activas
                    const sesionesActuales = await this.getSesionesActivas(idEmpresa);
                    const channelIdsActivos = new Set(sesionesActuales.map(s => s.channelId));
                    for (const channelId of llamadasEnVuelo) {
                        if (!channelIdsActivos.has(channelId)) {
                            llamadasEnVuelo.delete(channelId);
                            await llamadaModel.actualizarEstadoLlamada(channelId, 4).catch(() => {});
                        }
                    }

                    // Si ya se despacharon todos, esperar a que terminen las activas
                    if (indicePendiente >= totalNumeros) {
                        if (sesionesActuales.length === 0 && llamadasEnVuelo.size === 0) {
                            clearInterval(interval);
                            resolve();
                        }
                        return;
                    }

                    // Despachar más números
                    await despacharLote();
                }, POLL_INTERVAL);
            });

            // 5. Finalizar ejecución
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
