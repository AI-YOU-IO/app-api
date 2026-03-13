const SandboxConfiguracionModel = require("../../models/sandboxConfiguracion.model.js");
const ChatSandboxModel = require("../../models/chatSandbox.model.js");
const MessageSandboxModel = require("../../models/messageSandbox.model.js");
const axios = require("axios");
const logger = require("../../config/logger/loggerClient.js");

const safeJson = (value) => {
    try {
        return JSON.stringify(value);
    } catch (_) {
        return "[unserializable]";
    }
};


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
        return await model.getByCanal(canal);
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
        const config = await configModel.getByCanal(chat.canal);
        if (!config || !config.url_bot_service) {
            throw new Error("No hay configuración de bot para este canal");
        }

        // Reenviar mensaje al bot
        try {
            const botPayload = {
                message: data.message,
                session_id: idChat,
                    config: {
                    id_empresa: 1
                }
                
            };

            if (typeof data.type !== "undefined") {
                botPayload.type = data.type;
            }
            if (typeof data.url !== "undefined") {
                botPayload.url = data.url;
            }

            logger.info(`[sandbox.service] BOT REQUEST URL: ${config.url_bot_service}`);
            logger.info(`[sandbox.service] BOT REQUEST BODY: ${safeJson(botPayload)}`);

            let botResponse;
            try {
                botResponse = await axios.post(config.url_bot_service, botPayload);
            } catch (error) {
                logger.error(`[sandbox.service] BOT ERROR MESSAGE: ${error.message}`);
                if (error.response) {
                    logger.error(`[sandbox.service] BOT ERROR STATUS: ${error.response.status}`);
                    logger.error(`[sandbox.service] BOT ERROR HEADERS: ${safeJson(error.response.headers)}`);
                    logger.error(`[sandbox.service] BOT ERROR BODY: ${safeJson(error.response.data)}`);
                }
                throw new Error("Error al comunicarse con el bot");
            }
            
            logger.info(`[sandbox.service] BOT RESPONSE STATUS: ${botResponse.status}`);
            logger.info(`[sandbox.service] BOT RESPONSE HEADERS: ${safeJson(botResponse.headers)}`);
            logger.info(`[sandbox.service] BOT RESPONSE BODY: ${safeJson(botResponse.data)}`);

            const responseSessionId = Number(botResponse?.data?.session_id);
            const mappedChatId = Number.isInteger(responseSessionId) ? responseSessionId : idChat;
            if (mappedChatId !== Number(idChat)) {
                logger.info(`[sandbox.service] session_id mapeado de respuesta bot: ${mappedChatId} (request idChat=${idChat})`);
            }

            const reply = botResponse?.data?.reply;
            if (typeof reply === "string" && reply.trim() !== "") {
                await messageModel.create({
                    direction: "incoming",
                    message: reply,
                    type: "text",
                    url: botResponse?.data?.url || null,
                    id_chat_sandbox: mappedChatId,
                });
            }
        } catch (error) {
            if (error.message === "Error al comunicarse con el bot") {
                throw error;
            }
            logger.error(`[sandbox.service] Error inesperado al preparar envío al bot: ${error.message}`);
            throw new Error("Error al comunicarse con el bot");
        }

        return { id, id_chat_sandbox: idChat, message: data.message };
    }

    // Webhook: el bot responde con {session_id} que es nuestro chatid
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
