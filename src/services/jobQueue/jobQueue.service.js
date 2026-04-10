const axios = require('axios');
const logger = require('../../config/logger/loggerClient.js');
const JobQueueModel = require('../../models/jobQueue.model.js');
const LlamadaModel = require('../../models/llamada.model.js');
const { pool } = require('../../config/dbConnection.js');

const ULTRAVOX_API_URL = process.env.ULTRAVOX_API_URL || 'https://bot.ai-you.io/api/calls/ultravox';
const PAGE_SIZE = 5000; // Cargar 5000 registros por página desde BD
const BATCH_SIZE = 250; // Enviar 250 llamadas por request HTTP
const BATCH_DELAY_MS = 500; // Delay entre batches HTTP
const RETRY_WAIT_MS = 60000; // Espera entre rondas de reintentos

class JobQueueService {
    constructor() {
        this.jobQueueModel = new JobQueueModel();
        this.isProcessing = false;
        this.currentJobId = null;
        this.shouldStop = false;

        this.client = axios.create({
            baseURL: ULTRAVOX_API_URL,
            headers: { 'Content-Type': 'application/json', "X-Origin-Service": "portabilidad-bitel.ai-you.io" },
            timeout: 120000
        });
    }

    /**
     * Encola un nuevo job de llamadas masivas
     */
    async enqueueJob({
        idCampania,
        idEjecucion,
        idEmpresa,
        tipificaciones,
        prompt,
        voiceCode,
        toolRuta,
        canal,
        configLlamadas,
        filtroNumeros = null,
        esRellamada = false
    }) {
        const totalRegistros = await this.contarRegistrosPendientes(idCampania, configLlamadas?.max_intentos || 1, filtroNumeros, esRellamada);

        const jobId = await this.jobQueueModel.create({
            tipo: 'llamadas_masivas',
            id_campania: idCampania,
            id_campania_ejecucion: idEjecucion,
            id_empresa: idEmpresa,
            config_json: {
                tipificaciones,
                prompt,
                voiceCode,
                toolRuta,
                canal,
                configLlamadas
            },
            filtro_numeros: filtroNumeros,
            es_rellamada: esRellamada,
            total_registros: totalRegistros,
            max_rondas: configLlamadas?.max_intentos || 1
        });

        logger.info(`[JobQueueService] Job ${jobId} encolado: ${totalRegistros} registros para campaña ${idCampania}`);

        return { jobId, totalRegistros };
    }

    /**
     * Cuenta los registros pendientes para un job
     */
    async contarRegistrosPendientes(idCampania, maxIntentos, filtroNumeros, esRellamada) {
        try {
            if (esRellamada && filtroNumeros && filtroNumeros.length > 0) {
                return filtroNumeros.length;
            }

            const [rows] = await pool.query(
                `SELECT COUNT(*)::integer as total
                FROM base_numero_detalle bnd
                INNER JOIN base_numero bn ON bn.id = bnd.id_base_numero
                INNER JOIN campania_base_numero cbn ON cbn.id_base_numero = bn.id
                WHERE cbn.id_campania = $1
                AND cbn.estado_registro = 1
                AND cbn.activo = 1
                AND bnd.estado_registro = 1
                AND NOT EXISTS (
                    SELECT 1 FROM llamada l
                    WHERE l.id_base_numero_detalle = bnd.id
                    AND l.id_campania = $1
                    AND l.estado_registro = 1
                    AND l.id_estado_llamada = 4
                )
                AND (
                    SELECT COUNT(*) FROM llamada l
                    WHERE l.id_base_numero_detalle = bnd.id
                    AND l.id_campania = $1
                    AND l.estado_registro = 1
                    AND l.fecha_fin IS NOT NULL
                ) < $2`,
                [idCampania, maxIntentos]
            );
            return rows[0]?.total || 0;
        } catch (error) {
            logger.error(`[JobQueueService] Error al contar registros: ${error.message}`);
            return 0;
        }
    }

    /**
     * Carga una página de números pendientes usando cursor (último ID procesado)
     */
    async cargarPaginaNumeros(idCampania, maxIntentos, cursorId, pageSize, filtroNumeros = null, esRellamada = false) {
        try {
            let query;
            let params;

            if (esRellamada && filtroNumeros && filtroNumeros.length > 0) {
                // Para rellamadas, filtrar por IDs específicos
                const placeholders = filtroNumeros.map((_, i) => `$${i + 3}`).join(',');
                query = `
                    SELECT bnd.*, bn.id as _idBase, e.nombre_comercial, e.id as id_empresa
                    FROM base_numero_detalle bnd
                    INNER JOIN base_numero bn ON bn.id = bnd.id_base_numero
                    INNER JOIN campania_base_numero cbn ON cbn.id_base_numero = bn.id
                    INNER JOIN empresa e ON e.id = bn.id_empresa
                    WHERE cbn.id_campania = $1
                    AND cbn.estado_registro = 1
                    AND cbn.activo = 1
                    AND bnd.estado_registro = 1
                    AND bnd.id > $2
                    AND bnd.id IN (${placeholders})
                    ORDER BY bnd.id ASC
                    LIMIT ${pageSize}
                `;
                params = [idCampania, cursorId, ...filtroNumeros];
            } else {
                // Carga normal con paginación por cursor
                query = `
                    SELECT bnd.*, bn.id as _idBase, e.nombre_comercial, e.id as id_empresa
                    FROM base_numero_detalle bnd
                    INNER JOIN base_numero bn ON bn.id = bnd.id_base_numero
                    INNER JOIN campania_base_numero cbn ON cbn.id_base_numero = bn.id
                    INNER JOIN empresa e ON e.id = bn.id_empresa
                    WHERE cbn.id_campania = $1
                    AND cbn.estado_registro = 1
                    AND cbn.activo = 1
                    AND bnd.estado_registro = 1
                    AND bnd.id > $2
                    AND NOT EXISTS (
                        SELECT 1 FROM llamada l
                        WHERE l.id_base_numero_detalle = bnd.id
                        AND l.id_campania = $1
                        AND l.estado_registro = 1
                        AND l.id_estado_llamada = 4
                    )
                    AND (
                        SELECT COUNT(*) FROM llamada l
                        WHERE l.id_base_numero_detalle = bnd.id
                        AND l.id_campania = $1
                        AND l.estado_registro = 1
                        AND l.fecha_fin IS NOT NULL
                    ) < $3
                    ORDER BY bnd.id ASC
                    LIMIT ${pageSize}
                `;
                params = [idCampania, cursorId, maxIntentos];
            }

            const [rows] = await pool.query(query, params);
            return rows;
        } catch (error) {
            logger.error(`[JobQueueService] Error al cargar página: ${error.message}`);
            return [];
        }
    }

    formatearTelefono(telefono) {
        const limpio = String(telefono).replace(/\D/g, '');
        return limpio.startsWith('51') ? limpio : `51${limpio}`;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Procesa un batch de llamadas (envío HTTP a Ultravox)
     */
    async procesarBatch(job, numeros, llamadaModel) {
        const { id_campania_ejecucion: idEjecucion, id_campania: idCampania, id_empresa: idEmpresa, config_json: config } = job;
        const { tipificaciones, prompt, voiceCode, toolRuta, canal, configLlamadas } = config;

        let enviadas = 0;
        let fallidas = 0;

        // 1. Preparar datos para bulk insert
        const llamadasParaInsertar = numeros.map(num => ({
            id_empresa: idEmpresa,
            id_campania: idCampania,
            id_base_numero: num.id_base_numero,
            id_base_numero_detalle: num.id,
            id_campania_ejecucion: idEjecucion
        }));

        // 2. Insertar llamadas en BD
        let llamadasCreadas = [];
        try {
            llamadasCreadas = await llamadaModel.bulkCreate(llamadasParaInsertar, idEjecucion);
        } catch (dbError) {
            logger.error(`[JobQueueService] Error en bulk insert: ${dbError.message}`);
            return { enviadas: 0, fallidas: numeros.length };
        }

        // 3. Crear mapa de id_base_numero_detalle -> id_llamada
        const mapaIdLlamada = new Map();
        for (const ll of llamadasCreadas) {
            mapaIdLlamada.set(ll.id_base_numero_detalle, ll.id_llamada);
        }

        // 4. Armar array de calls
        const calls = [];
        for (const num of numeros) {
            const telefono = this.formatearTelefono(num.telefono);
            const idLlamada = mapaIdLlamada.get(num.id);

            if (!idLlamada) {
                fallidas++;
                continue;
            }

            // Parsear json_adicional si es string
            let jsonAdicional = num.json_adicional || {};
            if (typeof jsonAdicional === 'string') {
                try { jsonAdicional = JSON.parse(jsonAdicional); } catch { jsonAdicional = {}; }
            }

            calls.push({
                destination: telefono,
                data: {
                    // Primero el json_adicional para que no sobrescriba campos explícitos
                    ...jsonAdicional,
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

        if (calls.length === 0) {
            return { enviadas: 0, fallidas };
        }

        // LOG: Ver datos que se envían al batch
        console.log('[JobQueueService] === DATOS BATCH ===');
        calls.forEach((call, index) => {
            console.log(`[JobQueueService] Call ${index + 1} data:`, JSON.stringify(call.data, null, 2));
        });
        console.log('[JobQueueService] === FIN DATOS BATCH ===');

        // 5. Enviar a Ultravox
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
            const response = await this.client.post('/batch', batchBody);
            if (response.data?.success && response.data?.encoladas > 0) {
                logger.info(`[JobQueueService] Batch enviado: ${response.data.encoladas} llamadas encoladas`);
            }
        } catch (error) {
            logger.error(`[JobQueueService] Error al enviar batch a Ultravox: ${error.message}`);
            // Las llamadas ya están en BD, solo falló el envío
        }

        return { enviadas, fallidas };
    }

    /**
     * Procesa un job completo con paginación
     */
    async processJob(job) {
        const { id: jobId, id_campania: idCampania, config_json: config, filtro_numeros: filtroNumeros, es_rellamada: esRellamada, max_rondas: maxRondas } = job;
        const maxIntentos = config.configLlamadas?.max_intentos || 1;
        const llamadaModel = new LlamadaModel();

        let totalEnviadas = job.llamadas_enviadas || 0;
        let totalFallidas = job.llamadas_fallidas || 0;
        let registrosProcesados = job.registros_procesados || 0;
        let cursorId = job.ultimo_id_procesado || 0;
        let rondaActual = job.ronda_actual || 1;

        logger.info(`[JobQueueService] Procesando job ${jobId} - Ronda ${rondaActual}/${maxRondas}, cursor: ${cursorId}`);

        try {
            // Procesar rondas
            while (rondaActual <= maxRondas) {
                if (this.shouldStop) {
                    logger.info(`[JobQueueService] Job ${jobId} detenido por señal de cancelación`);
                    break;
                }

                // Cargar página de números
                const numeros = await this.cargarPaginaNumeros(
                    idCampania,
                    maxIntentos,
                    cursorId,
                    PAGE_SIZE,
                    filtroNumeros,
                    esRellamada
                );

                if (numeros.length === 0) {
                    // No hay más números en esta ronda
                    if (rondaActual < maxRondas) {
                        logger.info(`[JobQueueService] Ronda ${rondaActual} completada, esperando ${RETRY_WAIT_MS / 1000}s para ronda ${rondaActual + 1}`);
                        await this.sleep(RETRY_WAIT_MS);
                        rondaActual++;
                        cursorId = 0; // Reset cursor para nueva ronda
                        await this.jobQueueModel.updateProgress(jobId, {
                            ronda_actual: rondaActual,
                            ultimo_id_procesado: cursorId
                        });
                        continue;
                    }
                    break; // Terminamos todas las rondas
                }

                logger.info(`[JobQueueService] Job ${jobId}: Procesando ${numeros.length} números (cursor: ${cursorId})`);

                // Procesar en batches de BATCH_SIZE
                for (let i = 0; i < numeros.length; i += BATCH_SIZE) {
                    if (this.shouldStop) break;

                    const batch = numeros.slice(i, i + BATCH_SIZE);
                    const { enviadas, fallidas } = await this.procesarBatch(job, batch, llamadaModel);

                    totalEnviadas += enviadas;
                    totalFallidas += fallidas;
                    registrosProcesados += batch.length;

                    // Actualizar cursor al último ID del batch
                    const ultimoId = batch[batch.length - 1].id;
                    cursorId = ultimoId;

                    // Actualizar progreso en BD
                    await this.jobQueueModel.updateProgress(jobId, {
                        registros_procesados: registrosProcesados,
                        ultimo_id_procesado: cursorId,
                        llamadas_enviadas: totalEnviadas,
                        llamadas_fallidas: totalFallidas
                    });

                    // Delay entre batches HTTP
                    if (i + BATCH_SIZE < numeros.length) {
                        await this.sleep(BATCH_DELAY_MS);
                    }
                }

                // Si procesamos menos registros que PAGE_SIZE, probablemente terminamos la página
                // Continuar al loop para verificar si hay más
            }

            // Marcar como completado
            await this.jobQueueModel.markCompleted(jobId, {
                llamadas_enviadas: totalEnviadas,
                llamadas_fallidas: totalFallidas
            });

            logger.info(`[JobQueueService] Job ${jobId} completado: ${totalEnviadas} enviadas, ${totalFallidas} fallidas`);

        } catch (error) {
            logger.error(`[JobQueueService] Error en job ${jobId}: ${error.message}`);
            await this.jobQueueModel.markFailed(jobId, error.message);
        }
    }

    /**
     * Inicia el worker que procesa jobs de la cola
     */
    async startWorker(intervalMs = 5000) {
        if (this.isProcessing) {
            logger.warn('[JobQueueService] Worker ya está corriendo');
            return;
        }

        logger.info('[JobQueueService] Iniciando worker de cola de jobs');

        // Recuperar jobs estancados por reinicio del servidor
        await this.jobQueueModel.recoverStaleJobs(30);

        this.isProcessing = true;
        this.shouldStop = false;

        const processLoop = async () => {
            while (this.isProcessing) {
                try {
                    // Intentar obtener el siguiente job pendiente
                    const job = await this.jobQueueModel.claimNextPending();

                    if (job) {
                        this.currentJobId = job.id;
                        logger.info(`[JobQueueService] Procesando job ${job.id}`);
                        await this.processJob(job);
                        this.currentJobId = null;
                    } else {
                        // No hay jobs pendientes, esperar
                        await this.sleep(intervalMs);
                    }
                } catch (error) {
                    logger.error(`[JobQueueService] Error en loop del worker: ${error.message}`);
                    await this.sleep(intervalMs);
                }
            }

            logger.info('[JobQueueService] Worker detenido');
        };

        // Ejecutar el loop de forma asíncrona
        processLoop();
    }

    /**
     * Detiene el worker
     */
    stopWorker() {
        logger.info('[JobQueueService] Deteniendo worker...');
        this.isProcessing = false;
        this.shouldStop = true;
    }

    /**
     * Cancela un job específico
     */
    async cancelJob(jobId) {
        if (this.currentJobId === jobId) {
            this.shouldStop = true;
        }
        return await this.jobQueueModel.cancel(jobId);
    }

    /**
     * Obtiene el estado de un job
     */
    async getJobStatus(jobId) {
        return await this.jobQueueModel.getById(jobId);
    }

    /**
     * Obtiene estadísticas de la cola
     */
    async getQueueStats() {
        const pending = await this.jobQueueModel.countPending();
        const processing = await this.jobQueueModel.countProcessing();
        return {
            pending,
            processing,
            workerRunning: this.isProcessing,
            currentJobId: this.currentJobId
        };
    }
}

// Singleton
module.exports = new JobQueueService();
