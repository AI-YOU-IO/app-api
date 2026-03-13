const sandboxService = require("../services/sandbox/sandbox.service.js");
const logger = require("../config/logger/loggerClient.js");

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
            const { chatid, reply, type, url } = req.body;
            if (!chatid || !reply) {
                return res.clientError(400, "chatid y reply son requeridos");
            }
            const data = await sandboxService.receiveReply(chatid, reply, type, url);
            return res.success(201, "Respuesta recibida exitosamente", data);
        } catch (error) {
            if (error.message === "Chat no encontrado") {
                return res.clientError(404, error.message);
            }
            logger.error(`[sandbox.controller] Error al recibir respuesta del bot: ${error.message}`);
            return res.serverError(500, "Error al recibir respuesta del bot");
        }
    }
}

module.exports = new SandboxController();
