const { createLlmProvider } = require('../llm/index.js');
const AnalisisLlamadaModel = require('../../models/analisisLlamada.model.js');
const AnalisisSentimientoModel = require('../../models/analisisSentimiento.model.js');
const PreguntaFrecuenteAnalisisModel = require('../../models/preguntaFrecuenteAnalisis.model.js');
const logger = require('../../config/logger/loggerClient.js');

const SYSTEM_PROMPT = `Eres un analista experto en conversaciones de servicio al cliente. Analiza la siguiente conversación y devuelve ÚNICAMENTE un JSON válido (sin markdown, sin backticks) con esta estructura exacta:

{
  "sentimiento": "positivo" | "negativo" | "neutro",
  "score_sentimiento": <float de -1 a 1>,
  "emocion_principal": "frustracion" | "enojo" | "confusion" | "ansiedad" | "desconfianza" | "decepcion" | "satisfaccion" | "gratitud" | "neutral",
  "score_emocion": <float de 0 a 1>,
  "resumen": "<resumen breve de la conversación en 1-2 oraciones>",
  "total_palabras": <int>,
  "cumplimiento_protocolo": <float 0-100, evalúa si el agente saludó, se identificó, resolvió, se despidió>,
  "fcr": <boolean, true si se resolvió en esta conversación>,
  "preguntas": [{"contenido": "<pregunta detectada>", "frecuencia": 1}],
  "temas": [{"contenido": "<tema detectado>", "frecuencia": 1}],
  "palabras_clave": [{"contenido": "<palabra clave>", "frecuencia": <int>}]
}

Reglas:
- Si no hay agente humano (solo bot/IA), cumplimiento_protocolo debe evaluarse sobre el bot.
- Si la conversación es muy corta o no tiene contexto suficiente, usa "neutro" como sentimiento.
- Las preguntas son las que hizo el cliente/usuario.
- Los temas son los tópicos principales de la conversación.
- Las palabras clave son las más relevantes.
- Responde SOLO con el JSON, sin texto adicional.`;

class SentimientoService {

    constructor() {
        this.llmProvider = createLlmProvider();
        this.model = process.env.LLM_MODEL || 'gpt-4.1-mini';
    }

    /**
     * Analiza una transcripción de llamada
     * @param {number} id_llamada
     * @param {Array} transcripcion - [{speaker, texto, ordinal}]
     * @param {number} id_empresa
     */
    async analizarLlamada(id_llamada, transcripcion, id_empresa) {
        try {
            // Verificar que no exista análisis previo
            const sentimientoModel = new AnalisisSentimientoModel();
            const existente = await sentimientoModel.getByLlamada(id_llamada);
            if (existente) {
                logger.info(`[sentimiento.service] Análisis ya existe para llamada ${id_llamada}, omitiendo`);
                return existente;
            }

            // Formatear transcripción como texto
            const textoConversacion = this._formatearTranscripcion(transcripcion);

            if (!textoConversacion || textoConversacion.trim().length < 10) {
                logger.warn(`[sentimiento.service] Transcripción muy corta para llamada ${id_llamada}, omitiendo análisis`);
                return null;
            }

            // Llamar al LLM
            const resultado = await this._llamarLLM(textoConversacion);
            if (!resultado) return null;

            // Guardar resultados en las 3 tablas
            await this._guardarResultados({ id_llamada, id_chat: null, id_empresa, resultado });

            logger.info(`[sentimiento.service] Análisis completado para llamada ${id_llamada}: ${resultado.sentimiento}`);
            return resultado;
        } catch (error) {
            logger.error(`[sentimiento.service] Error analizando llamada ${id_llamada}: ${error.message}`);
            return null;
        }
    }

    /**
     * Analiza mensajes de un chat
     * @param {number} id_chat
     * @param {Array} mensajes - [{direccion, contenido}]
     * @param {number} id_empresa
     */
    async analizarChat(id_chat, mensajes, id_empresa) {
        try {
            // Verificar que no exista análisis previo
            const sentimientoModel = new AnalisisSentimientoModel();
            const existente = await sentimientoModel.getByChat(id_chat);
            if (existente) {
                logger.info(`[sentimiento.service] Análisis ya existe para chat ${id_chat}, omitiendo`);
                return existente;
            }

            // Formatear mensajes como texto
            const textoConversacion = this._formatearMensajes(mensajes);

            if (!textoConversacion || textoConversacion.trim().length < 10) {
                logger.warn(`[sentimiento.service] Mensajes muy cortos para chat ${id_chat}, omitiendo análisis`);
                return null;
            }

            // Llamar al LLM
            const resultado = await this._llamarLLM(textoConversacion);
            if (!resultado) return null;

            // Guardar resultados
            await this._guardarResultados({ id_llamada: null, id_chat, id_empresa, resultado });

            logger.info(`[sentimiento.service] Análisis completado para chat ${id_chat}: ${resultado.sentimiento}`);
            return resultado;
        } catch (error) {
            logger.error(`[sentimiento.service] Error analizando chat ${id_chat}: ${error.message}`);
            return null;
        }
    }

    _formatearTranscripcion(transcripcion) {
        return transcripcion
            .sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0))
            .map(t => {
                const speaker = t.speaker === 'ai' ? 'Agente' : (t.speaker === 'humano' ? 'Cliente' : t.speaker);
                return `${speaker}: ${t.texto}`;
            })
            .join('\n');
    }

    _formatearMensajes(mensajes) {
        return mensajes
            .map(m => {
                const speaker = m.direccion === 'saliente' ? 'Agente' : 'Cliente';
                return `${speaker}: ${m.contenido || ''}`;
            })
            .filter(line => line.trim().length > 0)
            .join('\n');
    }

    async _llamarLLM(textoConversacion) {
        try {
            const response = await this.llmProvider.chat({
                systemPrompt: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: textoConversacion }],
                model: this.model,
                temperature: 0.3
            });

            // Parsear JSON de la respuesta
            let content = response.content.trim();
            // Limpiar posibles backticks
            if (content.startsWith('```')) {
                content = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
            }

            return JSON.parse(content);
        } catch (error) {
            logger.error(`[sentimiento.service] Error en LLM o parseo JSON: ${error.message}`);
            return null;
        }
    }

    async _guardarResultados({ id_llamada, id_chat, id_empresa, resultado }) {
        const analisisLlamadaModel = new AnalisisLlamadaModel();
        const sentimientoModel = new AnalisisSentimientoModel();
        const preguntaModel = new PreguntaFrecuenteAnalisisModel();

        // 1. Guardar análisis de llamada/métricas
        await analisisLlamadaModel.create({
            id_llamada,
            id_chat,
            total_tokens: null,
            total_palabras: resultado.total_palabras || 0,
            tiempo_habla_seg: null,
            tiempo_silencio_seg: null,
            cumplimiento_protocolo: resultado.cumplimiento_protocolo || null,
            fcr: resultado.fcr || false,
            resumen: resultado.resumen || null,
            id_empresa
        });

        // 2. Guardar sentimiento
        await sentimientoModel.create({
            id_llamada,
            id_chat,
            sentimiento: resultado.sentimiento || 'neutro',
            score_sentimiento: resultado.score_sentimiento || 0,
            emocion_principal: resultado.emocion_principal || 'neutral',
            score_emocion: resultado.score_emocion || 0,
            id_empresa
        });

        // 3. Guardar preguntas, temas y palabras clave
        const items = [];
        const addItems = (arr, tipo) => {
            if (!Array.isArray(arr)) return;
            for (const item of arr) {
                items.push({
                    id_llamada,
                    id_chat,
                    tipo,
                    contenido: item.contenido,
                    frecuencia: item.frecuencia || 1,
                    id_empresa
                });
            }
        };

        addItems(resultado.preguntas, 'pregunta');
        addItems(resultado.temas, 'tema');
        addItems(resultado.palabras_clave, 'palabra');

        if (items.length > 0) {
            await preguntaModel.createBulk(items);
        }
    }
}

module.exports = new SentimientoService();
