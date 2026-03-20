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
     * Realiza una llamada via Ultravox (individual - legacy)
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
     * Realiza múltiples llamadas en un solo request (batch)
     * @param {Object} batchBody - { calls: [...], extras: {...} }
     * @returns {Object} { success: true, results: [{ destination, success, channelId/error }, ...] }
     */
    async realizarLlamadasBatch(batchBody) {
        try {
            console.log(`[LlamadaService.realizarLlamadasBatch] Enviando batch de ${batchBody.calls.length} llamadas`);
            const response = await this.client.post('/batch', batchBody);
            console.log(`[LlamadaService.realizarLlamadasBatch] Respuesta batch recibida`);
            return response.data;
        } catch (error) {
            console.log(`[LlamadaService.realizarLlamadasBatch] Error HTTP:`, error.response?.status, JSON.stringify(error.response?.data));
            logger.error(`[LlamadaService] Error en batch de llamadas: ${error.message}`);
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

    /**
     * Carga números específicos para rellamada.
     * Carga TODOS los números del filtro sin excluir llamadas anteriores.
     * @param {number} idCampania - ID de la campaña
     * @param {Array} filtroNumeros - Array de IDs de base_numero_detalle a rellamar
     * @param {number} maxIntentos - Máximo de intentos permitidos
     * @param {number} idEjecucion - ID de la ejecución actual
     */
    async cargarNumerosParaRellamada(idCampania, filtroNumeros, maxIntentos = 1, idEjecucion) {
        if (!filtroNumeros || filtroNumeros.length === 0) {
            return [];
        }

        const placeholders = filtroNumeros.map((_, i) => `$${i + 2}`).join(',');

        const query = `
            SELECT bnd.*, bn.id as _idBase, e.nombre_comercial, e.id as id_empresa
            FROM base_numero_detalle bnd
            INNER JOIN base_numero bn ON bn.id = bnd.id_base_numero
            INNER JOIN campania_base_numero cbn ON cbn.id_base_numero = bn.id
            INNER JOIN empresa e ON e.id = bn.id_empresa
            WHERE cbn.id_campania = $1
            AND cbn.estado_registro = 1
            AND cbn.activo = 1
            AND bnd.estado_registro = 1
            AND bnd.id IN (${placeholders})
            ORDER BY bnd.id ASC
        `;

        const params = [idCampania, ...filtroNumeros];

        try {
            const { pool } = require('../../config/dbConnection');
            const [rows] = await pool.query(query, params);
            logger.info(`[LlamadaService] cargarNumerosParaRellamada: ${rows.length} números cargados para rellamada`);
            return rows;
        } catch (error) {
            logger.error(`[LlamadaService] Error al cargar números para rellamada: ${error.message}`);
            return [];
        }
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
     * Procesa una ronda de llamadas en bloques (modo batch).
     * @returns {Object} { enviadas, fallidas }
     */
    async procesarRonda({ idEjecucion, idCampania, idEmpresa, numeros, tipificaciones, prompt, voiceCode, toolRuta, canal, configLlamadas, ronda }) {
        const llamadaModel = new LlamadaModel();
        let enviadas = 0;
        let fallidas = 0;

        const totalNumeros = numeros.length;
        const totalBloques = Math.ceil(totalNumeros / BATCH_SIZE);

        logger.info(`[LlamadaService] Ronda ${ronda}: ${totalNumeros} números a procesar en ${totalBloques} bloques (modo batch)`);

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

            // 1. Primero crear los registros en llamada para obtener los id_llamada
            const calls = [];
            for (const num of bloque) {
                const telefono = this.formatearTelefono(num.telefono);
                try {
                    const idLlamada = await llamadaModel.create({
                        id_empresa: idEmpresa,
                        id_campania: idCampania,
                        id_base_numero: num.id_base_numero,
                        id_base_numero_detalle: num.id,
                        id_campania_ejecucion: idEjecucion,
                        provider_call_id: null // Se actualiza via webhook call-entrada
                    });

                    calls.push({
                        destination: telefono,
                        data: {
                            nombre_completo: num.nombre,
                            celular: telefono,
                            id_empresa: num.id_empresa,
                            id_llamada: idLlamada, // Incluimos el id_llamada para que Ultravox lo devuelva en webhooks
                            ...(num.json_adicional || {})
                        }
                    });
                    enviadas++;
                } catch (dbError) {
                    logger.warn(`[LlamadaService] Error al crear registro llamada para ${telefono}: ${dbError.message}`);
                    fallidas++;
                }
            }

            // Si no hay llamadas creadas, continuar con el siguiente bloque
            if (calls.length === 0) {
                logger.warn(`[LlamadaService] Bloque ${numBloque} sin llamadas creadas, saltando...`);
                continue;
            }

            // 2. Enviar el batch a Ultravox con los id_llamada incluidos
            const batchBody = {
                calls: calls,
                extras: {
                    voice: voiceCode,
                    tipificaciones,
                    prompt: prompt,
                    tool_ruta: toolRuta,
                    canal: canal,
                    plataforma: process.env.PLATAFORMA || 'APP',
                    empresa: {
                        id: idEmpresa,
                        nombre: numeros[0]?.nombre_comercial || '',
                    },
                    config_llamadas: configLlamadas || null,
                    id_campania: idCampania
                }
            };

            try {
                const result = await this.realizarLlamadasBatch(batchBody);

                if (result?.success && result?.encoladas > 0) {
                    logger.info(`[LlamadaService] Batch encolado: ${result.encoladas} llamadas`);
                } else {
                    logger.error(`[LlamadaService] Batch falló: ${result?.mensaje || 'Sin detalle'}`);
                }
            } catch (error) {
                console.error(`[LlamadaService] Error en batch bloque ${numBloque}:`, error.message);
                // Las llamadas ya están creadas en BD, el error es solo al encolar
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
    async procesarLlamadasAsync({ idEjecucion, idCampania, idEmpresa, tipificaciones, prompt, voiceCode, toolRuta, canal, configLlamadas, filtroNumeros = null, esRellamada = false }) {
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

            // Bucle de rondas de reintentos
            while (ronda <= maxIntentos) {
                const estado = this.ejecucionesActivas.get(idEjecucion);
                if (!estado?.active) {
                    logger.info(`[LlamadaService] Ejecución ${idEjecucion} cancelada antes de ronda ${ronda}`);
                    break;
                }

                // Cargar números pendientes
                let numeros;
                if (esRellamada && filtroNumeros && filtroNumeros.length > 0) {
                    // Para rellamadas, cargar solo los números específicos del filtro
                    numeros = await this.cargarNumerosParaRellamada(idCampania, filtroNumeros, maxIntentos, idEjecucion);
                } else {
                    // Comportamiento normal: cargar universo pendiente
                    numeros = await this.cargarUniversoPendiente(idCampania, maxIntentos);
                }

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
