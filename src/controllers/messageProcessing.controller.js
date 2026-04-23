const AssistantService = require("../services/assistant/asistant.service");
const WhatsappGraphService = require("../services/whatsapp/whatsappGraph.service.js");
const Persona = require("../models/persona.model.js");
const Usuario = require("../models/usuario.model.js");
const Chat = require("../models/chat.model.js");
const Mensaje = require("../models/mensaje.model.js");
const ConfiguracionWhatsapp = require("../models/configuracionWhatsapp.model.js");
const websocketNotifier = require("../services/websocketNotifier.service.js");
const transcriptionService = require("../services/transcription/transcription.service.js");
const { normalizarCelular } = require("../utils/phone.js");
const logger = require("../config/logger/loggerClient");
const { setContextField } = require("../config/logger/traceContext");

class MessageProcessingController {

    /**
     * Procesa un mensaje entrante de WhatsApp, genera respuesta con el asistente
     * y envía la respuesta por WhatsApp. Notifica al WebSocket en ambos casos.
     */
    async processMessage(req, res) {
        try {
            const { phone, question, wid, phone_number_id, pushName, messageType, files } = req.body;

            if (!phone || !phone_number_id) {
                return res.serverError(400, "Campos requeridos: phone, phone_number_id");
            }

            const phoneTrimmed = normalizarCelular(phone);
            const questionTrimmed = (question || '').trim();
            const widTrimmed = wid ? wid.trim() : null;
            const tipoMensaje = messageType || "texto";
            const archivos = Array.isArray(files) ? files : [];


            // Resolver id_empresa a partir del phone_number_id en configuracion_whatsapp
            const configWhatsapp = await ConfiguracionWhatsapp.getByPhoneNumberId(phone_number_id);
            if (!configWhatsapp) {
                logger.error(`[messageProcessing.controller.js] No se encontró configuración para phone_number_id: ${phone_number_id}`);
                return res.serverError(400, "No se encontró configuración WhatsApp para el phone_number_id proporcionado");
            }
            const empresaId = configWhatsapp.id_empresa;
            setContextField('empresaId', empresaId);

            let persona = await Persona.selectByCelular(phoneTrimmed, empresaId);

            if (!persona) {
                const usuarioInstance = new Usuario();
                const asesores = await usuarioInstance.getByRol(3);
                const ids = asesores.map(a => a.id);

                const ultimoAsignacion = await Persona.getAsignacionesAsesor();

                let id_asesor = null;
                if (ids.length > 0) {
                    if (ultimoAsignacion?.id_usuario) {
                        const indice = (ids.indexOf(ultimoAsignacion.id_usuario) + 1) % ids.length;
                        id_asesor = ids[indice];
                    } else {
                        id_asesor = ids[0];
                    }
                }

                persona = await Persona.createPersona({
                    id_estado: 1,
                    celular: phoneTrimmed,
                    nombre: pushName || 'Sin Registrar',
                    id_usuario: id_asesor,
                    id_empresa: empresaId,
                    usuario_registro: null
                });
            }
            setContextField('phone', phoneTrimmed);
            setContextField('personaId', persona.id);
            setContextField('nombre', persona.nombre_completo || persona.nombre || 'Sin nombre');
            // logger.info(`[messageProcessing.controller.js] Datos persona ${JSON.stringify(persona)}`);
            if (question === "No contactar") {
                await Persona.updatePersona(persona.id, { lista_negra: true });
                logger.info(`[messageProcessing.controller.js] Persona con numero ${phone} actualizado en lista negra`);
                return res.success(200, "Persona marcada en lista negra", { lista_negra: true });
            }


            let chat = await Chat.findByPersona(persona.id);
            if (!chat) {
                chat = await Chat.create({
                    id_empresa: empresaId,
                    id_persona: persona.id,
                    usuario_registro: null
                });
            }

            // Obtener URL del archivo (ya viene de S3 via ws_trigger.php)
            let contenidoArchivo = archivos.length > 0 ? archivos[0].url : null;

            // Transcribir audio a texto si el mensaje es de tipo audio/voz
            let textoTranscrito = null;
            const esAudio = ['audio', 'voice', 'ptt'].includes(tipoMensaje);

            if (esAudio && contenidoArchivo) {
                try {
                    textoTranscrito = await transcriptionService.transcribeFromUrl(contenidoArchivo);
                    logger.info(`[messageProcessing] Audio transcrito: "${textoTranscrito.substring(0, 100)}"`);
                } catch (transcriptionError) {
                    logger.error(`[messageProcessing] Error transcribiendo audio: ${transcriptionError.message}`);
                }
            }

            // El contenido del mensaje es: texto transcrito > texto enviado > placeholder
            const contenidoMensaje = textoTranscrito || questionTrimmed || (contenidoArchivo ? `[${tipoMensaje}]` : null);
            logger.info('[Mensaje] entrante', { texto: contenidoMensaje, tipo: tipoMensaje });

            // Guardar mensaje entrante con el texto transcrito
            const fechaEntrante = new Date();
            await Mensaje.create({
                id_chat: chat.id || chat,
                contenido: contenidoMensaje,
                contenido_archivo: contenidoArchivo,
                direccion: "in",
                wid_mensaje: widTrimmed,
                tipo_mensaje: tipoMensaje,
                fecha_hora: fechaEntrante,
                usuario_registro: null
            });

            // Notificar al WebSocket sobre mensaje entrante (usa chat.id como id_contacto)
            const chatId = chat.id || chat;
            setContextField('chatId', chatId);
            websocketNotifier.notificarMensajeEntrante(chatId, {
                id_contacto: chatId,
                contenido: contenidoMensaje,
                contenido_archivo: contenidoArchivo,
                direccion: "in",
                wid_mensaje: widTrimmed,
                tipo: tipoMensaje,
                fecha_hora: fechaEntrante.toISOString()
            });

            // Verificar si el bot esta activo para este chat
            const chatData = await Chat.findById(chatId);
            if (chatData && chatData.bot_activo === 0) {
                logger.info(`[messageProcessing] Bot desactivado para chat ${chatId}, no se genera respuesta`);
                return res.success(200, "Mensaje guardado (bot desactivado)", { bot_activo: false });
            }

            // Construir mensaje para el asistente: si fue audio transcrito, usar el texto transcrito
            let messageForAssistant = textoTranscrito || questionTrimmed;
            if (!textoTranscrito && archivos.length > 0) {
                const fileDescriptions = archivos.map(f => `[Archivo: ${f.type || 'archivo'} - ${f.url || contenidoArchivo || ''}]`).join('\n');
                messageForAssistant = `${fileDescriptions}\n${questionTrimmed}`.trim();
            }
            if (!messageForAssistant) {
                messageForAssistant = `[El usuario envio un archivo de tipo ${tipoMensaje}]`;
            }

            // Procesar con el asistente
            const resultado = await AssistantService.runProcess({
                chatId: chat.id || chat,
                message: messageForAssistant,
                persona: persona,
                id_empresa: empresaId
            });

            const respuestaTexto = resultado.content;
            logger.info('[Mensaje] saliente', { texto: respuestaTexto });

            // Enviar respuesta por WhatsApp
            let widRespuesta = null;
            try {
                const envio = await WhatsappGraphService.enviarMensajeTexto(empresaId, phoneTrimmed, respuestaTexto);
                widRespuesta = envio.wid_mensaje;
                logger.info(`[messageProcessing.controller.js] Mensaje enviado por WhatsApp, wid: ${widRespuesta}`);
            } catch (whatsappError) {
                logger.error(`[messageProcessing.controller.js] Error enviando WhatsApp: ${whatsappError.message}`);
            }

            // Guardar mensaje saliente
            const fechaSaliente = new Date();
            await Mensaje.create({
                id_chat: chat.id || chat,
                contenido: respuestaTexto,
                direccion: "out",
                wid_mensaje: widRespuesta || widTrimmed,
                tipo_mensaje: "texto",
                fecha_hora: fechaSaliente,
                usuario_registro: null
            });

            // Notificar al WebSocket sobre mensaje saliente
            websocketNotifier.notificarMensajeSaliente(chatId, {
                id_contacto: chatId,
                contenido: respuestaTexto,
                direccion: "out",
                wid_mensaje: widRespuesta || widTrimmed,
                tipo: "texto",
                fecha_hora: fechaSaliente.toISOString()
            });

            // Retornar respuesta
            return res.success(200, "Mensaje procesado correctamente", {
                respuesta: respuestaTexto
            });

        } catch (error) {
            logger.error('[messageProcessing] Error', { stack: error.stack });
            return res.serverError(500, "Error Interno en el servidor");
        }
    }

    /**
     * Actualiza el estado_entrega de un mensaje según su wid_mensaje.
     * Llamado por el webhook PHP de Maravia.
     * Body: { wid_mensaje, estado_entrega }
     */
    async updateMessageStatus(req, res) {
        try {
            const { wid_mensaje, estado_entrega } = req.body;

            if (!wid_mensaje || estado_entrega === undefined) {
                return res.clientError(400, "Campos requeridos: wid_mensaje, estado_entrega");
            }

            const affected = await Mensaje.updateEstadoEntrega(wid_mensaje, estado_entrega);

            if (affected === 0) {
                return res.clientError(404, "Mensaje no encontrado");
            }

            return res.success(200, "Estado de entrega actualizado", { wid_mensaje, estado_entrega });

        } catch (error) {
            logger.error('[messageProcessing] Error en updateMessageStatus', { stack: error.stack });
            return res.serverError(500, "Error interno en el servidor");
        }
    }

}

module.exports = new MessageProcessingController();
