const AssistantService = require("../services/assistant/asistant.service");
const Persona = require("../models/persona.model.js");
const Usuario = require("../models/usuario.model.js");
const Chat = require("../models/chat.model.js");
const Mensaje = require("../models/mensaje.model.js");
const logger = require("../config/logger/loggerClient");

class MessageProcessingController {

    async processMessage(req, res) {
        try {
            const { phone, question, wid, id_empresa } = req.body;

            if (!phone || !question || !id_empresa) {
                return res.serverError(400, "Campos requeridos: phone, question, id_empresa");
            }

            const phoneTrimmed = phone.trim();
            const questionTrimmed = question.trim();
            const widTrimmed = wid ? wid.trim() : null;
            const empresaId = parseInt(id_empresa, 10);

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
                tipo_mensaje: "texto",
                fecha_hora: new Date(),
                usuario_registro: null
            });

            // Procesar con el asistente
            const respuestaTexto = await AssistantService.runProcess({
                chatId: chat.id || chat,
                message: questionTrimmed,
                persona: persona,
                id_empresa: empresaId
            });

            // Guardar mensaje saliente
            await Mensaje.create({
                id_chat: chat.id || chat,
                contenido: respuestaTexto,
                direccion: "out",
                wid_mensaje: widTrimmed,
                tipo_mensaje: "texto",
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
