const { createLlmProvider } = require("../llm");
const MemoryService = require("./memory.service");
const { buildSystemPrompt } = require("./promptCache.service");
const ToolExecutor = require("./tools/toolExecutor");
const { getLocalDateWithDay } = require("../../utils/customTimestamp");
const { pool } = require("../../config/dbConnection");
const logger = require("../../config/logger/loggerClient");

const MAX_TOOL_ITERATIONS = 5;
const _toolCache = {};

class AssistantService {

    constructor() {
        this.llmProvider = createLlmProvider();
        this.model = process.env.LLM_MODEL || "gpt-4.1-mini";
        this.temperature = Number(process.env.LLM_TEMPERATURE) || 0.5;
    }

    async getToolDefinitions(id_empresa) {
        if (_toolCache[id_empresa]) return _toolCache[id_empresa];

        const [rows] = await pool.query(
            `SELECT t.ruta FROM empresa e
             INNER JOIN tool t ON e.id_tool_chatbot = t.id
             WHERE e.id = $1 AND t.estado_registro = 1`,
            [id_empresa]
        );

        const ruta = rows.length > 0 ? rows[0].ruta : 'toolGenerica.js';
        const { toolDefinitions } = require(`./tools/${ruta}`);
        _toolCache[id_empresa] = toolDefinitions;
        logger.info(`[AssistantService] Tools cargadas para empresa ${id_empresa}: ${ruta}`);
        return toolDefinitions;
    }

    /**
     * Procesa un mensaje del usuario a traves del LLM con loop de tool calling.
     * @param {Object} params
     * @param {number} params.chatId - ID del chat para historial
     * @param {string} params.message - Mensaje actual del usuario
     * @param {Object} params.persona - Registro de la persona desde DB
     * @param {number} params.id_empresa - ID de la empresa
     * @returns {Promise<{content: string, enlaceUrl: string|null}>} - Respuesta del LLM con metadata
     */
    async runProcess({ chatId, message, persona, id_empresa }) {
        try {
            logger.info('[AssistantService] runProcess start', { messagePreview: message.substring(0, 100), model: this.model });

            const systemPrompt = await buildSystemPrompt({
                persona,
                timestamp: getLocalDateWithDay(),
                id_empresa
            });

            logger.info('[AssistantService] systemPrompt', { preview: systemPrompt.substring(0, 200) });

            const toolDefinitions = await this.getToolDefinitions(id_empresa);

            const history = await MemoryService.getConversationHistory(chatId);

            const messages = [
                ...history,
                { role: "user", content: message }
            ];

            const toolExecutor = new ToolExecutor(persona, chatId);

            const newMessages = [{ role: "user", content: message }];

            let iterations = 0;

            while (iterations < MAX_TOOL_ITERATIONS) {
                iterations++;

                const response = await this.llmProvider.chat({
                    systemPrompt,
                    messages,
                    model: this.model,
                    temperature: this.temperature,
                    tools: toolDefinitions
                });

                logger.info('[AssistantService] LLM response', {
                    iteration: iterations,
                    hasToolCalls: !!(response.tool_calls?.length),
                    toolCount: response.tool_calls?.length || 0,
                    contentPreview: response.content ? response.content.substring(0, 200) : null
                });

                if (!response.tool_calls || response.tool_calls.length === 0) {
                    newMessages.push({ role: "assistant", content: response.content });
                    await MemoryService.addMessagesToCache(chatId, newMessages);
                    return { content: response.content, enlaceUrl: toolExecutor.lastEnlaceUrl };
                }

                const assistantMsg = {
                    role: "assistant",
                    content: response.content,
                    tool_calls: response.tool_calls
                };
                messages.push(assistantMsg);
                newMessages.push(assistantMsg);

                for (const toolCall of response.tool_calls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    const result = await toolExecutor.execute(toolCall.function.name, args);

                    logger.info('[AssistantService] Tool', {
                        name: toolCall.function.name,
                        args: toolCall.function.arguments.substring(0, 200),
                        result: typeof result === 'string' ? result.substring(0, 200) : JSON.stringify(result).substring(0, 200)
                    });

                    const toolMsg = {
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: result
                    };
                    messages.push(toolMsg);
                    newMessages.push(toolMsg);
                }
            }

            logger.warn(`[AssistantService] Max tool iterations (${MAX_TOOL_ITERATIONS}) alcanzado, forzando respuesta de texto`);
            const finalResponse = await this.llmProvider.chat({
                systemPrompt,
                messages,
                model: this.model,
                temperature: this.temperature,
                tools: undefined
            });

            newMessages.push({ role: "assistant", content: finalResponse.content });
            await MemoryService.addMessagesToCache(chatId, newMessages);
            return { content: finalResponse.content, enlaceUrl: toolExecutor.lastEnlaceUrl };

        } catch (error) {
            logger.error('[AssistantService.runProcess] Error', { message: error.message, stack: error.stack });
            throw error;
        }
    }
}

module.exports = new AssistantService();
