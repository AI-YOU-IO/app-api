const AssistantService = require("../services/assistant/asistant.service");
const WhatsappGraphService = require("../services/whatsapp/whatsappGraph.service.js");
const Persona = require("../models/persona.model.js");
const Usuario = require("../models/usuario.model.js");
const Chat = require("../models/chat.model.js");
const Mensaje = require("../models/mensaje.model.js");
const ConfiguracionWhatsapp = require("../models/configuracionWhatsapp.model.js");
const logger = require("../config/logger/loggerClient");

class MessageProcessingController {

    /**
     * Envia la plantilla enlace_lili con la URL como parametro {{1}}
     * @param {number} empresaId - ID de la empresa
     * @param {string} phone - Numero de telefono del destinatario
     * @param {string} enlaceUrl - URL a enviar como parametro
     * @returns {Promise<{wid: string|null}>}
     */
    async enviarPlantillaEnlace(empresaId, phone, enlaceUrl) {
        const result = await WhatsappGraphService.enviarEnlaceLili(empresaId, phone, enlaceUrl);
        return { wid: result.response?.messages?.[0]?.id || null };
    }

    async processMessage(req, res) {
        try {
            const { phone, question, wid, phone_number_id, messageType, files } = req.body;

            if (!phone || !question || !phone_number_id) {
                return res.serverError(400, "Campos requeridos: phone, question, phone_number_id");
            }

            const phoneTrimmed = phone.trim();
            const questionTrimmed = question.trim();
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

            let chat = await Chat.findByPersona(persona.id);
            if (!chat) {
                chat = await Chat.create({
                    id_empresa: empresaId,
                    id_persona: persona.id,
                    usuario_registro: null
                });
            }

            // Guardar mensaje entrante
            await Mensaje.create({
                id_chat: chat.id || chat,
                contenido: questionTrimmed,
                direccion: "in",
                wid_mensaje: widTrimmed,
                tipo_mensaje: tipoMensaje,
                fecha_hora: new Date(),
                usuario_registro: null
            });

            // Construir mensaje para el asistente incluyendo archivos si existen
            let messageForAssistant = questionTrimmed;
            if (archivos.length > 0) {
                const fileDescriptions = archivos.map(f => `[Archivo: ${f.type || 'archivo'} - ${f.url || ''}]`).join('\n');
                messageForAssistant = `${fileDescriptions}\n${questionTrimmed}`;
            }

            // Procesar con el asistente
            const resultado = await AssistantService.runProcess({
                chatId: chat.id || chat,
                message: messageForAssistant,
                persona: persona,
                id_empresa: empresaId
            });

            const respuestaTexto = resultado.content;
            const enlaceUrl = resultado.enlaceUrl;

            // Enviar respuesta por WhatsApp
            let widRespuesta = null;
            try {
                if (enlaceUrl) {
                    // Enviar plantilla enlace_lili con la URL generada por tools
                    logger.info(`[messageProcessing.controller.js] Enviando plantilla enlace_lili con URL: ${enlaceUrl}`);
                    const envioPlantilla = await this.enviarPlantillaEnlace(empresaId, phoneTrimmed, enlaceUrl);
                    widRespuesta = envioPlantilla.wid;
                    logger.info(`[messageProcessing.controller.js] Plantilla enlace_lili enviada, wid: ${widRespuesta}`);
                } else {
                    const envio = await WhatsappGraphService.enviarMensajeTexto(empresaId, phoneTrimmed, respuestaTexto);
                    widRespuesta = envio.wid_mensaje;
                    logger.info(`[messageProcessing.controller.js] Mensaje enviado por WhatsApp, wid: ${widRespuesta}`);
                }
            } catch (whatsappError) {
                logger.error(`[messageProcessing.controller.js] Error enviando WhatsApp: ${whatsappError.message}`);
            }

            // Guardar mensaje saliente
            await Mensaje.create({
                id_chat: chat.id || chat,
                contenido: enlaceUrl ? `[Plantilla enlace_lili] ${enlaceUrl}` : respuestaTexto,
                direccion: "out",
                wid_mensaje: widRespuesta || widTrimmed,
                tipo_mensaje: enlaceUrl ? "plantilla" : "texto",
                fecha_hora: new Date(),
                usuario_registro: null
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
