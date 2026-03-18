const LlamadaModel = require("../../models/llamada.model.js");
const logger = require('../../config/logger/loggerClient.js');
const llamadaService = require('../../services/llamada/llamada.service.js');
const s3Service = require('../../services/s3.service.js');

// Función para obtener fecha en formato MySQL con zona horaria Lima, Perú
const getFechaLima = () => {
    const options = {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-CA', options);
    const parts = formatter.formatToParts(new Date());
    const get = (type) => parts.find(p => p.type === type)?.value || '00';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
};

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
            const { provider_call_id } = req.body;

            if (!req.file) {
                return res.status(400).json({ msg: "No se proporcionó ningún archivo de audio" });
            }

            if (!provider_call_id) {
                return res.status(400).json({ msg: "El campo provider_call_id es requerido" });
            }

            const llamadaModel = new LlamadaModel();

            // Buscar la llamada por provider_call_id
            const llamada = await llamadaModel.getByProviderCallId(provider_call_id);

            if (!llamada) {
                return res.status(404).json({ msg: "No se encontró llamada con ese provider_call_id" });
            }

            // Subir audio a S3 con folder 'llamadas' usando id_empresa de la llamada
            const archivo_llamada = await s3Service.uploadFile(req.file, 'llamadas', llamada.id_empresa);

            // Actualizar la llamada con el archivo de audio usando provider_call_id
            const updated = await llamadaModel.actualizarAudioLlamadaPorProvider(provider_call_id, {
                archivo_llamada
            });

            if (!updated) {
                return res.status(404).json({ msg: "No se pudo actualizar la llamada" });
            }

            return res.status(200).json({
                msg: "Audio subido exitosamente",
                data: {
                    provider_call_id,
                    id_llamada: llamada.id,
                    archivo_llamada
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
            const { provider_call_id, id_ultravox_call, metadata_ultravox_call, metadata, transcripcion } = req.body;
            const metadataInput = metadata_ultravox_call || metadata;

            logger.info(`[llamada.controller.js] Guardando transcripción para provider_call_id: ${provider_call_id}`);

            if (!provider_call_id) {
                return res.status(400).json({ msg: "El campo provider_call_id es requerido" });
            }

            const llamadaModel = new LlamadaModel();
            const TranscripcionModel = require("../../models/transcripcion.model.js");
            const transcripcionModel = new TranscripcionModel();

            // Obtener la llamada a partir del provider_call_id
            const llamada = await llamadaModel.getByProviderCallId(provider_call_id);

            if (!llamada) {
                logger.warn(`[llamada.controller.js] No se encontró llamada con provider_call_id: ${provider_call_id}`);
                return res.status(404).json({ msg: "No se encontró llamada con ese provider_call_id" });
            }

            const id_llamada = llamada.id;
            logger.info(`[llamada.controller.js] Encontrada llamada con id: ${id_llamada}`);

            // Actualizar la llamada con id_ultravox_call, metadata, fecha_fin y duracion_seg
            // Convertir metadata a string JSON si viene como objeto
            let metadataString = null;
            if (metadataInput) {
                if (typeof metadataInput === 'string') {
                    metadataString = metadataInput;
                } else {
                    metadataString = JSON.stringify(metadataInput);
                }
            }

            // Fecha fin es CURRENT_TIMESTAMP al momento de guardar la transcripción (zona horaria Lima, Perú UTC-5)
            const fecha_fin = getFechaLima();

            // Calcular duracion_seg a partir de fecha_inicio y fecha_fin
            let duracion_seg = null;
            if (llamada.fecha_inicio) {
                const fecha_inicio = new Date(llamada.fecha_inicio);
                const fecha_fin_date = new Date(fecha_fin);
                duracion_seg = Math.round((fecha_fin_date - fecha_inicio) / 1000);
                if (duracion_seg < 0) duracion_seg = 0;
            }

            logger.info(`[llamada.controller.js] Calculando duracion_seg: ${duracion_seg}s (fecha_inicio: ${llamada.fecha_inicio}, fecha_fin: ${fecha_fin})`);

            await llamadaModel.actualizarMetadataUltravox(id_llamada, {
                id_ultravox_call: id_ultravox_call || null,
                metadata_ultravox_call: metadataString,
                fecha_fin,
                duracion_seg
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

            return res.status(200).json({
                msg: "Transcripción guardada exitosamente",
                data: {
                    provider_call_id,
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
}

module.exports = new LlamadaController();
