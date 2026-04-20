import fs from 'fs';
import path from 'path';
import config from '../config/config.js';
import WebSocket from 'ws';

// Tu API de TTS
const TTS_API = config.tts.url;

// Directorio local para archivos TTS
const TTS_OUTPUT_DIR = config.tts.output;
const sessions = new Map();

/**
 * Generate TTS audio using Slinky Edge TTS API
 */
export class CoquiXTTS {
  constructor(callId, options = {}) {
    this.callId = callId;
    this.ws = null;
    this.connected = false;
    this.endpoint = config.tts.url;
    this.responseBuffer = "";

    this.onJson = options.onJson || (() => { });
    this.onBytes = options.onBytes || (() => {})
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[CoquiXTTS] Connecting to ${this.endpoint} for call ${this.callId}`);
        this.ws = new WebSocket(this.endpoint);
        
        this.ws.on("open", () => {
          console.log(`[CoquiXTTS] WebSocket connected for call ${this.callId}`);
          this.connected = true;

          resolve();
        });

        this.ws.on("message", (data) => {
          this.handleMessage(data);
        });

        this.ws.on("error", (error) => {
          console.error(`[CoquiXTTS] WebSocket error for call ${this.callId}:`, error.message);
          reject(error);
        });

        this.ws.on("close", () => {
          console.log(`[CoquiXTTS] WebSocket closed for call ${this.callId}`);
          this.connected = false;
        })
      } catch (error) {
        console.error(`[CoquiXTTS] Connection error:`, error);
        reject(error);
      }
    });
  }

  handleMessage(data) {
    const message = data.toString()
    try {
      const json = JSON.parse(message);

      this.onJson(json);
    } catch {
      // console.log("[CoquiXTTS] Error al manejar data: ", error);
      this.onBytes(data);
    }
  }

  sendChunks(chunk) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error(`[CoquiXTTS] Cannot send chunk - WebSocket not connected for call ${this.callId}`);
      return false;
    }

    this.ws.send(JSON.stringify({"texto": chunk}));

    return true;
  }

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

export async function createSession(callId, options = {}) {
  // Close existing session if any
  if (sessions.has(callId)) {
    await closeSession(callId);
  }

  const session = new CoquiXTTS(callId, options);

  try {
    await session.connect();
    sessions.set(callId, session);

    console.log(`[CoquiXTTS] Session created for call ${callId}`);
    return session;

  } catch (error) {
    console.error(`[CoquiXTTS] Failed to create session for call ${callId}:`, error);
    throw error;
  }
}

export function closeSession(callId) {
  const session = sessions.get(callId);
  if (session) {
    session.close();
    sessions.delete(callId);
    console.log(`[CoquiXTTS] Session closed for call ${callId}`);
  }
}


export async function generateTTS(text, options = {}) {
  const outputDir = options.outputDir || TTS_OUTPUT_DIR;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log(`[TTS] Generating audio for: "${text}"`);

    // Llamada HTTP POST a tu API
    const response = await fetch(TTS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_text: text})
    });

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.status} ${response.statusText}`);
    }

    const pcmResponse = await response.arrayBuffer();
    if (!pcmResponse) {
      throw new Error('TTS API did not return media data');
    }

    const audioBuffer = new Int16Array(pcmResponse);
    const pcmBuffer = Buffer.from(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength);

    console.log('[TTS] PCM generated:', pcmBuffer.length, 'bytes');

    return {
      success: true,
      data: pcmBuffer
    }

  } catch (error) {
    console.error('[TTS] Error generating audio:', error);
    throw new Error(`TTS generation failed: ${error.message}`);
  }
}

/**
 * Delete a TTS audio file
 */
export function deleteTTSFile(filename) {
  const outputDir = config.tts.output;
  const wavPath = path.join(outputDir, `${filename}.wav`);

  try {
    if (fs.existsSync(wavPath)) {
      fs.unlinkSync(wavPath);
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  CoquiXTTS,
  createSession,
  closeSession
}