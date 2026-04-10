const axios = require('axios');
const logger = require('../../config/logger/loggerClient.js');
const BaseNumeroDetalleModel = require('../../models/baseNumeroDetalle.model.js');
const LlamadaModel = require('../../models/llamada.model.js');
const jobQueueService = require('../jobQueue/jobQueue.service.js');

const ULTRAVOX_API_URL = process.env.ULTRAVOX_API_URL || 'https://bot.ai-you.io/api/calls/ultravox';
const UMBRAL_COLA = 10000; // Usar cola PostgreSQL para más de 10,000 registros
const BATCH_SIZE = 250; // Tamaño de cada bloque de llamadas
const BATCH_DELAY_MS = 500; // Delay entre bloques (500ms)
const RETRY_WAIT_MS = 60000; // Espera entre rondas de reintentos (60 segundos)

class LlamadaService {
    constructor() {
        this.client = axios.create({
            baseURL: ULTRAVOX_API_URL,
            headers: { 'Content-Type': 'application/json', "X-Origin-Service": "portabilidad-bitel.ai-you.io" },
            timeout: 120000 // 2 minutos para evitar timeout en batches grandes
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
            const numBloque = Math.floor(i / BATCH_SIZE) + 1;
            console.log(`[LlamadaService] ========== INICIANDO BLOQUE ${numBloque}/${totalBloques} ==========`);

            // Verificar si fue cancelada
            const estado = this.ejecucionesActivas.get(idEjecucion);
            if (!estado?.active) {
                logger.info(`[LlamadaService] Ejecución ${idEjecucion} cancelada en ronda ${ronda}, bloque ${numBloque}`);
                console.log(`[LlamadaService] CANCELADO: Ejecución ${idEjecucion} cancelada en bloque ${numBloque}`);
                break;
            }

            const bloque = numeros.slice(i, i + BATCH_SIZE);

            logger.info(`[LlamadaService] Ronda ${ronda} - Bloque ${numBloque}/${totalBloques} (${bloque.length} números)`);

            // 1. Preparar datos para bulk insert
            const llamadasParaInsertar = bloque.map(num => ({
                id_empresa: idEmpresa,
                id_campania: idCampania,
                id_base_numero: num.id_base_numero,
                id_base_numero_detalle: num.id,
                id_campania_ejecucion: idEjecucion
            }));

            // 2. Insertar todas las llamadas del bloque y luego SELECT para obtener IDs
            let llamadasCreadas = [];
            try {
                llamadasCreadas = await llamadaModel.bulkCreate(llamadasParaInsertar, idEjecucion);
                logger.info(`[LlamadaService] Bloque ${numBloque}: ${llamadasCreadas.length} llamadas insertadas y recuperadas de BD`);
            } catch (dbError) {
                logger.error(`[LlamadaService] Error en bulk insert bloque ${numBloque}: ${dbError.message}`);
                fallidas += bloque.length;
                continue;
            }

            // 3. Crear mapa de id_base_numero_detalle -> id_llamada para lookup rápido
            const mapaIdLlamada = new Map();
            for (const ll of llamadasCreadas) {
                mapaIdLlamada.set(ll.id_base_numero_detalle, ll.id_llamada);
            }

            // 4. Armar array de calls con los id_llamada ya disponibles
            const calls = [];
            for (const num of bloque) {
                const telefono = this.formatearTelefono(num.telefono);
                const idLlamada = mapaIdLlamada.get(num.id);

                if (!idLlamada) {
                    logger.warn(`[LlamadaService] No se encontró id_llamada para detalle ${num.id}`);
                    fallidas++;
                    continue;
                }

                calls.push({
                    destination: telefono,
                    data: {
                        // Primero json_adicional para que no sobrescriba campos explícitos
                        ...(num.json_adicional || {}),
                        // Campos de base_numero_detalle (siempre se envían)
                        nombre: num.nombre || null,
                        nombre_completo: num.nombre || null,
                        telefono: telefono,
                        celular: telefono,
                        correo: num.correo || null,
                        tipo_documento: num.tipo_documento || null,
                        numero_documento: num.numero_documento || null,
                        // Campos del sistema
                        id_empresa: num.id_empresa,
                        id_llamada: idLlamada
                    }
                });
                enviadas++;
            }

            // Log del primer call para verificar estructura
            if (calls.length > 0) {
                console.log(`[LlamadaService] Primer call del batch:`, JSON.stringify(calls[0]));
            }

            // Si no hay llamadas creadas, continuar con el siguiente bloque
            if (calls.length === 0) {
                logger.warn(`[LlamadaService] Bloque ${numBloque} sin llamadas válidas, saltando...`);
                continue;
            }

            // 5. Enviar el batch a Ultravox con los id_llamada incluidos
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
                console.log(`[LlamadaService] Bloque ${numBloque}: Enviando ${calls.length} llamadas a Ultravox...`);
                const result = await this.realizarLlamadasBatch(batchBody);

                if (result?.success && result?.encoladas > 0) {
                    logger.info(`[LlamadaService] Batch encolado: ${result.encoladas} llamadas`);
                    console.log(`[LlamadaService] Bloque ${numBloque}: ÉXITO - ${result.encoladas} llamadas encoladas`);
                } else {
                    logger.error(`[LlamadaService] Batch falló: ${result?.mensaje || 'Sin detalle'}`);
                    console.log(`[LlamadaService] Bloque ${numBloque}: FALLÓ - ${result?.mensaje || 'Sin detalle'}`);
                }
            } catch (error) {
                console.error(`[LlamadaService] Error en batch bloque ${numBloque}:`, error.message);
                // Las llamadas ya están creadas en BD, el error es solo al encolar
            }

            console.log(`[LlamadaService] ========== BLOQUE ${numBloque}/${totalBloques} FINALIZADO ==========`);

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

    /**
     * Encola un trabajo de llamadas masivas para procesamiento en background.
     * Usa cola PostgreSQL para volúmenes grandes, proceso directo para pequeños.
     *
     * @param {Object} params - Parámetros de la ejecución
     * @param {boolean} forzarCola - Forzar uso de cola aunque el volumen sea pequeño
     * @returns {Object} { usaCola: boolean, jobId?: number, totalRegistros: number }
     */
    async encolarLlamadas({ idEjecucion, idCampania, idEmpresa, tipificaciones, prompt, voiceCode, toolRuta, canal, configLlamadas, filtroNumeros = null, esRellamada = false }, forzarCola = false) {
        // Contar registros para decidir el método
        const detalleModel = new BaseNumeroDetalleModel();
        const totalRegistros = esRellamada && filtroNumeros?.length > 0
            ? filtroNumeros.length
            : await detalleModel.countUniversoPendientePorCampania(idCampania, configLlamadas?.max_intentos || 1);

        logger.info(`[LlamadaService] encolarLlamadas: ${totalRegistros} registros para campaña ${idCampania}`);

        // Decidir si usar cola o proceso directo
        const usarCola = forzarCola || totalRegistros > UMBRAL_COLA;

        if (usarCola) {
            // Usar cola PostgreSQL para volúmenes grandes
            logger.info(`[LlamadaService] Usando cola PostgreSQL para ${totalRegistros} registros`);

            const result = await jobQueueService.enqueueJob({
                idCampania,
                idEjecucion,
                idEmpresa,
                tipificaciones,
                prompt,
                voiceCode,
                toolRuta,
                canal,
                configLlamadas,
                filtroNumeros,
                esRellamada
            });

            return {
                usaCola: true,
                jobId: result.jobId,
                totalRegistros: result.totalRegistros,
                mensaje: `Job ${result.jobId} encolado con ${result.totalRegistros} registros`
            };
        } else {
            // Proceso directo para volúmenes pequeños (comportamiento original)
            logger.info(`[LlamadaService] Procesando directamente ${totalRegistros} registros`);

            // Lanzar proceso async (no esperamos)
            this.procesarLlamadasAsync({
                idEjecucion,
                idCampania,
                idEmpresa,
                tipificaciones,
                prompt,
                voiceCode,
                toolRuta,
                canal,
                configLlamadas,
                filtroNumeros,
                esRellamada
            });

            return {
                usaCola: false,
                totalRegistros,
                mensaje: `Procesando ${totalRegistros} registros directamente`
            };
        }
    }

    /**
     * Obtiene el estado de un job en la cola
     */
    async getJobStatus(jobId) {
        return await jobQueueService.getJobStatus(jobId);
    }

    /**
     * Cancela un job en la cola
     */
    async cancelarJob(jobId) {
        return await jobQueueService.cancelJob(jobId);
    }

    /**
     * Obtiene estadísticas de la cola
     */
    async getQueueStats() {
        return await jobQueueService.getQueueStats();
    }
}

module.exports = new LlamadaService();
