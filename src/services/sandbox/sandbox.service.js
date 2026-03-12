const SandboxConfiguracionModel = require("../../models/sandboxConfiguracion.model.js");
const ChatSandboxModel = require("../../models/chatSandbox.model.js");
const MessageSandboxModel = require("../../models/messageSandbox.model.js");
const axios = require("axios");
const logger = require("../../config/logger/loggerClient.js");

class SandboxService {

    // ==================== Configuración ====================

    async getConfiguracion() {
        const model = new SandboxConfiguracionModel();
        return await model.getAll();
    }

    async saveConfiguracion(data) {
        const model = new SandboxConfiguracionModel();
        const existing = await model.getByCanal(data.canal);
        if (existing) {
            return existing;
        }
        const id = await model.create(data);
        return { id, ...data };
    }

    async updateConfiguracion(id, data) {
        const model = new SandboxConfiguracionModel();
        const exists = await model.getById(id);
        if (!exists) {
            throw new Error("Configuración no encontrada");
        }
        await model.update(id, data);
        return { id, ...data };
    }

    // ==================== Chats ====================

    async getChats(canal) {
        const model = new ChatSandboxModel();
        return await model.getByChannel(canal);
    }

    async createChat(data) {
        const model = new ChatSandboxModel();
        const id = await model.create(data);
        return { id, ...data };
    }

    async deleteChat(id) {
        const model = new ChatSandboxModel();
        const exists = await model.getById(id);
        if (!exists) {
            throw new Error("Chat no encontrado");
        }
        return await model.delete(id);
    }

    // ==================== Mensajes ====================

    async getMessages(idChat) {
        const chatModel = new ChatSandboxModel();
        const chat = await chatModel.getById(idChat);
        if (!chat) {
            throw new Error("Chat no encontrado");
        }
        const messageModel = new MessageSandboxModel();
        return await messageModel.getByChatId(idChat);
    }

    async sendMessage(idChat, data) {
        const chatModel = new ChatSandboxModel();
        const chat = await chatModel.getById(idChat);
        if (!chat) {
            throw new Error("Chat no encontrado");
        }

        // Guardar mensaje del usuario (outgoing)
        const messageModel = new MessageSandboxModel();
        const id = await messageModel.create({
            direction: "outgoing",
            message: data.message,
            type: data.type || "text",
            url: data.url || null,
            id_chat_sandbox: idChat,
        });

        // Obtener configuración del bot por el canal del chat
        const configModel = new SandboxConfiguracionModel();
        const config = await configModel.getByCanal(chat.channel);
        if (!config || !config.url_bot_service) {
            throw new Error("No hay configuración de bot para este canal");
        }

        // Reenviar mensaje al bot
        try {
            await axios.post(config.url_bot_service, {
                chatid: idChat,
                message: data.message,
            });
        } catch (error) {
            logger.error(`[sandbox.service] Error al enviar mensaje al bot: ${error.message}`);
            throw new Error("Error al comunicarse con el bot");
        }

        return { id, id_chat_sandbox: idChat, message: data.message };
    }

    // Webhook: el bot responde con {chatid, reply}
    async receiveReply(chatid, reply, type, url) {
        const chatModel = new ChatSandboxModel();
        const chat = await chatModel.getById(chatid);
        if (!chat) {
            throw new Error("Chat no encontrado");
        }

        const messageModel = new MessageSandboxModel();
        const id = await messageModel.create({
            direction: "incoming",
            message: reply,
            type: type || "text",
            url: url || null,
            id_chat_sandbox: chatid,
        });

        return { id, id_chat_sandbox: chatid, reply };
    }
}

module.exports = new SandboxService();
