const Mensaje = require("../../models/mensaje.model");
const { redisClient } = require("../../config/redis");
const logger = require("../../config/logger/loggerClient");

const CACHE_TTL = 86400; // 1 día en segundos
const CACHE_PREFIX = "chat:history:";

class MemoryService {

    _key(chatId) {
        return `${CACHE_PREFIX}${chatId}`;
    }

    /**
     * Carga los mensajes de un chat.
     * Primero intenta leer de Redis; si no existe, consulta la DB y guarda en cache.
     * @param {number} chatId - ID del chat
     * @returns {Promise<Array<{role: string, content: string}>>}
     */
    async getConversationHistory(chatId) {
        const key = this._key(chatId);

        try {
            const cached = await redisClient.get(key);

            if (cached) {
                logger.info(`[MemoryService] Cache hit para chat ${chatId}`);
                return JSON.parse(cached);
            }
        } catch (error) {
            logger.error('[MemoryService] Error leyendo cache Redis', { stack: error.stack });
        }

        logger.info(`[MemoryService] Cache miss para chat ${chatId}, consultando DB`);
        const dbMessages = await Mensaje.findByChatId(chatId);

        const messages = dbMessages.map(msg => ({
            role: msg.direccion === "in" ? "user" : "assistant",
            content: msg.contenido
        }));

        try {
            await redisClient.set(key, JSON.stringify(messages), { EX: CACHE_TTL });
        } catch (error) {
            logger.error('[MemoryService] Error guardando cache Redis', { stack: error.stack });
        }

        return messages;
    }

    /**
     * Agrega multiples mensajes al cache de Redis (incluyendo tool_calls y tool results).
     * @param {number} chatId - ID del chat
     * @param {Array<Object>} newMessages - Mensajes a agregar
     */
    async addMessagesToCache(chatId, newMessages) {
        const key = this._key(chatId);

        try {
            const cached = await redisClient.get(key);
            const messages = cached ? JSON.parse(cached) : [];

            messages.push(...newMessages);

            await redisClient.set(key, JSON.stringify(messages), { EX: CACHE_TTL });
        } catch (error) {
            logger.error('[MemoryService] Error actualizando cache Redis', { stack: error.stack });
        }
    }
}

module.exports = new MemoryService();
