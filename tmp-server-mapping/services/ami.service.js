import AsteriskManager from 'asterisk-manager';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import config from '../config/config.js';
import { broadcast } from '../websocket/ws.server.js';
import logger from "../config/logger/loggerClient.js";
import { sendCallNoContesta } from './crm.service.js';

let ami = null;
let connected = false;
let reconnectTimeout = null;
let originateTime = null;
let isVoicemail

const state = {
  extensions: new Map(),
  activeCalls: new Map(),
  channels: new Map(),
  lastEvents: [],
  pendingMessages: new Map(),  // Store TTS messages for pending calls
  pendingOriginates: new Map() // channelId -> timestamp (para relacionar con uniqueid)
};

// Persistencia de pendingOriginates
const PENDING_ORIGINATES_FILE = 'data/pending-originates.json';

function savePendingOriginates() {
  try {
    const dir = path.dirname(PENDING_ORIGINATES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = Object.fromEntries(state.pendingOriginates);
    fs.writeFileSync(PENDING_ORIGINATES_FILE, JSON.stringify(data));
  } catch (error) {
    logger.error('[AMI] Error al guardar pendingOriginates:', error.message);
  }
}

function loadPendingOriginates() {
  try {
    if (fs.existsSync(PENDING_ORIGINATES_FILE)) {
      const data = JSON.parse(fs.readFileSync(PENDING_ORIGINATES_FILE, 'utf8'));
      const now = Date.now();
      // Solo cargar los que tengan menos de 60 segundos
      for (const [channelId, timestamp] of Object.entries(data)) {
        if (now - timestamp < 60000) {
          state.pendingOriginates.set(channelId, timestamp);
        }
      }
      logger.info(`[AMI] Cargados ${state.pendingOriginates.size} pendingOriginates desde disco`);
    }
  } catch (error) {
    logger.error('[AMI] Error al cargar pendingOriginates:', error.message);
  }
}

export function initAMI() {
  // Cargar pendingOriginates desde disco al iniciar
  loadPendingOriginates();

  if (ami) {
    ami.disconnect();
  }

  // console.log('[AMI] Connecting to Asterisk Manager Interface...');

  ami = new AsteriskManager(
    config.ami.port,
    config.ami.host,
    config.ami.username,
    config.ami.password,
    true
  );

  ami.keepConnected();

  ami.on('connect', async () => {
    connected = true;
    logger.info('[AMI] Connected successfully');
    broadcast({ type: 'ami_status', data: { connected: true } });

    // Get initial state
    getExtensionsStatus();
  });

  ami.on('disconnect', () => {
    connected = false;
    console.log('[AMI] Disconnected');
    broadcast({ type: 'ami_status', data: { connected: false } });
    scheduleReconnect();
  });

  ami.on('error', (err) => {
    logger.error('[AMI] Error:', err.message);
  });

  // Event handlers
  ami.on('managerevent', (event) => {
    handleAMIEvent(event);
  });

  ami.on('peerstatus', (event) => {
    updateExtensionStatus(event);
  });

  ami.on('newchannel', (event) => {
    handleNewChannel(event);
  });

  ami.on('hangup', (event) => {
    handleHangup(event);
  });

  ami.on('newstate', (event) => {
    handleNewState(event);
    if (event.channelstate === "6") {
      handleAnswer(event);
    }
  });
}

function scheduleReconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  reconnectTimeout = setTimeout(() => {
    logger.info('[AMI] Attempting to reconnect...');
    initAMI();
  }, 5000);
}

function handleAMIEvent(event) {
  const logEvent = {
    timestamp: new Date().toISOString(),
    type: event.event,
    data: event
  };

  state.lastEvents.unshift(logEvent);
  if (state.lastEvents.length > 100) {
    state.lastEvents.pop();
  }

  broadcast({ type: 'ami_event', data: logEvent });
}

function updateExtensionStatus(event) {
  const extension = {
    peer: event.peer,
    status: event.peerstatus,
    address: event.address || null,
    timestamp: new Date().toISOString()
  };

  state.extensions.set(event.peer, extension);
  broadcast({ type: 'extension_update', data: extension });
}

function handleNewChannel(event) {
  // Capturar todas las llamadas nuevas, no solo Ring/Ringing
  // Ignorar canales de tipo Local (bridges internos)
  if (event.channel && !event.channel.startsWith('Local/')) {
    const existingCall = state.activeCalls.get(event.uniqueid);
    if (!existingCall) {
      // Buscar si hay un channelId pendiente (llamada originada recientemente)
      let channelId = event.calleridnum;

      // Si el calleridnum no es válido, buscar en pendingOriginates
      if (!channelId || channelId === '<unknown>' || channelId === 'unknown') {
        // Buscar el originate más reciente (menos de 60 segundos)
        const now = Date.now();
        for (const [pendingChannelId, timestamp] of state.pendingOriginates) {
          if (now - timestamp < 60000) {
            channelId = pendingChannelId;
            state.pendingOriginates.delete(pendingChannelId);
            savePendingOriginates();
            logger.info(`[AMI] Asociando channelId=${channelId} con uniqueid=${event.uniqueid}`);
            break;
          }
        }
      }

      const call = {
        uniqueid: event.uniqueid,
        channel: event.channel,
        callerid: channelId,
        calleridname: event.calleridname,
        exten: event.exten,
        context: event.context,
        state: event.channelstatedesc || 'New',
        startTime: new Date().toISOString(),
      };

      state.activeCalls.set(event.uniqueid, call);
      broadcast({ type: 'call_start', data: call });
    }
  }
}

function handleHangup(event) {
  const call = state.activeCalls.get(event.uniqueid);
  if (call) {
    call.endTime = new Date().toISOString();
    call.cause = event.cause;
    call.causeText = event['cause-txt'];

    // Mapear cause code a status
    const causeCode = parseInt(event.cause);
    let status = 'UNKNOWN';
    if (causeCode === 16) status = 'ANSWER';
    else if (causeCode === 17) status = 'BUSY';
    else if (causeCode === 18 || causeCode === 19 || causeCode === 20) status = 'NO_ANSWER';
    else if (causeCode === 21) status = 'REJECTED';
    else if (causeCode === 34 || causeCode === 38 || causeCode === 41 || causeCode === 42) status = 'CONGESTION';
    else if (causeCode === 0 || causeCode === 22 || causeCode === 28) status = 'INVALID';
    else status = 'FAILED';

    // El channelId está en callerid (el número), no en calleridname (el nombre)
    const channelId = call.callerid;
    logger.info(`[AMI] Hangup: channelId=${channelId}, cause=${causeCode} (${event['cause-txt']}), status=${status}`);

    // Notificar al CRM si la llamada no fue contestada
    // Detección de buzón deshabilitada - el SIP trunk ya lo valida
    // const finalStatus = (status === 'ANSWER' && isVoicemail) ? 'VOICEMAIL' : status;
    if (status !== 'ANSWER') {
      // Import dinámico para evitar dependencia circular
      import('./external-media.service.js').then(({ getAudioSession, removeAudioSession }) => {
        const session = getAudioSession(channelId);
        if (session?.url) {
          sendCallNoContesta({
            provider_call_id: channelId,
            id_llamada: session.data?.id_llamada,
            status: status,
            apiUrl: session.url
          });
          // Limpiar la sesión de audio
          removeAudioSession(channelId);
        } else {
          logger.warn(`[AMI] No se encontró sesión para channelId=${channelId}, no se puede notificar call-no-contesta`);
        }
      });
    }

    broadcast({ type: 'call_end', data: call });
    state.activeCalls.delete(event.uniqueid);
    state.channels.delete(channelId);
  }
}

function handleNewState(event) {
  const call = state.activeCalls.get(event.uniqueid);
  if (call) {
    call.state = event.channelstatedesc;
    broadcast({ type: 'call_update', data: call });
  }
}

function handleAnswer(event) {
  // console.log("[Event]: ", event);
  const call = state.activeCalls.get(event.uniqueid);
  if (call) {
    // console.log("[Call]: ", call);
    state.channels.set(event.calleridnum, event.channel);
    state.activeCalls.set(event.uniqueid, call);

    const ringTime = Date.now() - originateTime;
    isVoicemail = ringTime > 25000;  // Más de 40 seg = probable buzón
    
    // console.log(`[AMI] Llamada contestada en ${ringTime}ms - Buzón: ${isVoicemail}`);
  }
}

export async function getExtensionsStatus() {
  return new Promise((resolve, reject) => {
    if (!connected) {
      resolve([]);
      return;
    }

    ami.action({
      action: 'PJSIPShowEndpoints'
    }, (err, res) => {
      if (err) {
        logger.error('[AMI] Error getting endpoints:', err);
        resolve([]);
        return;
      }
      resolve(res);
    });
  });
}

export async function executeCommand(command) {
  return new Promise((resolve, reject) => {
    if (!connected) {
      reject(new Error('AMI not connected'));
      return;
    }

    ami.action({
      action: 'Command',
      command: command
    }, (err, res) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(res);
    });
  });
}

export async function hangupChannel(channel) {
  return new Promise((resolve, reject) => {
    if (!connected) {
      reject(new Error('AMI not connected'));
      return;
    }

    ami.action({
      action: 'Hangup',
      channel: channel
    }, (err, res) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(res);
    });
  });
}

export function getState() {
  return {
    connected,
    extensions: Array.from(state.extensions.values()),
    activeCalls: Array.from(state.activeCalls.values()),
    lastEvents: state.lastEvents
  };
}

export function isConnected() {
  return connected;
}

export function isVoicemailState() {
  return isVoicemail;
}

// Export function to get and consume pending message (kept for backwards compatibility)
export function getPendingMessage(channelName) {
  return null;
}

/**
 * Originate a call with Ultravox AI using AudioSocket/External Media
 * This uses WebSocket streaming instead of AGI scripts
 *
 * @param {string} destination - Phone number to call
 * @param {string} trunk - PJSIP trunk to use
 * @param {string} audioSocketUrl - WebSocket URL for AudioSocket (your Node.js server)
 */
export async function originateUltravoxCall(destination, idEmpresa, idLlamada = null, trunk = null, prefijoTroncal = null, audioSocketUrl = null) {
  if (!connected) {
    throw new Error('AMI not connected');
  }

  // Usar trunk de config o 'svip_bitel' por defecto si viene vacío
  trunk = trunk || config.ami.trunk || 'svip_bitel';

  // Transformar número según dialplan
  let dialNumber = destination;
  if (trunk === 'svip_bitel') {
    // Para svip_bitel: quitar el 51 y agregar 021
    const numero = destination.startsWith('51') ? destination.slice(2) : destination;
    dialNumber = `021${numero}`;
  } else if (prefijoTroncal) {
    // Solo quitar el 51 cuando el prefijo es 021
    if (prefijoTroncal === '021' && destination.startsWith('51')) {
      dialNumber = `${prefijoTroncal}${destination.slice(2)}`;
    } else {
      dialNumber = `${prefijoTroncal}${destination}`;
    }
  }

  const date = new Date().toISOString();
  const channelId = crypto.randomUUID()
  const record = (idLlamada) + "-" + destination

  // Guardar channelId pendiente para relacionar con uniqueid cuando llegue el evento
  state.pendingOriginates.set(channelId, Date.now());
  savePendingOriginates();

  // AudioSocket server address - TCP connection (NOT WebSocket!)
  const backendHost = config.server?.publicHost || 'localhost';
  const audioSocketPort = config.server?.audioSocketPort || 9092;
  // AudioSocket format: uuid,host:port (TCP address, not ws://)trunk = "servervoip"
  const audioSocketAddress = audioSocketUrl || `${backendHost}:${audioSocketPort}`;

  // console.log(`[AMI] Preparing Ultravox call to ${dialNumber}`);
  // console.log(`[AMI] Channel ID: ${channelId}`);
  // console.log(`[AMI] Trunk: ${trunk}`);
  // console.log(`[AMI] AudioSocket Address: ${audioSocketAddress}`);

  const channel = `PJSIP/${dialNumber}@${trunk}`;
  originateTime = Date.now();

  // Use AudioSocket application for bidirectional audio streaming
  // AudioSocket data format: uuid,server:port
  return new Promise((resolve, reject) => {

    ami.action({
      action: 'Originate',
      channel: channel,
      context: "conversation-bot",
      exten: "s",
      priority: 1,
      callerid: `AIYOU Voice <${channelId}>`,
      timeout: 30000,
      async: true,
      variable: {
        UUID: channelId,
        DESTINATION: destination,
        PORT: audioSocketPort,
        RECORD: record,
        DATE: date.split("T")[0],
        ID_EMPRESA: idEmpresa || 0
      }
    }, (err, res) => {
      if (err) {
        reject(err);
        return;
      }
      logger.info(`[AMI] Ultravox call originated successfully to ${dialNumber} via trunk ${trunk}`);
      resolve({
        ...res,
        channelId,
        record,
        recordDate: date.split("T")[0],
        destination: dialNumber,
      });
    });
  });
}

export function redirectCall(channelId) {
  const channel  = state.channels.get(channelId.replaceAll("-", ""));

  return new Promise((resolve, reject) => {
    ami.action({
      action: "Redirect",
      channel: channel,
      context: "transferencia",
      exten: "s",
      priority: 1,
    }, (err, res) => {
      if (err) {
        reject(err);
        return;
      }
      logger.info(`[AMI] Redireccionando a ${channel}`);
      resolve({
        ...res,
        channel: channel
      })
    })
  })
}