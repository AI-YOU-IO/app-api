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
                id_empresa:50
                
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

    // Webhook: el bot responde con formato simple (message, type, url)
    async receiveReplySimple(chatid, message, type, url) {
        const chatModel = new ChatSandboxModel();
        const chat = await chatModel.getById(chatid);
        if (!chat) {
            throw new Error("Chat no encontrado");
        }

        const messageModel = new MessageSandboxModel();
        const id = await messageModel.create({
            direction: "incoming",
            message: message,
            type: type || "text",
            url: url || null,
            id_chat_sandbox: chatid,
        });

        return { id_message_sandbox: id, id_chat_sandbox: chatid, message };
    }

    // Webhook: el bot responde con formato n8n completo y session_id para relacionar con chatid
    async receiveReplyWithSessionId(idChat, input = {}) {
        const chatModel = new ChatSandboxModel();
        const chat = await chatModel.getById(idChat);
        if (!chat) {
            throw new Error("Chat no encontrado");
        }

        const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

        const rawMessage = hasOwn(input, "body_text")
            ? (input.body_text ?? "")
            : hasOwn(input, "message")
                ? (input.message ?? "")
                : hasOwn(input, "reply")
                    ? (input.reply ?? "")
                    : "";

        const mappedMessage = typeof rawMessage === "string" ? rawMessage : String(rawMessage);
        const sessionId = input.session_id || idChat;

        const messageModel = new MessageSandboxModel();
        const idMessage = await messageModel.create({
            direction: "incoming",
            message: mappedMessage,
            type: "text",
            url: null,
            id_chat_sandbox: idChat,
        });

        return {
            id_message_sandbox: idMessage,
            id_chat_sandbox: Number(idChat),
            session_id: sessionId,
            message: mappedMessage,
            received_payload: input,
        };
    }

    async sendMockWhatsappPayload(message) {
        const configModel = new SandboxConfiguracionModel();
        const config = await configModel.getByCanal("whatsapp");

        if (!config || !config.url_bot_service) {
            throw new Error("No hay configuración de bot para el canal whatsapp");
        }

        const payload = {
            object: "whatsapp_business_account",
            entry: [
                {
                    changes: [
                        {
                            field: "messages",
                            value: {
                                metadata: {
                                    phone_number_id: "123456789",
                                    display_phone_number: "51984292393",
                                },
                                contacts: [
                                    {
                                        profile: { name: "Juan Perez" },
                                        wa_id: "51999999999",
                                    },
                                ],
                                messages: [
                                    {
                                        id: "wamid.xxxxx",
                                        from: "51999999999",
                                        timestamp: "1710000000",
                                        type: "text|image|video|audio|document|sticker|location|contacts|button|interactive",
                                        text: { body: message },
                                        image: { id: "media_id", mime_type: "image/jpeg", caption: "foto" },
                                        video: { id: "media_id", mime_type: "video/mp4", caption: "" },
                                        audio: { id: "media_id", mime_type: "audio/ogg" },
                                        document: {
                                            id: "media_id",
                                            mime_type: "application/pdf",
                                            filename: "doc.pdf",
                                            caption: "",
                                        },
                                        sticker: { id: "media_id", mime_type: "image/webp" },
                                        location: { latitude: -12.0, longitude: -77.0, name: "Lima" },
                                        button: { text: "Si" },
                                        interactive: {
                                            type: "button_reply|list_reply",
                                            button_reply: { title: "Opcion 1" },
                                            list_reply: { title: "Opcion 2" },
                                        },
                                        referral: {
                                            source_type: "ad",
                                            ctwa_clid: "click_id_123",
                                        },
                                    },
                                ],
                                statuses: [
                                    {
                                        status: "sent|delivered|read|failed",
                                        id: "wamid.xxxxx",
                                        recipient_id: "51999999999",
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        };

        logger.info(`[sandbox.service] MOCK WHATSAPP REQUEST URL: ${config.url_bot_service}`);
        logger.info(`[sandbox.service] MOCK WHATSAPP REQUEST BODY: ${safeJson(payload)}`);

        let response;
        try {
            response = await axios.post(config.url_bot_service, payload);
        } catch (error) {
            logger.error(`[sandbox.service] MOCK WHATSAPP ERROR MESSAGE: ${error.message}`);
            if (error.response) {
                logger.error(`[sandbox.service] MOCK WHATSAPP ERROR STATUS: ${error.response.status}`);
                logger.error(`[sandbox.service] MOCK WHATSAPP ERROR BODY: ${safeJson(error.response.data)}`);
            }
            throw new Error("Error al comunicarse con el bot");
        }

        logger.info(`[sandbox.service] MOCK WHATSAPP RESPONSE STATUS: ${response.status}`);
        logger.info(`[sandbox.service] MOCK WHATSAPP RESPONSE BODY: ${safeJson(response.data)}`);

        return {
            sent_to: config.url_bot_service,
            status_code: response.status,
            payload,
            response: response.data,
        };
    }

    async sendMockN8nInteractiveListPayload(idChat, input = {}) {
        const configModel = new SandboxConfiguracionModel();
        const config = await configModel.getByCanal("whatsapp");

        if (!config || !config.url_bot_service) {
            throw new Error("No hay configuración de bot para el canal whatsapp");
        }

        const chatModel = new ChatSandboxModel();
        const chat = await chatModel.getById(idChat);
        if (!chat) {
            throw new Error("Chat no encontrado");
        }

        const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

        const rawBody = hasOwn(input, "body_text")
            ? (input.body_text ?? "")
            : hasOwn(input, "message")
                ? (input.message ?? "")
                : hasOwn(input, "mensaje")
                    ? (input.mensaje ?? "")
                    : "Hola";

        const mappedBody = typeof rawBody === "string" ? rawBody : String(rawBody);

        const messageModel = new MessageSandboxModel();
        const idMessage = await messageModel.create({
            direction: "outgoing",
            message: mappedBody,
            type: "interactive-list",
            url: null,
            id_chat_sandbox: idChat,
        });

        // El bot recibe formato webhook de WhatsApp; solo text.body es dinámico.
        const payload = {
            object: "whatsapp_business_account",
            entry: [
                {
                    changes: [
                        {
                            field: "messages",
                            value: {
                                metadata: {
                                    phone_number_id: "123456789",
                                    display_phone_number: "51984292393",
                                },
                                contacts: [
                                    {
                                        profile: { name: "Juan Perez" },
                                        wa_id: "51999999999",
                                    },
                                ],
                                messages: [
                                    {
                                        id: "wamid.xxxxx",
                                        from: "51999999999",
                                        timestamp: "1710000000",
                                        type: "text|image|video|audio|document|sticker|location|contacts|button|interactive",
                                        text: { body: mappedBody },
                                        image: { id: "media_id", mime_type: "image/jpeg", caption: "foto" },
                                        video: { id: "media_id", mime_type: "video/mp4", caption: "" },
                                        audio: { id: "media_id", mime_type: "audio/ogg" },
                                        document: {
                                            id: "media_id",
                                            mime_type: "application/pdf",
                                            filename: "doc.pdf",
                                            caption: "",
                                        },
                                        sticker: { id: "media_id", mime_type: "image/webp" },
                                        location: { latitude: -12.0, longitude: -77.0, name: "Lima" },
                                        button: { text: "Si" },
                                        interactive: {
                                            type: "button_reply|list_reply",
                                            button_reply: { title: "Opcion 1" },
                                            list_reply: { title: "Opcion 2" },
                                        },
                                        referral: {
                                            source_type: "ad",
                                            ctwa_clid: "click_id_123",
                                        },
                                    },
                                ],
                                statuses: [
                                    {
                                        status: "sent|delivered|read|failed",
                                        id: "wamid.xxxxx",
                                        recipient_id: "51999999999",
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        };

        logger.info(`[sandbox.service] MOCK N8N REQUEST URL: ${config.url_bot_service}`);
        logger.info(`[sandbox.service] MOCK N8N REQUEST BODY: ${safeJson(payload)}`);

        let response;
        try {
            response = await axios.post(config.url_bot_service, payload);
        } catch (error) {
            logger.error(`[sandbox.service] MOCK N8N ERROR MESSAGE: ${error.message}`);
            if (error.response) {
                logger.error(`[sandbox.service] MOCK N8N ERROR STATUS: ${error.response.status}`);
                logger.error(`[sandbox.service] MOCK N8N ERROR BODY: ${safeJson(error.response.data)}`);
            }
            throw new Error("Error al comunicarse con el bot");
        }

        logger.info(`[sandbox.service] MOCK N8N RESPONSE STATUS: ${response.status}`);
        logger.info(`[sandbox.service] MOCK N8N RESPONSE BODY: ${safeJson(response.data)}`);

        return {
            id_message_sandbox: idMessage,
            id_chat_sandbox: Number(idChat),
            sent_to: config.url_bot_service,
            status_code: response.status,
            payload,
            mapped_from_front: {
                body_text: mappedBody,
            },
            response: response.data,
        };
    }

    async sendMockWhatsappWebhookFromFront(idChat, input = {}) {
        return this.sendMockN8nInteractiveListPayload(idChat, input);
    }
}

module.exports = new SandboxService();
