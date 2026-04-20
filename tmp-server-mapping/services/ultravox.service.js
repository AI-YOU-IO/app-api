import WebSocket from 'ws';
import config from '../config/config.js';
import { broadcast } from '../websocket/ws.server.js';

/**
 * Ultravox Voice AI Service
 * Connects to FastAPI WebSocket for audio-to-text inference with streaming
 */

// Active Ultravox sessions by call_id
const sessions = new Map();

export class UltravoxSession {
  constructor(callId, options = {}) {
    this.callId = callId;
    this.systemPrompt = options.systemPrompt || 'Eres un asistente en español.';
    this.endpoint = options.endpoint || config.ultravox?.url || 'ws://localhost:8000/ws/voice';
    this.ws = null;
    this.connected = false;
    this.responseBuffer = '';

    // Callbacks
    this.onToken = options.onToken || (() => {});           // Called for each streaming token
    this.onResponse = options.onResponse || (() => {});     // Called when full response is ready
    this.onError = options.onError || (() => {});
    this.onClose = options.onClose || (() => {});
  }

  /**
   * Connect to Ultravox WebSocket and send initialization message
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[Ultravox] Connecting to ${this.endpoint} for call ${this.callId}`);

        this.ws = new WebSocket(this.endpoint);

        this.ws.on('open', () => {
          console.log(`[Ultravox] WebSocket connected for call ${this.callId}`);

          // Send initialization message with call_id and system_prompt
          const initMessage = {
            call_id: this.callId,
            system_prompt: this.systemPrompt
          };

          this.ws.send(JSON.stringify(initMessage));
          this.connected = true;

          broadcast({
            type: 'ultravox_connected',
            data: { callId: this.callId, timestamp: new Date().toISOString() }
          });

          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          console.error(`[Ultravox] WebSocket error for call ${this.callId}:`, error.message);
          this.onError(error);
          reject(error);
        });

        this.ws.on('close', () => {
          console.log(`[Ultravox] WebSocket closed for call ${this.callId}`);
          this.connected = false;
          this.onClose();

          broadcast({
            type: 'ultravox_disconnected',
            data: { callId: this.callId, timestamp: new Date().toISOString() }
          });
        });

      } catch (error) {
        console.error(`[Ultravox] Connection error:`, error);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(data) {
    const message = data.toString();

    // Check if it's JSON (end_turn event)
    try {
      const json = JSON.parse(message);

      if (json.event === 'end_turn') {
        console.log(`[Ultravox] Response complete for call ${this.callId}`);
      }
      
      this.onResponse(json);
    } catch {
      // Not JSON, it's a streaming token
      this.responseBuffer += message;
      this.onToken(message);

      broadcast({
        type: 'ultravox_token',
        data: {
          callId: this.callId,
          token: message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Send audio data to Ultravox for processing
   * @param {Buffer} audioBuffer - Audio data (should be WAV/PCM 16kHz)
   */
  sendAudio(audioBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error(`[Ultravox] Cannot send audio - WebSocket not connected for call ${this.callId}`);
      return false;
    }

    this.ws.send(audioBuffer);

    broadcast({
      type: 'ultravox_audio_sent',
      data: {
        callId: this.callId,
        size: audioBuffer.length,
        timestamp: new Date().toISOString()
      }
    });

    return true;
  }

  /**
   * Close the WebSocket connection
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  isConnected() {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Create and register a new Ultravox session for a call
 */
export async function createSession(callId, options = {}) {
  // Close existing session if any
  if (sessions.has(callId)) {
    await closeSession(callId);
  }

  const session = new UltravoxSession(callId, options);

  try {
    await session.connect();
    sessions.set(callId, session);

    console.log(`[Ultravox] Session created for call ${callId}`);
    return session;

  } catch (error) {
    console.error(`[Ultravox] Failed to create session for call ${callId}:`, error);
    throw error;
  }
}

/**
 * Get an existing session by call ID
 */
export function getSession(callId) {
  return sessions.get(callId);
}

/**
 * Close and remove a session
 */
export function closeSession(callId) {
  const session = sessions.get(callId);
  if (session) {
    session.close();
    sessions.delete(callId);
    console.log(`[Ultravox] Session closed for call ${callId}`);
  }
}

/**
 * Send audio to an existing session
 */
export function sendAudioToSession(callId, audioBuffer) {
  const session = sessions.get(callId);
  if (!session) {
    console.error(`[Ultravox] No session found for call ${callId}`);
    return false;
  }
  return session.sendAudio(audioBuffer);
}

/**
 * Get all active sessions
 */
export function getAllSessions() {
  return Array.from(sessions.entries()).map(([callId, session]) => ({
    callId,
    connected: session.isConnected(),
    endpoint: session.endpoint
  }));
}

/**
 * Close all sessions (for cleanup)
 */
export function closeAllSessions() {
  for (const [callId] of sessions) {
    closeSession(callId);
  }
}

export default {
  UltravoxSession,
  createSession,
  getSession,
  closeSession,
  sendAudioToSession,
  getAllSessions,
  closeAllSessions
};
