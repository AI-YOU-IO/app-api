import ariClient from 'ari-client';
import { exec } from 'child_process';
import { promisify } from 'util';
import config from '../config/config.js';
import { broadcast } from '../websocket/ws.server.js';
import { generateTTS } from './tts.service.js';
import { getPendingMessage } from './ami.service.js';

const execAsync = promisify(exec);

let ari = null;
let connected = false;
let reconnectTimeout = null;

const state = {
  channels: new Map(),
  bridges: new Map(),
  lastEvents: []
};

// Mensaje de bienvenida
const WELCOME_MESSAGE = 'Hola, soy el servicio de voz de agencia eslinki';

export async function initARI() {
  console.log('[ARI] Connecting to Asterisk REST Interface...');
  console.log(`[ARI] URL: ${config.ari.url}, User: ${config.ari.username}, App: ${config.ari.app}`);

  // Use promise-based connection with callback
  ariClient.connect(
    config.ari.url,
    config.ari.username,
    config.ari.password,
    clientReady
  ).catch(err => {
    console.error('[ARI] Connect promise error:', err.message);
    connected = false;
    broadcast({ type: 'ari_status', data: { connected: false } });
    scheduleReconnect();
  });
}

function clientReady(err, client) {
  if (err) {
    console.error('[ARI] Connection error in callback:', err.message);
    connected = false;
    broadcast({ type: 'ari_status', data: { connected: false } });
    scheduleReconnect();
    return;
  }

  ari = client;
  console.log('[ARI] Client connected via callback, setting up handlers...');

  // Setup event handlers before starting
  setupEventHandlers();

  // Handle WebSocket events
  ari.on('WebSocketConnected', () => {
    console.log('[ARI] WebSocket connected event');
    connected = true;
    broadcast({ type: 'ari_status', data: { connected: true } });
  });

  ari.on('WebSocketError', (wsErr) => {
    console.error('[ARI] WebSocket error:', wsErr);
    connected = false;
    broadcast({ type: 'ari_status', data: { connected: false } });
  });

  ari.on('WebSocketReconnecting', () => {
    console.log('[ARI] WebSocket reconnecting...');
  });

  // Start the Stasis application
  console.log(`[ARI] Starting Stasis app: ${config.ari.app}`);
  ari.start(config.ari.app);

  // Set connected after successful connect
  connected = true;
  console.log('[ARI] Connected and Stasis app started successfully');
  broadcast({ type: 'ari_status', data: { connected: true } });
}

function scheduleReconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  reconnectTimeout = setTimeout(() => {
    console.log('[ARI] Attempting to reconnect...');
    initARI();
  }, 5000);
}

function setupEventHandlers() {
  // Channel enters Stasis app
  ari.on('StasisStart', async (event, channel) => {
    console.log(`[ARI] StasisStart: ${channel.id}, args: ${event.args}`);

    const channelData = {
      id: channel.id,
      name: channel.name,
      caller: channel.caller,
      connected: channel.connected,
      state: channel.state,
      creationtime: channel.creationtime,
      dialplan: channel.dialplan
    };

    state.channels.set(channel.id, channelData);

    const logEvent = {
      timestamp: new Date().toISOString(),
      type: 'StasisStart',
      data: channelData
    };

    state.lastEvents.unshift(logEvent);
    if (state.lastEvents.length > 100) {
      state.lastEvents.pop();
    }

    broadcast({ type: 'ari_event', data: logEvent });
    broadcast({ type: 'stasis_start', data: channelData });

    // Answer the channel
    channel.answer((err) => {
      if (err) {
        console.error('[ARI] Error answering channel:', err);
        return;
      }

      // Verificar si es una llamada de bienvenida
      if (event.args && event.args.includes('welcome')) {
        playWelcomeMessage(channel);
      }
    });
  });

  // Channel leaves Stasis app
  ari.on('StasisEnd', (event, channel) => {
    console.log(`[ARI] StasisEnd: ${channel.id}`);

    const channelData = state.channels.get(channel.id);

    const logEvent = {
      timestamp: new Date().toISOString(),
      type: 'StasisEnd',
      data: { id: channel.id, ...channelData }
    };

    state.lastEvents.unshift(logEvent);
    if (state.lastEvents.length > 100) {
      state.lastEvents.pop();
    }

    state.channels.delete(channel.id);
    broadcast({ type: 'ari_event', data: logEvent });
    broadcast({ type: 'stasis_end', data: { id: channel.id } });
  });

  // Channel state changed
  ari.on('ChannelStateChange', (event, channel) => {
    const channelData = state.channels.get(channel.id);
    if (channelData) {
      channelData.state = channel.state;
      state.channels.set(channel.id, channelData);
    }

    const logEvent = {
      timestamp: new Date().toISOString(),
      type: 'ChannelStateChange',
      data: { id: channel.id, state: channel.state }
    };

    state.lastEvents.unshift(logEvent);
    broadcast({ type: 'ari_event', data: logEvent });
  });

  // Channel destroyed
  ari.on('ChannelDestroyed', (event, channel) => {
    console.log(`[ARI] ChannelDestroyed: ${channel.id}`);

    const logEvent = {
      timestamp: new Date().toISOString(),
      type: 'ChannelDestroyed',
      data: { id: channel.id, cause: event.cause, cause_txt: event.cause_txt }
    };

    state.lastEvents.unshift(logEvent);
    state.channels.delete(channel.id);
    broadcast({ type: 'ari_event', data: logEvent });
  });

  // Playback finished
  ari.on('PlaybackFinished', (event, playback) => {
    console.log(`[ARI] PlaybackFinished: ${playback.id}`);

    const logEvent = {
      timestamp: new Date().toISOString(),
      type: 'PlaybackFinished',
      data: { id: playback.id, media_uri: playback.media_uri }
    };

    state.lastEvents.unshift(logEvent);
    broadcast({ type: 'ari_event', data: logEvent });
    broadcast({ type: 'playback_finished', data: { playbackId: playback.id } });
  });

  // DTMF received
  ari.on('ChannelDtmfReceived', (event, channel) => {
    console.log(`[ARI] DTMF: ${event.digit} on ${channel.id}`);

    const logEvent = {
      timestamp: new Date().toISOString(),
      type: 'ChannelDtmfReceived',
      data: { channelId: channel.id, digit: event.digit }
    };

    state.lastEvents.unshift(logEvent);
    broadcast({ type: 'ari_event', data: logEvent });
    broadcast({ type: 'dtmf_received', data: { channelId: channel.id, digit: event.digit } });
  });
}

/**
 * Upload audio file to Asterisk server via SCP using sshpass
 */
async function uploadToAsterisk(localPath, filename) {
  const { host, sshUser, sshPassword, soundsPath } = config.asterisk;
  const remotePath = `${soundsPath}/${filename}`;

  try {
    // First, ensure the remote directory exists
    const mkdirCmd = `sshpass -p '${sshPassword}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 ${sshUser}@${host} "mkdir -p ${soundsPath}"`;
    console.log(`[ARI] Creating remote directory: ${soundsPath}`);
    await execAsync(mkdirCmd, { timeout: 60000 });

    // Upload the file via SCP with sshpass
    const scpCommand = `sshpass -p '${sshPassword}' scp -o StrictHostKeyChecking=no -o ConnectTimeout=30 "${localPath}" ${sshUser}@${host}:${remotePath}`;
    console.log(`[ARI] Uploading TTS audio to ${remotePath}`);
    await execAsync(scpCommand, { timeout: 60000 });

    console.log(`[ARI] Audio uploaded successfully to ${remotePath}`);
    return remotePath;
  } catch (error) {
    console.error('[ARI] Error uploading audio to Asterisk:', error.message);
    throw error;
  }
}

/**
 * Play welcome message with TTS
 */
async function playWelcomeMessage(channel) {
  try {
    console.log(`[ARI] Playing welcome message on channel ${channel.id}`);
    console.log(`[ARI] Channel name: ${channel.name}`);

    // Check for a custom message from the frontend
    const customMessage = getPendingMessage(channel.name);
    const messageToSpeak = customMessage || WELCOME_MESSAGE;

    console.log(`[ARI] Message to speak: ${messageToSpeak.substring(0, 50)}...`);

    // Generar TTS localmente
    const ttsResult = await generateTTS(messageToSpeak);
    console.log(`[ARI] TTS generated: ${ttsResult.path}`);

    // Upload to Asterisk server
    const remotePath = await uploadToAsterisk(ttsResult.path, ttsResult.filename + '.wav');
    console.log(`[ARI] Audio available on Asterisk at: ${remotePath}`);

    // Play the uploaded TTS audio (without .wav extension for Asterisk)
    const soundName = `tts/${ttsResult.filename}`;
    console.log(`[ARI] Playing sound: ${soundName}`);

    channel.play({ media: `sound:${soundName}` }, (err, playback) => {
      if (err) {
        console.error('[ARI] Error playing TTS sound:', err);
        // Fallback to built-in sound
        console.log('[ARI] Falling back to built-in sound...');
        channel.play({ media: 'sound:hello-world' }, (err2, playback2) => {
          if (err2) {
            console.error('[ARI] Fallback also failed:', err2);
            channel.hangup();
            return;
          }
          playback2.on('PlaybackFinished', () => {
            channel.hangup();
          });
        });
        return;
      }

      console.log(`[ARI] Playback started: ${playback.id}`);

      // Cuando termine el playback, colgar
      playback.on('PlaybackFinished', () => {
        console.log(`[ARI] Welcome message finished, hanging up`);
        channel.hangup();
      });
    });

  } catch (error) {
    console.error('[ARI] Error in playWelcomeMessage:', error);
    // Try to play fallback sound
    try {
      channel.play({ media: 'sound:hello-world' }, (err, playback) => {
        if (!err && playback) {
          playback.on('PlaybackFinished', () => {
            channel.hangup();
          });
        } else {
          channel.hangup();
        }
      });
    } catch (e) {
      channel.hangup();
    }
  }
}

export async function playSound(channelId, soundFile) {
  if (!connected || !ari) {
    throw new Error('ARI not connected');
  }

  const channel = ari.Channel({ id: channelId });

  return new Promise((resolve, reject) => {
    channel.play({ media: `sound:${soundFile}` }, (err, playback) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(playback);
    });
  });
}

export async function hangupChannel(channelId) {
  if (!connected || !ari) {
    throw new Error('ARI not connected');
  }

  const channel = ari.Channel({ id: channelId });

  return new Promise((resolve, reject) => {
    channel.hangup((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ success: true });
    });
  });
}

export async function getChannels() {
  if (!connected || !ari) {
    return [];
  }

  return new Promise((resolve, reject) => {
    ari.channels.list((err, channels) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(channels);
    });
  });
}

export function getState() {
  return {
    connected,
    channels: Array.from(state.channels.values()),
    lastEvents: state.lastEvents
  };
}

export function isConnected() {
  return connected;
}

export function getARI() {
  return ari;
}
