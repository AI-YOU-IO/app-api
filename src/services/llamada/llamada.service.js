const axios = require('axios');
const logger = require('../../config/logger/loggerClient.js');
const BaseNumeroDetalleModel = require('../../models/baseNumeroDetalle.model.js');
const LlamadaModel = require('../../models/llamada.model.js');
const CampaniaEjecucionModel = require('../../models/campaniaEjecucion.model.js');

const ULTRAVOX_API_URL = process.env.ULTRAVOX_API_URL || 'https://bot.ai-you.io/api/calls/ultravox';
const MAX_CONCURRENT = 200;
const POLL_INTERVAL = 10000; // 10 segundos

class LlamadaService {
    constructor() {
        this.client = axios.create({
            baseURL: ULTRAVOX_API_URL,
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });
        // Map de ejecuciones activas: idEjecucion -> { active: bool, ... }
        this.ejecucionesActivas = new Map();
    }

    /**
     * Obtiene las sesiones activas en Ultravox
     */
    async getSesionesActivas() {
        try {
            const response = await this.client.get('/sessions');
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
     * Carga TODOS los números de una lista de bases (recorre todas las páginas)
     */
    async cargarTodosLosNumeros(idsBaseNumero) {
        const detalleModel = new BaseNumeroDetalleModel();
        const todosLosNumeros = [];

        for (const idBase of idsBaseNumero) {
            const firstPage = await detalleModel.getByBaseNumero(idBase, 1, 50);
            todosLosNumeros.push(...firstPage.data.map(n => ({ ...n, _idBase: idBase })));

            for (let page = 2; page <= firstPage.totalPages; page++) {
                const { data } = await detalleModel.getByBaseNumero(idBase, page, 50);
                todosLosNumeros.push(...data.map(n => ({ ...n, _idBase: idBase })));
            }
        }

        return todosLosNumeros;
    }

    formatearTelefono(telefono) {
        const limpio = String(telefono).replace(/\D/g, '');
        return limpio.startsWith('51') ? limpio : `51${limpio}`;
    }

    /**
     * Inicia el procesamiento async de llamadas.
     * Mantiene hasta 200 llamadas concurrentes, polleando cada 10s.
     */
    async procesarLlamadasAsync({ idEjecucion, idCampania, idsBaseNumero, idEmpresa, tipificaciones }) {
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

            // 1. Cargar todos los números de todas las bases
            const numeros = await this.cargarTodosLosNumeros(idsBaseNumero);
            const totalNumeros = numeros.length;
            let indicePendiente = 0;
            let completadas = 0;
            let fallidas = 0;

            logger.info(`[LlamadaService] Ejecución ${idEjecucion}: ${totalNumeros} números a procesar`);

            // 2. Despachar lote inicial (hasta MAX_CONCURRENT)
            const despacharLote = async () => {
                const sesiones = await this.getSesionesActivas();
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
                            ...(num.json_adicional || {})
                        },
                        extras: {
                            voice: "Andrea-Spanish",
                            tipificaciones,
                            empresa: {
                                id: num.id_empresa,
                                nombre: num.nombre_comercial
                            }
                        }
                    };

                    promesas.push(
                        this.realizarLlamada(body)
                            .then(async (result) => {
                                completadas++;
                                if (result?.channelId) {
                                    await llamadaModel.create({
                                        id_empresa: idEmpresa,
                                        id_campania: idCampania,
                                        id_base_numero: num._idBase,
                                        id_base_numero_detalle: num.id,
                                        provider_call_id: result.channelId
                                    });
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

                    // Si ya se despacharon todos, esperar a que terminen las activas
                    if (indicePendiente >= totalNumeros) {
                        const sesiones = await this.getSesionesActivas();
                        if (sesiones.length === 0) {
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
