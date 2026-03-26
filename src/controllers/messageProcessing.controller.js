const AssistantService = require("../services/assistant/asistant.service");
const WhatsappGraphService = require("../services/whatsapp/whatsappGraph.service.js");
const Persona = require("../models/persona.model.js");
const Usuario = require("../models/usuario.model.js");
const Chat = require("../models/chat.model.js");
const Mensaje = require("../models/mensaje.model.js");
const ConfiguracionWhatsapp = require("../models/configuracionWhatsapp.model.js");
const websocketNotifier = require("../services/websocketNotifier.service.js");
const s3Service = require("../services/s3.service.js");
const logger = require("../config/logger/loggerClient");

class MessageProcessingController {

    /**
     * Procesa un mensaje entrante de WhatsApp, genera respuesta con el asistente
     * y envía la respuesta por WhatsApp. Notifica al WebSocket en ambos casos.
     */
    async processMessage(req, res) {
        try {
            const { phone, question, wid, phone_number_id, messageType, files } = req.body;

            if (!phone || !phone_number_id) {
                return res.serverError(400, "Campos requeridos: phone, phone_number_id");
            }

            let phoneTrimmed = phone.trim().replace(/[\s\-\(\)\+]/g, '');
            if (phoneTrimmed.startsWith('0')) phoneTrimmed = phoneTrimmed.substring(1);
            if (phoneTrimmed.length <= 9) phoneTrimmed = '51' + phoneTrimmed;
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
                    id_usuario: id_asesor,
                    id_empresa: empresaId,
                    usuario_registro: null
                });
            }
            // logger.info(`[messageProcessing.controller.js] Datos persona ${JSON.stringify(persona)}`);

            let chat = await Chat.findByPersona(persona.id);
            if (!chat) {
                chat = await Chat.create({
                    id_empresa: empresaId,
                    id_persona: persona.id,
                    usuario_registro: null
                });
            }

            // Procesar archivos entrantes (descargar media de WhatsApp y subir a S3)
            let contenidoArchivo = null;
            if (archivos.length > 0) {
                const archivo = archivos[0];
                if (archivo.url) {
                    contenidoArchivo = archivo.url;
                } else if (archivo.media_id || archivo.id) {
                    try {
                        const mediaId = archivo.media_id || archivo.id;
                        const media = await WhatsappGraphService.descargarMedia(empresaId, mediaId);
                        const fakeFile = {
                            buffer: media.buffer,
                            mimetype: media.contentType,
                            originalname: `whatsapp_${Date.now()}${media.extension}`
                        };
                        contenidoArchivo = await s3Service.uploadFile(fakeFile, 'chat-incoming', empresaId);
                        logger.info(`[messageProcessing] Media ${mediaId} subido a S3: ${contenidoArchivo}`);
                    } catch (mediaError) {
                        logger.error(`[messageProcessing] Error descargando media: ${mediaError.message}`);
                    }
                }
            }

            // Guardar mensaje entrante
            const fechaEntrante = new Date();
            await Mensaje.create({
                id_chat: chat.id || chat,
                contenido: questionTrimmed || (contenidoArchivo ? `[${tipoMensaje}]` : null),
                contenido_archivo: contenidoArchivo,
                direccion: "in",
                wid_mensaje: widTrimmed,
                tipo_mensaje: tipoMensaje,
                fecha_hora: fechaEntrante,
                usuario_registro: null
            });

            // Notificar al WebSocket sobre mensaje entrante (usa chat.id como id_contacto)
            const chatId = chat.id || chat;
            websocketNotifier.notificarMensajeEntrante(chatId, {
                id_contacto: chatId,
                contenido: questionTrimmed,
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

            // Construir mensaje para el asistente incluyendo archivos si existen
            let messageForAssistant = questionTrimmed;
            if (archivos.length > 0) {
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
            logger.error(`[messageProcessing.controller.js] Error: ${error.message}`);
            return res.serverError(500, "Error Interno en el servidor");
        }
    }

}

module.exports = new MessageProcessingController();
