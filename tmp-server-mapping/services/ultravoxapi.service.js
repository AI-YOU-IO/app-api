import WebSocket from 'ws';
import config from '../config/config.js';
import logger from "../config/logger/loggerClient.js";
import tools from "../tools/index.js";

const sessions = new Map();

export class UltravoxAPISession {
  constructor(callId, options = {}) {
    this.callId = callId;
    this.joinUrl = null;
    this.ultravoxCallId = null;
    this.ws = null;
    this.isConnected = false;
    this.key = config.ultravox.key;
    this.data = options.data;
    this.backendUrl = options.url; // URL dinámica del backend
    const toolRuta = options.extras?.tool_ruta?.replace('.js', '') || options.extras?.empresa?.nombre;
    this.tools = this.processTools(tools[toolRuta] || tools['generica']);
    this.extras = options.extras
    this.systemPrompt = options.extras.prompt

    this.onBytes = options.onBytes;
    this.onJson = options.onJson;
    this.onClose = options.onClose;
  }

  /**
   * Procesa las tools reemplazando URLs hardcodeadas con la URL dinámica del backend
   * Solo reemplaza URLs de ai-you.io, no APIs externas como sperant.com
   */
  processTools(toolsList) {
    if (!this.backendUrl || !toolsList) return toolsList;

    return toolsList.map(tool => {
      if (tool.temporaryTool?.http?.baseUrlPattern) {
        const originalUrl = tool.temporaryTool.http.baseUrlPattern;

        // Solo reemplazar URLs de ai-you.io, no externas como sperant.com
        if (!originalUrl.includes('ai-you.io')) {
          return tool;
        }

        const path = new URL(originalUrl).pathname;
        return {
          ...tool,
          temporaryTool: {
            ...tool.temporaryTool,
            http: {
              ...tool.temporaryTool.http,
              baseUrlPattern: `${this.backendUrl}${path}`
            }
          }
        };
      }
      return tool;
    });
  }

  async createCall() {
    this.data.provider_call_id = this.callId;
    let formattedPrompt = this.systemPrompt.replace("{{datos}}", JSON.stringify(this.data)).replace("{{timestamp}}", new Date().toISOString());
    formattedPrompt = formattedPrompt.replace("{{tipificaciones}}", JSON.stringify(this.extras.tipificaciones) || "");

    // Reemplazar todas las variables del data ({{nombre}}, {{primer_nombre}}, etc.)
    for (const [key, value] of Object.entries(this.data)) {
      formattedPrompt = formattedPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value ?? '');
    }

    // Log del prompt convertido (primeros 500 chars)
    logger.info(`[Ultravox API] Prompt convertido (${formattedPrompt.length} chars): ${formattedPrompt.substring(0, 500)}...`);

    const payload = {
      systemPrompt: formattedPrompt,
      model: "ultravox-v0.7",
      voice: this.extras.voice,
      transcriptOptional: true,
      initialOutputMedium: 'MESSAGE_MEDIUM_VOICE',
      vadSettings: {
        turnEndpointDelay: "0.192s"
      },
      firstSpeakerSettings: {
        agent: {
          prompt: "Empieza con el flujo de bienvenida del prompt",
          uninterruptible: true,
        }
      },
      inactivityMessages: [{
        duration: '30s',
        message: '¿Sigue ahí?',
        endBehavior: 'END_BEHAVIOR_HANG_UP_SOFT'
      }],
      medium: {
        serverWebSocket: {
          inputSampleRate: 8000,
          outputSampleRate: 8000,
          clientBufferSizeMs: 60000,
          dataMessages: {
            userStartedSpeaking: true,
            userStoppedSpeaking: true,
            toolUsed: true,
          }
        }
      },
      selectedTools: [
        { toolName: "hangUp" },
        ...this.tools
      ]
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 segundos

      const response = await fetch('https://api.ultravox.ai/api/calls', {
        method: "POST",
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this.key },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      const result = await response.json();

      if (!response.ok) {
        logger.error(`[Ultravox API] Error HTTP ${response.status}: ${JSON.stringify(result)}`);
        return;
      }

      this.joinUrl = result?.joinUrl;
      this.ultravoxCallId = result?.callId;

      if (!this.joinUrl) {
        logger.error(`[Ultravox API] Respuesta sin joinUrl: ${JSON.stringify(result)}`);
        return;
      }

      logger.info(`[Ultravox API] Llamada creada: ${this.ultravoxCallId}`);

    } catch (err) {
      if (err.name === 'AbortError') {
        logger.error(`[Ultravox API] TIMEOUT - La API tardó más de 10s para call ${this.callId}`);
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        logger.error(`[Ultravox API] ERROR DE RED - No se pudo conectar: ${err.code}`);
      } else {
        logger.error(`[Ultravox API] Error al crear llamada: ${err.name} - ${err.message}`);
      }
    }
  }

  async connect() {
    if (!this.joinUrl) {
      logger.error(`[Ultravox API] No joinUrl available for call ${this.callId}`);
      throw new Error(`No joinUrl available for call ${this.callId}`);
    }

    return new Promise((resolve, reject) => {
      try {
        // console.log(`[Ultravox API] Connecting to ${this.joinUrl} for call ${this.callId}`);
        this.ws = new WebSocket(this.joinUrl);
        this.ws.on("open", () => {
          // console.log(`[Ultravox API] WebSocket connected for call ${this.callId}`);
          this.isConnected = true;
  
          resolve();
        });

        this.ws.on("message", (data, isBinary) => {
          this.handleMessage(data, isBinary);
        });

        this.ws.on("error", (error) => {
          logger.error(`[Ultravox API] WebSocket error for call ${this.callId}:`, error.message);
          reject(error);
        });

        this.ws.on("close", () => {
          logger.info(`[Ultravox API] WebSocket closed for call ${this.callId}`);
          this.isConnected = false;
          this.onClose();
        });
      } catch (err) {
        logger.error(`[Ultravox API] Connection error:`, err);
        reject(err);
      }
    })
  }

  async handleMessage(data, isBinary) {
    if (isBinary) {
      // console.log(`[Ultravox API] 📦 Bytes de audio: ${data.length}`);
      this.onBytes(data);
    } else {
      const message = JSON.parse(data);
      this.onJson(message);
    }
  }

  sendAudio(audioBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.error(`[Ultravox API] Cannot send audio - WebSocket not connected for call ${this.callId}`);
      return false;
    }
    // console.log(`[Ultravox API] Enviado frame ${audioBuffer.length}. Enviado: ${Date.now()}`);
    this.ws.send(audioBuffer);
    return true;
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }
}

export async function createSession(callId, options = {}) {
  // Close existing session if any
  if (sessions.has(callId)) {
    await closeSession(callId);
  }

  const session = new UltravoxAPISession(callId, options);

  try {
    await session.createCall();
    await session.connect();
    sessions.set(callId, session);

    logger.info(`[Ultravox API] Session created for call ${callId}`);
    return session;

  } catch (error) {
    logger.error(`[Ultravox API] Failed to create session for call ${callId}:`, error.message);
    throw error;
  }
}

export function closeSession(callId) {
  const session = sessions.get(callId);
  if (session) {
    session.close();
    sessions.delete(callId);
    logger.info(`[Ultravox API] Session closed for call ${callId}`);
  }
}

export function getAllSessions() {
  return Array.from(sessions.entries()).map(([callId, session]) => ({
    callId,
    connected: session.isConnected(),
    endpoint: session.endpoint
  }));
}

export function closeAllSessions() {
  for (const [callId] of sessions) {
    closeSession(callId);
  }
}

/**
 * Obtiene la transcripción de una llamada desde la API de Ultravox
 * @param {string} ultravoxCallId - ID de la llamada en Ultravox
 * @returns {Promise<Object>} - Objeto con messages y metadata
 */
export async function getCallTranscription(ultravoxCallId) {
  if (!ultravoxCallId) {
    logger.error('[Ultravox API] ultravoxCallId es requerido para obtener transcripción');
    return null;
  }

  try {
    const url = `https://api.ultravox.ai/api/calls/${ultravoxCallId}/messages`;
    // console.log(`[Ultravox API] Obteniendo transcripción de: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': config.ultravox.key
      }
    });

    if (!response.ok) {
      logger.error(`[Ultravox API] Error al obtener transcripción:`, response.status);
      return null;
    }

    const data = await response.json();
    // console.log(`[Ultravox API] Transcripción obtenida: ${data.results?.length || 0} mensajes`);

    return data;

  } catch (error) {
    logger.error(`[Ultravox API] Error al obtener transcripción:`, error.message);
    return null;
  }
}

/**
 * Obtiene los datos de una llamada desde la API de Ultravox
 * @param {string} ultravoxCallId - ID de la llamada en Ultravox
 * @returns {Promise<Object>} - Metadata de la llamada
 */
export async function getCallMetadata(ultravoxCallId) {
  if (!ultravoxCallId) {
    logger.error('[Ultravox API] ultravoxCallId es requerido para obtener metadata');
    return null;
  }

  try {
    const url = `https://api.ultravox.ai/api/calls/${ultravoxCallId}`;
    // console.log(`[Ultravox API] Obteniendo metadata de: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': config.ultravox.key
      }
    });

    if (!response.ok) {
      logger.error(`[Ultravox API] Error al obtener metadata:`, response.status);
      return null;
    }

    const data = await response.json();
    // console.log(`[Ultravox API] Metadata obtenida para llamada ${ultravoxCallId}`);

    return data;

  } catch (error) {
    logger.error(`[Ultravox API] Error al obtener metadata:`, error.message);
    return null;
  }
}

export default {
  UltravoxAPISession,
  createSession,
  closeSession,
  getAllSessions,
  closeAllSessions,
  getCallTranscription,
  getCallMetadata
};