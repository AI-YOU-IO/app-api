const { createLlmProvider } = require("../llm");
const MemoryService = require("./memory.service");
const { buildSystemPrompt } = require("./promptCache.service");
const { toolDefinitions } = require("./tools/toolDefinitions");
const ToolExecutor = require("./tools/toolExecutor");
const { getLocalDateWithDay } = require("../../utils/customTimestamp");
const logger = require("../../config/logger/loggerClient");

const MAX_TOOL_ITERATIONS = 5;

class AssistantService {

    constructor() {
        this.llmProvider = createLlmProvider();
        this.model = process.env.LLM_MODEL || "gpt-4.1-mini";
        this.temperature = Number(process.env.LLM_TEMPERATURE) || 0.5;
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
            const systemPrompt = buildSystemPrompt({
                persona,
                timestamp: getLocalDateWithDay()
            });

            const history = await MemoryService.getConversationHistory(chatId);

            const messages = [
                ...history,
                { role: "user", content: message }
            ];

            const toolExecutor = new ToolExecutor();

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

                    logger.info(`[AssistantService] Tool: ${toolCall.function.name}, args: ${toolCall.function.arguments}, result: ${result}`);

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
            logger.error(`[AssistantService.runProcess] ${error.message}`);
            throw error;
        }
    }
}

module.exports = new AssistantService();
