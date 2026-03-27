const LlamadaModel = require("../../models/llamada.model.js");
const EstadoLlamadaAsteriskModel = require("../../models/estadoLlamadaAsterisk.model.js");
const logger = require('../../config/logger/loggerClient.js');
const llamadaService = require('../../services/llamada/llamada.service.js');
const s3Service = require('../../services/s3.service.js');
const sentimientoService = require('../../services/analisis/sentimiento.service.js');

class LlamadaController {
    async getAll(req, res) {
        try {
            const { idEmpresa } = req.user;
            const llamadaModel = new LlamadaModel();
            const llamadas = await llamadaModel.getAll(idEmpresa);
            return res.status(200).json({ data: llamadas });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al obtener llamadas: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener llamadas" });
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const llamadaModel = new LlamadaModel();
            const llamada = await llamadaModel.getById(id);

            if (!llamada) {
                return res.status(404).json({ msg: "Llamada no encontrada" });
            }

            return res.status(200).json({ data: llamada });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al obtener llamada por ID: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener llamada" });
        }
    }

    async getByProviderCallId(req, res) {
        try {
            const { providerCallId } = req.params;
            const llamadaModel = new LlamadaModel();
            const llamada = await llamadaModel.getByProviderCallId(providerCallId);

            if (!llamada) {
                return res.status(404).json({ msg: "Llamada no encontrada" });
            }

            return res.status(200).json({ data: llamada });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al obtener llamada por provider_call_id: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener llamada" });
        }
    }

    async getByCampania(req, res) {
        try {
            const { idCampania } = req.params;
            const llamadaModel = new LlamadaModel();
            const llamadas = await llamadaModel.getByCampania(idCampania);
            return res.status(200).json({ data: llamadas });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al obtener llamadas por campania: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener llamadas por campania" });
        }
    }

    async getByCampaniaEjecucion(req, res) {
        try {
            const { idCampaniaEjecucion } = req.params;
            const llamadaModel = new LlamadaModel();
            const llamadas = await llamadaModel.getByCampaniaEjecucion(idCampaniaEjecucion);
            return res.status(200).json({ data: llamadas });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al obtener llamadas por ejecucion: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener llamadas por ejecucion" });
        }
    }

    async create(req, res) {
        try {
            const { idEmpresa, userId } = req.user;
            const { id_campania, id_base_numero, id_base_numero_detalle, provider_call_id } = req.body;

            if (!id_campania || !id_base_numero || !provider_call_id) {
                return res.status(400).json({ msg: "Los campos id_campania, id_base_numero y provider_call_id son requeridos" });
            }
            const llamadaModel = new LlamadaModel();
            const id = await llamadaModel.create({
                id_empresa: idEmpresa,
                id_campania,
                id_base_numero,
                id_base_numero_detalle,
                provider_call_id,
                usuario_registro: userId
            });

            return res.status(201).json({ msg: "Llamada creada exitosamente", data: { id } });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al crear llamada: ${error.message}`);
            return res.status(500).json({ msg: "Error al crear llamada" });
        }
    }

    async actualizarTipificacion(req, res) {
        try {
            const { provider_call_id, id_tipificacion_llamada } = req.body;

            if (!provider_call_id || !id_tipificacion_llamada) {
                return res.status(400).json({ msg: "Los campos provider_call_id e id_tipificacion_llamada son requeridos" });
            }

            const llamadaModel = new LlamadaModel();
            await llamadaModel.actualizarTipificacion(provider_call_id, id_tipificacion_llamada);

            return res.status(200).json({ msg: "Tipificacion actualizada exitosamente" });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al actualizar tipificacion: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar tipificacion" });
        }
    }

    async actualizarEstado(req, res) {
        try {
            const { provider_call_id, id_estado_llamada } = req.body;

            if (!provider_call_id || !id_estado_llamada) {
                return res.status(400).json({ msg: "Los campos provider_call_id e id_estado_llamada son requeridos" });
            }

            const llamadaModel = new LlamadaModel();
            const data = await llamadaModel.actualizarEstadoLlamada(provider_call_id, id_estado_llamada);

            return res.status(200).json({ msg: "Estado actualizada exitosamente", data: data });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al actualizar estado: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar estado" });
        }
    }

    async uploadAudio(req, res) {
        try {
            const { id_llamada, duracion_seg, segundos } = req.body;
            const duracion = duracion_seg || segundos || null;

            if (!req.file) {
                return res.status(400).json({ msg: "No se proporcionó ningún archivo de audio" });
            }

            if (!id_llamada) {
                return res.status(400).json({ msg: "El campo id_llamada es requerido" });
            }

            const llamadaModel = new LlamadaModel();
            const estadoAsteriskModel = new EstadoLlamadaAsteriskModel();

            // Buscar la llamada por id_llamada
            const llamada = await llamadaModel.getById(id_llamada);

            if (!llamada) {
                return res.status(404).json({ msg: "No se encontró llamada con ese id_llamada" });
            }

            // Buscar el estado COMPLETED en estado_llamada_asterisk
            const estadoCompleted = await estadoAsteriskModel.getByCodigo('COMPLETED');

            // Subir audio a S3 con folder 'llamadas' usando id_empresa de la llamada
            const archivo_llamada = await s3Service.uploadFile(req.file, 'llamadas', llamada.id_empresa);

            // Actualizar la llamada con el archivo de audio, estado COMPLETED y duración directamente por id
            const [result] = await llamadaModel.connection.execute(
                `UPDATE llamada SET archivo_llamada = $1, id_estado_llamada_asterisk = $2, duracion_seg = $3 WHERE id = $4`,
                [archivo_llamada, estadoCompleted?.id || null, duracion ? parseInt(duracion) : null, id_llamada]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ msg: "No se pudo actualizar la llamada" });
            }

            logger.info(`[llamada.controller.js] uploadAudio: Audio subido para id_llamada=${id_llamada}, duracion_seg=${duracion}`);

            return res.status(200).json({
                msg: "Audio subido exitosamente",
                data: {
                    id_llamada: parseInt(id_llamada),
                    archivo_llamada,
                    id_estado_llamada_asterisk: estadoCompleted?.id || null,
                    duracion_seg: duracion ? parseInt(duracion) : null
                }
            });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al subir audio: ${error.message}`);
            return res.status(500).json({ msg: "Error al subir audio de llamada" });
        }
    }

    async guardarTranscripcion(req, res) {
        try {
            // Acepta tanto "metadata" como "metadata_ultravox_call"
            const { id_llamada, id_ultravox_call, metadata_ultravox_call, metadata, transcripcion } = req.body;
            const metadataInput = metadata_ultravox_call || metadata;

            logger.info(`[llamada.controller.js] Guardando transcripción para id_llamada: ${id_llamada}`);

            if (!id_llamada) {
                return res.status(400).json({ msg: "El campo id_llamada es requerido" });
            }

            const llamadaModel = new LlamadaModel();
            const TranscripcionModel = require("../../models/transcripcion.model.js");
            const transcripcionModel = new TranscripcionModel();

            // Obtener la llamada a partir del id_llamada
            const llamada = await llamadaModel.getById(id_llamada);

            if (!llamada) {
                logger.warn(`[llamada.controller.js] No se encontró llamada con id_llamada: ${id_llamada}`);
                return res.status(404).json({ msg: "No se encontró llamada con ese id_llamada" });
            }

            logger.info(`[llamada.controller.js] Procesando transcripción para llamada id: ${id_llamada}`);

            // Convertir metadata a string JSON si viene como objeto
            let metadataString = null;
            if (metadataInput) {
                if (typeof metadataInput === 'string') {
                    metadataString = metadataInput;
                } else {
                    metadataString = JSON.stringify(metadataInput);
                }
            }

            await llamadaModel.actualizarMetadataUltravox(id_llamada, {
                id_ultravox_call: id_ultravox_call || null,
                metadata_ultravox_call: metadataString
            });

            // Guardar transcripción si viene
            if (transcripcion && Array.isArray(transcripcion) && transcripcion.length > 0) {
                // Insertar cada mensaje de la transcripción
                for (const mensaje of transcripcion) {
                    // Mapear role: MESSAGE_ROLE_AGENT -> ai, MESSAGE_ROLE_USER -> humano
                    let speaker = 'sistema';
                    if (mensaje.role === 'MESSAGE_ROLE_AGENT' || mensaje.role === 'agent') speaker = 'ai';
                    else if (mensaje.role === 'MESSAGE_ROLE_USER' || mensaje.role === 'user') speaker = 'humano';

                    // Usar callStageMessageIndex como ordinal si no viene ordinal
                    const ordinal = mensaje.ordinal !== undefined
                        ? mensaje.ordinal
                        : (mensaje.callStageMessageIndex !== undefined ? mensaje.callStageMessageIndex : null);

                    await transcripcionModel.create({
                        id_llamada,
                        speaker,
                        texto: mensaje.text || '',
                        ordinal
                    });
                }
            }

            // Disparar análisis de sentimiento de forma asíncrona (no bloquea la respuesta)
            if (transcripcion && transcripcion.length > 0) {
                const transcripcionParaAnalisis = await transcripcionModel.getByLlamada(id_llamada);
                sentimientoService.analizarLlamada(id_llamada, transcripcionParaAnalisis, llamada.id_empresa)
                    .catch(err => logger.error(`[llamada.controller.js] Error en análisis de sentimiento async: ${err.message}`));
            }

            return res.status(200).json({
                msg: "Transcripción guardada exitosamente",
                data: {
                    id_llamada,
                    id_ultravox_call,
                    transcripcion_count: transcripcion ? transcripcion.length : 0
                }
            });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al guardar transcripción: ${error.message}`);
            logger.error(`[llamada.controller.js] Stack: ${error.stack}`);
            return res.status(500).json({ msg: "Error al guardar transcripción", error: error.message });
        }
    }

    async callNoContesta(req, res) {
        try {
            const { provider_call_id, id_llamada, status } = req.body;

            if (!id_llamada || !status) {
                return res.status(400).json({ msg: "Los campos id_llamada y status son requeridos" });
            }

            const llamadaModel = new LlamadaModel();
            const estadoAsteriskModel = new EstadoLlamadaAsteriskModel();

            // Buscar la llamada por id_llamada directamente
            const llamada = await llamadaModel.getById(id_llamada);

            if (!llamada) {
                logger.warn(`[llamada.controller.js] callNoContesta: No se encontró llamada con id_llamada: ${id_llamada}`);
                return res.status(404).json({ msg: "No se encontró llamada con ese id_llamada" });
            }

            // Vincular el provider_call_id si no lo tiene
            if (!llamada.provider_call_id && provider_call_id) {
                await llamadaModel.actualizarProviderCallId(id_llamada, provider_call_id);
                logger.info(`[llamada.controller.js] callNoContesta: Llamada ${id_llamada} vinculada con provider_call_id ${provider_call_id}`);
            }

            // Buscar el estado de Asterisk por código (opcional)
            const estadoAsterisk = await estadoAsteriskModel.getByCodigo(status);
            if (!estadoAsterisk) {
                logger.warn(`[llamada.controller.js] callNoContesta: No se encontró estado Asterisk con código: ${status}, se actualizará sin id_estado_llamada_asterisk`);
            }

            // Actualizar la llamada directamente por id: id_estado_llamada = 3 (Fallida)
            const [result] = await llamadaModel.connection.execute(
                `UPDATE llamada SET id_estado_llamada = 3, id_estado_llamada_asterisk = $1, id_tipificacion_llamada = 240, fecha_inicio = CURRENT_TIMESTAMP WHERE id = $2`,
                [estadoAsterisk ? estadoAsterisk.id : null, id_llamada]
            );

            if (result.affectedRows === 0) {
                return res.status(500).json({ msg: "No se pudo actualizar el estado de la llamada" });
            }

            logger.info(`[llamada.controller.js] callNoContesta: Llamada ${id_llamada} actualizada - estado_llamada=3, estado_asterisk=${status}(${estadoAsterisk ? estadoAsterisk.id : 'null'})`);

            return res.status(200).json({
                msg: "Estado de llamada actualizado exitosamente",
                data: {
                    provider_call_id: provider_call_id || llamada.provider_call_id,
                    id_llamada: parseInt(id_llamada),
                    id_estado_llamada: 3,
                    id_estado_llamada_asterisk: estadoAsterisk ? estadoAsterisk.id : null,
                    status
                }
            });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error en callNoContesta: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar estado de llamada" });
        }
    }

    async callEntrada(req, res) {
        try {
            const { provider_call_id, id_llamada } = req.body;

            if (!provider_call_id || !id_llamada) {
                return res.status(400).json({ msg: "Los campos provider_call_id e id_llamada son requeridos" });
            }

            const llamadaModel = new LlamadaModel();

            // Buscar la llamada por id_llamada directamente
            const llamada = await llamadaModel.getById(id_llamada);

            if (!llamada) {
                logger.warn(`[llamada.controller.js] callEntrada: No se encontró llamada con id_llamada: ${id_llamada}`);
                return res.status(404).json({ msg: "No se encontró llamada con ese id_llamada" });
            }

            // Actualizar estado a 2 (En curso), fecha_inicio y vincular provider_call_id
            const [result] = await llamadaModel.connection.execute(
                `UPDATE llamada
                SET id_estado_llamada = 2,
                    fecha_inicio = CURRENT_TIMESTAMP,
                    provider_call_id = ?
                WHERE id = ?`,
                [provider_call_id, id_llamada]
            );

            if (result.affectedRows === 0) {
                logger.warn(`[llamada.controller.js] callEntrada: No se pudo actualizar llamada ${id_llamada}`);
                return res.status(500).json({ msg: "No se pudo actualizar la llamada" });
            }

            logger.info(`[llamada.controller.js] callEntrada: Llamada ${id_llamada} iniciada - estado=2, provider_call_id=${provider_call_id}`);

            return res.status(200).json({
                msg: "Llamada iniciada exitosamente",
                data: {
                    provider_call_id,
                    id_llamada: parseInt(id_llamada),
                    id_estado_llamada: 2
                }
            });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error en callEntrada: ${error.message}`);
            return res.status(500).json({ msg: "Error al iniciar llamada" });
        }
    }

    async callTerminada(req, res) {
        try {
            const { provider_call_id, id_llamada } = req.body;

            if (!provider_call_id && !id_llamada) {
                return res.status(400).json({ msg: "Se requiere provider_call_id o id_llamada" });
            }

            const llamadaModel = new LlamadaModel();
            let llamada = null;

            // Buscar por provider_call_id si viene, sino por id_llamada
            if (provider_call_id) {
                llamada = await llamadaModel.getByProviderCallId(provider_call_id);
            }

            if (!llamada && id_llamada) {
                llamada = await llamadaModel.getById(id_llamada);

                // Vincular provider_call_id si viene y la llamada no lo tiene
                if (llamada && provider_call_id && !llamada.provider_call_id) {
                    await llamadaModel.actualizarProviderCallId(id_llamada, provider_call_id);
                    logger.info(`[llamada.controller.js] callTerminada: Llamada ${id_llamada} vinculada con provider_call_id ${provider_call_id}`);
                }
            }

            if (!llamada) {
                logger.warn(`[llamada.controller.js] callTerminada: No se encontró llamada - provider_call_id: ${provider_call_id}, id_llamada: ${id_llamada}`);
                return res.status(404).json({ msg: "No se encontró llamada" });
            }

            // Actualizar estado a 4 (Completada) y fecha_fin directamente por id
            const [result] = await llamadaModel.connection.execute(
                `UPDATE llamada SET id_estado_llamada = 4, fecha_fin = CURRENT_TIMESTAMP WHERE id = $1`,
                [llamada.id]
            );

            if (result.affectedRows === 0) {
                return res.status(500).json({ msg: "No se pudo actualizar el estado de la llamada" });
            }

            logger.info(`[llamada.controller.js] callTerminada: Llamada ${llamada.id} terminada - estado=4, fecha_fin=NOW`);

            return res.status(200).json({
                msg: "Llamada terminada exitosamente",
                data: {
                    provider_call_id: provider_call_id || llamada.provider_call_id,
                    id_llamada: llamada.id || parseInt(id_llamada),
                    id_estado_llamada: 4
                }
            });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error en callTerminada: ${error.message}`);
            return res.status(500).json({ msg: "Error al terminar llamada" });
        }
    }

    async actualizarEstadoAsterisk(req, res) {
        try {
            const {
                provider_call_id,
                status,
                cause,
                cause_text,
                duration,
                answered,
                timestamp
            } = req.body;

            logger.info(`[llamada.controller.js] Webhook estado Asterisk: provider_call_id=${provider_call_id}, status=${status}, cause=${cause}`);

            if (!provider_call_id) {
                return res.status(400).json({ msg: "El campo provider_call_id es requerido" });
            }

            if (!status) {
                return res.status(400).json({ msg: "El campo status es requerido" });
            }

            const llamadaModel = new LlamadaModel();
            const estadoAsteriskModel = new EstadoLlamadaAsteriskModel();

            // Buscar la llamada
            const llamada = await llamadaModel.getByProviderCallId(provider_call_id);
            if (!llamada) {
                logger.warn(`[llamada.controller.js] No se encontró llamada con provider_call_id: ${provider_call_id}`);
                return res.status(404).json({ msg: "No se encontró llamada con ese provider_call_id" });
            }

            // Si el status es ANSWER, iniciar la llamada (estado 2 + fecha_inicio) y devolver config
            if (status === 'ANSWER') {
                const updated = await llamadaModel.iniciarLlamada(provider_call_id);

                if (!updated) {
                    logger.warn(`[llamada.controller.js] No se pudo iniciar llamada ${provider_call_id} (ya iniciada o no existe)`);
                }

                // Obtener configuración completa de la llamada
                const config = await llamadaModel.getConfigByProviderCallId(provider_call_id);

                // Obtener tipificaciones de la empresa
                const TipificacionModel = require("../../models/tipificacion_llamada.model.js");
                const tipificaciones = await TipificacionModel.getAll(llamada.id_empresa);

                // Obtener tools de la plantilla si existe
                let tools = [];
                if (config?.id_plantilla) {
                    const PlantillaModel = require("../../models/plantilla.model.js");
                    const plantillaModel = new PlantillaModel();
                    tools = await plantillaModel.getTools(config.id_plantilla);
                }

                // Construir tool_ruta (primera tool si existe)
                const toolRuta = tools.length > 0 ? tools[0].ruta : null;

                logger.info(`[llamada.controller.js] Llamada ${provider_call_id} iniciada (ANSWER): estado_llamada=2, fecha_inicio=NOW`);

                return res.status(200).json({
                    msg: "Llamada iniciada exitosamente",
                    data: {
                        provider_call_id,
                        id_llamada: llamada.id,
                        status: 'ANSWER',
                        id_estado_llamada: 2,
                        contacto: {
                            nombre_completo: config?.contacto_nombre || null,
                            celular: config?.telefono || null,
                            numero_documento: config?.numero_documento || null,
                            ...(config?.json_adicional || {})
                        },
                        extras: {
                            voice: config?.voice_code || null,
                            tipificaciones,
                            prompt: config?.prompt || null,
                            tool_ruta: toolRuta,
                            canal: config?.canal || null,
                            empresa: {
                                id: llamada.id_empresa,
                                nombre: config?.empresa_nombre || null
                            }
                        }
                    }
                });
            }

            // Buscar el estado de Asterisk por código
            const estadoAsterisk = await estadoAsteriskModel.getByCodigo(status);
            if (!estadoAsterisk) {
                logger.warn(`[llamada.controller.js] No se encontró estado Asterisk con código: ${status}`);
                return res.status(404).json({ msg: `No se encontró estado Asterisk con código: ${status}` });
            }

            // Estados de error (llamada no conectó) -> id_estado_llamada = 3 (Fallida/No contestada)
            const id_estado_llamada = 3;

            // Actualizar la llamada (no se actualiza duracion_seg ni fecha_fin)
            const updated = await llamadaModel.actualizarEstadoAsterisk(provider_call_id, {
                id_estado_llamada_asterisk: estadoAsterisk.id,
                id_estado_llamada,
                duracion_seg: null,
                fecha_fin: null
            });

            if (!updated) {
                return res.status(500).json({ msg: "No se pudo actualizar la llamada" });
            }

            logger.info(`[llamada.controller.js] Llamada ${provider_call_id} actualizada: estado_asterisk=${status}(${estadoAsterisk.id}), estado_llamada=${id_estado_llamada}`);

            return res.status(200).json({
                msg: "Estado de llamada actualizado exitosamente",
                data: {
                    provider_call_id,
                    id_llamada: llamada.id,
                    status,
                    id_estado_llamada_asterisk: estadoAsterisk.id,
                    id_estado_llamada
                }
            });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al actualizar estado Asterisk: ${error.message}`);
            logger.error(`[llamada.controller.js] Stack: ${error.stack}`);
            return res.status(500).json({ msg: "Error al actualizar estado de llamada", error: error.message });
        }
    }
}

module.exports = new LlamadaController();
