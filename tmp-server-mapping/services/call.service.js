import { getARI, playSound, hangupChannel as ariHangup } from './ari.service.js';
import { generateTTS, deleteTTSFile } from './tts.service.js';
import { broadcast } from '../websocket/ws.server.js';
import { createSession as createUltravoxSession, getSession as getUltravoxSession, closeSession as closeUltravoxSession, sendAudioToSession } from './ultravox.service.js';

/**
 * Active bot sessions
 */
const botSessions = new Map();

/**
 * Create a new bot session for a channel
 */
export function createBotSession(channelId, options = {}) {
  const session = {
    channelId,
    state: 'greeting',
    context: options.context || {},
    history: [],
    createdAt: new Date().toISOString()
  };

  botSessions.set(channelId, session);
  broadcast({ type: 'bot_session_start', data: session });

  return session;
}

/**
 * Get bot session by channel ID
 */
export function getBotSession(channelId) {
  return botSessions.get(channelId);
}

/**
 * End bot session
 */
export function endBotSession(channelId) {
  const session = botSessions.get(channelId);
  if (session) {
    session.endedAt = new Date().toISOString();
    broadcast({ type: 'bot_session_end', data: session });
    botSessions.delete(channelId);
  }
}

/**
 * Speak text on a channel using TTS
 */
export async function speak(channelId, text, options = {}) {
  try {
    // Generate TTS audio
    const ttsResult = await generateTTS(text, options);

    if (!ttsResult.success) {
      throw new Error('TTS generation failed');
    }

    // Log the action
    const logEntry = {
      type: 'speak',
      channelId,
      text,
      timestamp: new Date().toISOString()
    };

    broadcast({ type: 'bot_action', data: logEntry });

    // Play the audio on the channel
    const playback = await playSound(channelId, ttsResult.soundPath);

    // Schedule cleanup of TTS file after playback
    setTimeout(() => {
      deleteTTSFile(ttsResult.filename);
    }, 60000); // Clean up after 1 minute

    return {
      success: true,
      playbackId: playback.id,
      text
    };

  } catch (error) {
    console.error('[Call] Error speaking:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Hangup a call
 */
export async function hangup(channelId) {
  try {
    await ariHangup(channelId);
    endBotSession(channelId);

    broadcast({
      type: 'bot_action',
      data: {
        type: 'hangup',
        channelId,
        timestamp: new Date().toISOString()
      }
    });

    return { success: true };

  } catch (error) {
    console.error('[Call] Error hanging up:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process user input (from STT)
 */
export async function processUserInput(channelId, text) {
  const session = getBotSession(channelId);

  if (!session) {
    console.error('[Call] No bot session found for channel:', channelId);
    return;
  }

  // Add to history
  session.history.push({
    role: 'user',
    text,
    timestamp: new Date().toISOString()
  });

  broadcast({
    type: 'bot_transcript',
    data: {
      channelId,
      role: 'user',
      text,
      timestamp: new Date().toISOString()
    }
  });

  // Here you would integrate with your AI/LLM for response generation
  // For now, this is a placeholder
  const response = await generateBotResponse(session, text);

  // Add bot response to history
  session.history.push({
    role: 'assistant',
    text: response,
    timestamp: new Date().toISOString()
  });

  broadcast({
    type: 'bot_transcript',
    data: {
      channelId,
      role: 'assistant',
      text: response,
      timestamp: new Date().toISOString()
    }
  });

  // Speak the response
  await speak(channelId, response);
}

/**
 * Generate bot response (placeholder - integrate with your AI)
 */
async function generateBotResponse(session, userInput) {
  // This is a simple placeholder
  // Replace with your Ultrabox/LLM integration

  const responses = {
    greeting: '¡Hola! Gracias por llamar. ¿En qué puedo ayudarte?',
    default: 'Entiendo. ¿Hay algo más en lo que pueda ayudarte?',
    goodbye: 'Gracias por tu llamada. ¡Hasta luego!'
  };

  const lowerInput = userInput.toLowerCase();

  if (lowerInput.includes('adios') || lowerInput.includes('bye') || lowerInput.includes('chao')) {
    session.state = 'ending';
    return responses.goodbye;
  }

  if (session.state === 'greeting') {
    session.state = 'conversation';
    return responses.greeting;
  }

  return responses.default;
}

/**
 * Get all active bot sessions
 */
export function getAllBotSessions() {
  return Array.from(botSessions.values());
}

/**
 * Start an Ultravox AI session for a call
 * This connects to the FastAPI WebSocket for audio-to-text inference
 */
export async function startUltravoxSession(channelId, options = {}) {
  try {
    const session = await createUltravoxSession(channelId, {
      systemPrompt: options.systemPrompt,
      onToken: (token) => {
        // Streaming token received
        broadcast({
          type: 'bot_token',
          data: { channelId, token, timestamp: new Date().toISOString() }
        });
      },
      onResponse: async (response) => {
        // Full response received - speak it via TTS
        const botSession = getBotSession(channelId);
        if (botSession) {
          botSession.history.push({
            role: 'assistant',
            text: response,
            timestamp: new Date().toISOString()
          });
        }

        broadcast({
          type: 'bot_transcript',
          data: { channelId, role: 'assistant', text: response, timestamp: new Date().toISOString() }
        });

        // Speak the response
        await speak(channelId, response);
      },
      onError: (error) => {
        console.error(`[Call] Ultravox error for ${channelId}:`, error);
        broadcast({
          type: 'bot_error',
          data: { channelId, error: error.message, timestamp: new Date().toISOString() }
        });
      }
    });

    // Create bot session to track conversation
    createBotSession(channelId, { ultravox: true, ...options });

    console.log(`[Call] Ultravox session started for channel ${channelId}`);
    return session;

  } catch (error) {
    console.error(`[Call] Failed to start Ultravox session:`, error);
    throw error;
  }
}

/**
 * Send audio to Ultravox for processing
 * @param {string} channelId - The channel/call ID
 * @param {Buffer} audioBuffer - Audio data (WAV/PCM 16kHz)
 */
export function sendAudioToUltravox(channelId, audioBuffer) {
  const session = getUltravoxSession(channelId);
  if (!session) {
    console.error(`[Call] No Ultravox session for channel ${channelId}`);
    return false;
  }

  // Track in bot session history
  const botSession = getBotSession(channelId);
  if (botSession) {
    botSession.history.push({
      role: 'user',
      type: 'audio',
      size: audioBuffer.length,
      timestamp: new Date().toISOString()
    });
  }

  return sendAudioToSession(channelId, audioBuffer);
}

/**
 * End Ultravox session for a call
 */
export function endUltravoxSession(channelId) {
  closeUltravoxSession(channelId);
  endBotSession(channelId);
  console.log(`[Call] Ultravox session ended for channel ${channelId}`);
}

/**
 * Start greeting for a new call
 */
export async function startGreeting(channelId) {
  const session = createBotSession(channelId);

  // Wait a moment before greeting
  await new Promise(resolve => setTimeout(resolve, 500));

  await speak(channelId, '¡Bienvenido a AIYOU Voice! ¿En qué puedo ayudarte hoy?');

  return session;
}
