const sandboxService = require("../services/sandbox/sandbox.service.js");
const logger = require("../config/logger/loggerClient.js");

const safeJson = (value) => {
    try {
        return JSON.stringify(value);
    } catch (_) {
        return "[unserializable]";
    }
};

class SandboxController {

    // ==================== Configuración ====================

    async getConfiguracion(req, res) {
        try {
            const data = await sandboxService.getConfiguracion();
            return res.success(200, "Configuraciones obtenidas", data);
        } catch (error) {
            logger.error(`[sandbox.controller] Error al obtener configuración: ${error.message}`);
            return res.serverError(500, "Error al obtener configuración");
        }
    }

    async saveConfiguracion(req, res) {
        try {
            const { url_bot_service, canal } = req.body;
            if (!url_bot_service || !canal) {
                return res.clientError(400, "url_bot_service y canal son requeridos");
            }
            const data = await sandboxService.saveConfiguracion({ url_bot_service, canal });
            return res.success(201, "Configuración creada exitosamente", data);
        } catch (error) {
            logger.error(`[sandbox.controller] Error al crear configuración: ${error.message}`);
            return res.serverError(500, "Error al crear configuración");
        }
    }

    async updateConfiguracion(req, res) {
        try {
            const { id } = req.params;
            const { url_bot_service, canal } = req.body;
            if (!url_bot_service || !canal) {
                return res.clientError(400, "url_bot_service y canal son requeridos");
            }
            const data = await sandboxService.updateConfiguracion(id, { url_bot_service, canal });
            return res.success(200, "Configuración actualizada exitosamente", data);
        } catch (error) {
            if (error.message === "Configuración no encontrada") {
                return res.clientError(404, error.message);
            }
            logger.error(`[sandbox.controller] Error al actualizar configuración: ${error.message}`);
            return res.serverError(500, "Error al actualizar configuración");
        }
    }

    // ==================== Chats ====================

    async getChats(req, res) {
        try {
            const { canal } = req.query;
            if (!canal) {
                return res.clientError(400, "El parámetro canal es requerido");
            }
            const data = await sandboxService.getChats(canal);
            return res.success(200, "Chats obtenidos", data);
        } catch (error) {
            logger.error(`[sandbox.controller] Error al obtener chats: ${error.message}`);
            return res.serverError(500, "Error al obtener chats");
        }
    }

    async createChat(req, res) {
        try {
            const { canal } = req.body;
            if (!canal) {
                return res.clientError(400, "El campo canal es requerido");
            }
            const data = await sandboxService.createChat({ canal });
            return res.success(201, "Chat creado exitosamente", data);
        } catch (error) {
            logger.error(`[sandbox.controller] Error al crear chat: ${error.message}`);
            return res.serverError(500, "Error al crear chat");
        }
    }

    async deleteChat(req, res) {
        try {
            const { id } = req.params;
            await sandboxService.deleteChat(id);
            return res.success(200, "Chat eliminado exitosamente");
        } catch (error) {
            if (error.message === "Chat no encontrado") {
                return res.clientError(404, error.message);
            }
            logger.error(`[sandbox.controller] Error al eliminar chat: ${error.message}`);
            return res.serverError(500, "Error al eliminar chat");
        }
    }

    // ==================== Mensajes ====================

    async getMessages(req, res) {
        try {
            const { idChat } = req.params;
            const data = await sandboxService.getMessages(idChat);
            return res.success(200, "Mensajes obtenidos", data);
        } catch (error) {
            if (error.message === "Chat no encontrado") {
                return res.clientError(404, error.message);
            }
            logger.error(`[sandbox.controller] Error al obtener mensajes: ${error.message}`);
            return res.serverError(500, "Error al obtener mensajes");
        }
    }

    async sendMessage(req, res) {
        try {
            const { idChat } = req.params;
            const { message, type, url } = req.body;
            if (!message) {
                return res.clientError(400, "message es requerido");
            }
            const data = await sandboxService.sendMessage(idChat, { message, type, url });
            return res.success(201, "Mensaje enviado exitosamente", data);
        } catch (error) {
            if (error.message === "Chat no encontrado") {
                return res.clientError(404, error.message);
            }
            if (error.message === "No hay configuración de bot para este canal") {
                return res.clientError(400, error.message);
            }
            logger.error(`[sandbox.controller] Error al enviar mensaje: ${error.message}`);
            return res.serverError(500, "Error al enviar mensaje");
        }
    }

    // ==================== Webhook (bot responde) ====================

    async receiveReply(req, res) {
        try {
            logger.info(`[sandbox.controller] /reply headers: ${safeJson({
                "content-type": req.headers["content-type"],
                "user-agent": req.headers["user-agent"],
                "x-forwarded-for": req.headers["x-forwarded-for"],
            })}`);
            logger.info(`[sandbox.controller] /reply body raw: ${safeJson(req.body)}`);

            const { session_id, reply, message, type, url } = req.body;
            const mappedReply = reply ?? message;

            if (!session_id || !mappedReply) {
                logger.error(`[sandbox.controller] /reply validation failed. session_id=${safeJson(session_id)} reply=${safeJson(reply)} message=${safeJson(message)}`);
                return res.clientError(400, "session_id y reply son requeridos");
            }
            const data = await sandboxService.receiveReplySimple(session_id, mappedReply, type, url);
            return res.success(201, "Respuesta recibida exitosamente", data);
        } catch (error) {
            if (error.message === "Chat no encontrado") {
                return res.clientError(404, error.message);
            }
            logger.error(`[sandbox.controller] Error al recibir respuesta del bot: ${error.message}`);
            return res.serverError(500, "Error al recibir respuesta del bot");
        }
    }

    async receiveReplyWithSessionId(req, res) {
        try {
            logger.info(`[sandbox.controller] /chats/:idChat/reply params: ${safeJson(req.params)}`);
            logger.info(`[sandbox.controller] /chats/:idChat/reply headers: ${safeJson({
                "content-type": req.headers["content-type"],
                "user-agent": req.headers["user-agent"],
                "x-forwarded-for": req.headers["x-forwarded-for"],
            })}`);
            logger.info(`[sandbox.controller] /chats/:idChat/reply body raw: ${safeJson(req.body)}`);

            const { idChat } = req.params;
            if (!idChat) {
                logger.error(`[sandbox.controller] /chats/:idChat/reply validation failed. idChat=${safeJson(idChat)}`);
                return res.clientError(400, "idChat es requerido");
            }
            const data = await sandboxService.receiveReplyWithSessionId(idChat, req.body || {});
            return res.success(201, "Respuesta recibida exitosamente", data);
        } catch (error) {
            if (error.message === "Chat no encontrado") {
                return res.clientError(404, error.message);
            }
            logger.error(`[sandbox.controller] Error al recibir respuesta del bot: ${error.message}`);
            return res.serverError(500, "Error al recibir respuesta del bot");
        }
    }

    async sendMockWhatsappPayload(req, res) {
        try {
            const rawMessage = req.body.message ?? req.body.mensaje;
            if (!rawMessage || typeof rawMessage !== "string" || rawMessage.trim() === "") {
                return res.clientError(400, "message o mensaje es requerido");
            }

            const data = await sandboxService.sendMockWhatsappPayload(rawMessage.trim());
            return res.success(200, "Payload de WhatsApp enviado exitosamente", data);
        } catch (error) {
            if (error.message === "No hay configuración de bot para el canal whatsapp") {
                return res.clientError(400, error.message);
            }

            logger.error(`[sandbox.controller] Error al enviar payload mock de WhatsApp: ${error.message}`);
            return res.serverError(500, "Error al enviar payload mock de WhatsApp");
        }
    }

    async sendMockWhatsappWebhookFromFront(req, res) {
        try {
            const { idChat } = req.params;
            if (!idChat) {
                return res.clientError(400, "idChat es requerido");
            }

            const data = await sandboxService.sendMockWhatsappWebhookFromFront(idChat, req.body || {});
            return res.success(200, "Payload webhook mock enviado exitosamente", data);
        } catch (error) {
            if (error.message === "No hay configuración de bot para el canal whatsapp") {
                return res.clientError(400, error.message);
            }
            if (error.message === "Chat no encontrado") {
                return res.clientError(404, error.message);
            }

            logger.error(`[sandbox.controller] Error al enviar payload webhook mock: ${error.message}`);
            return res.serverError(500, "Error al enviar payload webhook mock");
        }
    }
}

module.exports = new SandboxController();
