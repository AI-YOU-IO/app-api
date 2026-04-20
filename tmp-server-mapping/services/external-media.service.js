import net from 'net';
import fs from 'fs';
import path from 'path';
import config from '../config/config.js';
import { broadcast } from '../websocket/ws.server.js';
import { createSession as createUltravoxSession, closeSession as closeUltravoxSession } from './ultravox.service.js';
import { createSession as createCoquiSession, closeSession as closeCoquiSession, generateTTS } from './tts.service.js';
import { createSession as createUltraVoxAPISession, closeSession as closeUltravoxAPISession, getCallTranscription, getCallMetadata } from "./ultravoxapi.service.js"
import { RealTimeVAD } from 'avr-vad';
import { isVoicemailState, originateUltravoxCall } from './ami.service.js';
import { uploadCallAudio, sendTranscription, sendCallTerminada, sendCallEntrada, sendCallNoContesta, getRecordingPath } from './crm.service.js';
import logger from "../config/logger/loggerClient.js";

/**
* Servicio multimedia externo
* Gestiona la transmisión de audio bidireccional entre Asterisk y Ultravox
*
* IMPORTANTE: ¡Asterisk AudioSocket usa TCP, NO WebSocket!
* Protocolo: encabezado de 3 bytes (1 byte de tipo + 2 bytes de longitud de enlace) + carga útil
*/

// Servidor TCP para recibir audio de Asterisk
let audioServer = null;

// Active audio sessions
const audioSessions = new Map();

// NOTA: Las colas se almacenan directamente en disco (ver PERSISTENCIA DE COLAS)
// Ya no usamos Map en memoria para las colas

// Configuraciones de campañas por ID (estas sí se mantienen en memoria)
const campaignConfigs = new Map(); // campaniaId -> { config_llamadas, empresaId, plataforma }

// ==================== PERSISTENCIA DE COLAS (PARTICIONADA POR CAMPAÑA + CHUNKS) ====================

// Estructura de directorios:
// ./data/
//   ├── queues/
//   │   └── {empresaId}-{plataforma}/
//   │       └── campaign-{campaniaId}/
//   │           ├── chunk-001.json    (máx MAX_CALLS_PER_CHUNK llamadas)
//   │           ├── chunk-002.json
//   │           └── ...
//   └── campaigns.json

const DATA_DIR = config.dataDir || './data';
const QUEUES_DIR = path.join(DATA_DIR, 'queues');
const CAMPAIGN_FILE_PATH = path.join(DATA_DIR, 'campaigns.json');
const SAVE_INTERVAL_MS = 30000; // Guardar cada 30 segundos
const MAX_CALLS_PER_CHUNK = 10000; // Máximo de llamadas por archivo chunk

let saveInterval = null;

// Set para rastrear qué chunks han sido modificados (dirty flag)
// Formato: "empresaId-plataforma/campaign-X/chunk-XXX"
const dirtyChunks = new Set();

/**
 * Asegurar que un directorio existe
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Obtener ruta del directorio de una empresa-plataforma
 */
function getQueueDir(empresaId, plataforma) {
  const safeKey = `${empresaId}-${plataforma || 'DEFAULT'}`.replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(QUEUES_DIR, safeKey);
}

/**
 * Obtener ruta del directorio de una campaña
 */
function getCampaignDir(empresaId, plataforma, campaniaId) {
  const queueDir = getQueueDir(empresaId, plataforma);
  const safeCampaignId = `campaign-${campaniaId || 'default'}`.replace(/[^a-zA-Z0-9-_]/g, '_');
  return path.join(queueDir, safeCampaignId);
}

/**
 * Obtener ruta de un chunk específico
 */
function getChunkPath(empresaId, plataforma, campaniaId, chunkNumber) {
  const campaignDir = getCampaignDir(empresaId, plataforma, campaniaId);
  const chunkName = `chunk-${String(chunkNumber).padStart(3, '0')}.json`;
  return path.join(campaignDir, chunkName);
}

/**
 * Obtener lista de chunks de una campaña ordenados
 */
function getChunkFiles(empresaId, plataforma, campaniaId) {
  const campaignDir = getCampaignDir(empresaId, plataforma, campaniaId);

  if (!fs.existsSync(campaignDir)) {
    return [];
  }

  const files = fs.readdirSync(campaignDir)
    .filter(f => f.startsWith('chunk-') && f.endsWith('.json'))
    .sort();

  return files.map(f => path.join(campaignDir, f));
}

/**
 * Obtener el número del último chunk de una campaña
 */
function getLastChunkNumber(empresaId, plataforma, campaniaId) {
  const files = getChunkFiles(empresaId, plataforma, campaniaId);

  if (files.length === 0) {
    return 0;
  }

  const lastFile = path.basename(files[files.length - 1]);
  const match = lastFile.match(/chunk-(\d+)\.json/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Leer un chunk desde archivo
 */
function readChunk(chunkPath) {
  try {
    if (!fs.existsSync(chunkPath)) {
      return [];
    }
    const data = fs.readFileSync(chunkPath, 'utf8');
    if (!data || data.trim() === '') {
      logger.error(`[Persistence] Chunk vacío, eliminando: ${chunkPath}`);
      fs.unlinkSync(chunkPath);
      return [];
    }
    return JSON.parse(data);
  } catch (error) {
    logger.error(`[Persistence] Error al leer chunk ${chunkPath}: ${error.name} - ${error.message}`);
    // Si es error de JSON, mostrar los primeros 100 caracteres del contenido
    if (error instanceof SyntaxError) {
      try {
        const content = fs.readFileSync(chunkPath, 'utf8');
        logger.error(`[Persistence] Contenido corrupto (primeros 100 chars): ${content.substring(0, 100)}`);
        // Eliminar archivo corrupto
        fs.unlinkSync(chunkPath);
        logger.info(`[Persistence] Chunk corrupto eliminado: ${chunkPath}`);
      } catch (e) {
        // Ignorar
      }
    }
    return [];
  }
}

/**
 * Escribir un chunk a archivo
 */
function writeChunk(chunkPath, calls) {
  try {
    ensureDir(path.dirname(chunkPath));
    fs.writeFileSync(chunkPath, JSON.stringify(calls, null, 2));
    return true;
  } catch (error) {
    logger.error(`[Persistence] Error al escribir chunk ${chunkPath}:`, error.message);
    return false;
  }
}

/**
 * Marcar un chunk como modificado
 */
function markChunkDirty(empresaId, plataforma, campaniaId, chunkNumber) {
  const key = `${empresaId}-${plataforma}/campaign-${campaniaId}/chunk-${chunkNumber}`;
  dirtyChunks.add(key);
}

/**
 * Agregar llamada a los chunks de una campaña
 * Retorna la posición en la cola
 */
function addCallToChunks(empresaId, plataforma, campaniaId, callData) {
  const campaignDir = getCampaignDir(empresaId, plataforma, campaniaId);
  ensureDir(campaignDir);

  // Obtener el último chunk
  let lastChunkNumber = getLastChunkNumber(empresaId, plataforma, campaniaId);
  if (lastChunkNumber === 0) lastChunkNumber = 1;

  const lastChunkPath = getChunkPath(empresaId, plataforma, campaniaId, lastChunkNumber);
  let lastChunk = readChunk(lastChunkPath);

  // Si el chunk está lleno, crear uno nuevo
  if (lastChunk.length >= MAX_CALLS_PER_CHUNK) {
    lastChunkNumber++;
    lastChunk = [];
  }

  // Agregar la llamada
  lastChunk.push(callData);

  // Guardar el chunk
  const chunkPath = getChunkPath(empresaId, plataforma, campaniaId, lastChunkNumber);
  writeChunk(chunkPath, lastChunk);

  // Marcar como dirty
  markChunkDirty(empresaId, plataforma, campaniaId, lastChunkNumber);

  // Calcular posición total en la cola de la campaña
  const totalInPreviousChunks = (lastChunkNumber - 1) * MAX_CALLS_PER_CHUNK;
  return totalInPreviousChunks + lastChunk.length;
}

/**
 * Obtener la primera llamada de los chunks de una campaña (FIFO)
 * Retorna { call, chunkNumber, indexInChunk } o null
 */
function getFirstCallFromChunks(empresaId, plataforma, campaniaId) {
  const chunkFiles = getChunkFiles(empresaId, plataforma, campaniaId);

  for (const chunkPath of chunkFiles) {
    const chunk = readChunk(chunkPath);
    if (chunk.length > 0) {
      const match = path.basename(chunkPath).match(/chunk-(\d+)\.json/);
      const chunkNumber = match ? parseInt(match[1]) : 1;
      return {
        call: chunk[0],
        chunkPath,
        chunkNumber,
        indexInChunk: 0,
        chunk
      };
    }
  }

  return null;
}

/**
 * Remover la primera llamada de un chunk
 */
function removeFirstCallFromChunk(chunkPath, chunk, empresaId, plataforma, campaniaId, chunkNumber) {
  chunk.shift();

  if (chunk.length === 0) {
    // Eliminar el archivo si el chunk está vacío
    try {
      fs.unlinkSync(chunkPath);
      logger.info(`[Persistence] Chunk eliminado (vacío): ${path.basename(chunkPath)}`);

      // Limpiar directorios vacíos
      cleanEmptyDirs(empresaId, plataforma, campaniaId);
    } catch (error) {
      logger.error(`[Persistence] Error al eliminar chunk:`, error.message);
    }
  } else {
    writeChunk(chunkPath, chunk);
    markChunkDirty(empresaId, plataforma, campaniaId, chunkNumber);
  }
}

/**
 * Limpiar directorios vacíos
 */
function cleanEmptyDirs(empresaId, plataforma, campaniaId) {
  try {
    const campaignDir = getCampaignDir(empresaId, plataforma, campaniaId);
    if (fs.existsSync(campaignDir) && fs.readdirSync(campaignDir).length === 0) {
      fs.rmdirSync(campaignDir);

      const queueDir = getQueueDir(empresaId, plataforma);
      if (fs.existsSync(queueDir) && fs.readdirSync(queueDir).length === 0) {
        fs.rmdirSync(queueDir);
      }
    }
  } catch (error) {
    // Ignorar errores de limpieza
  }
}

/**
 * Contar total de llamadas en una campaña
 */
function countCallsInCampaign(empresaId, plataforma, campaniaId) {
  const chunkFiles = getChunkFiles(empresaId, plataforma, campaniaId);
  let total = 0;

  for (const chunkPath of chunkFiles) {
    const chunk = readChunk(chunkPath);
    total += chunk.length;
  }

  return total;
}

/**
 * Contar total de llamadas en una empresa-plataforma
 */
function countCallsInQueue(empresaId, plataforma) {
  const queueDir = getQueueDir(empresaId, plataforma);

  if (!fs.existsSync(queueDir)) {
    return 0;
  }

  let total = 0;
  const campaignDirs = fs.readdirSync(queueDir).filter(f => f.startsWith('campaign-'));

  for (const campaignDir of campaignDirs) {
    const campaignPath = path.join(queueDir, campaignDir);
    const chunkFiles = fs.readdirSync(campaignPath).filter(f => f.endsWith('.json'));

    for (const chunkFile of chunkFiles) {
      const chunk = readChunk(path.join(campaignPath, chunkFile));
      total += chunk.length;
    }
  }

  return total;
}

/**
 * Obtener todas las campañas de una empresa-plataforma
 */
function getCampaignsInQueue(empresaId, plataforma) {
  const queueDir = getQueueDir(empresaId, plataforma);

  if (!fs.existsSync(queueDir)) {
    return [];
  }

  return fs.readdirSync(queueDir)
    .filter(f => f.startsWith('campaign-'))
    .map(f => f.replace('campaign-', ''));
}

/**
 * Guardar configuraciones de campañas
 */
function saveCampaignConfigs() {
  try {
    ensureDir(DATA_DIR);

    const campaignData = {};
    for (const [key, value] of campaignConfigs.entries()) {
      campaignData[key] = value;
    }

    fs.writeFileSync(CAMPAIGN_FILE_PATH, JSON.stringify(campaignData, null, 2));
  } catch (error) {
    logger.error(`[Persistence] Error al guardar campañas:`, error.message);
  }
}

/**
 * Guardar solo los chunks modificados (dirty)
 */
function saveDirtyQueues() {
  if (dirtyChunks.size === 0) {
    return;
  }

  // Los chunks ya se guardan al modificarse, solo limpiamos el set
  const count = dirtyChunks.size;
  dirtyChunks.clear();

  if (count > 0) {
    logger.info(`[Persistence] ${count} chunks procesados`);
  }
}

/**
 * Guardar todo (para shutdown)
 */
function saveAllQueues() {
  saveCampaignConfigs();
  dirtyChunks.clear();
  logger.info(`[Persistence] Configuraciones guardadas`);
}

/**
 * Cargar todas las colas desde los archivos
 */
function loadQueuesFromFile() {
  try {
    ensureDir(QUEUES_DIR);

    let totalCalls = 0;
    let totalCampaigns = 0;

    // Contar llamadas existentes
    if (fs.existsSync(QUEUES_DIR)) {
      const queueDirs = fs.readdirSync(QUEUES_DIR);

      for (const queueDir of queueDirs) {
        const queuePath = path.join(QUEUES_DIR, queueDir);
        if (fs.statSync(queuePath).isDirectory()) {
          const campaignDirs = fs.readdirSync(queuePath).filter(f => f.startsWith('campaign-'));

          for (const campaignDir of campaignDirs) {
            const campaignPath = path.join(queuePath, campaignDir);
            const chunkFiles = fs.readdirSync(campaignPath).filter(f => f.endsWith('.json'));

            for (const chunkFile of chunkFiles) {
              const chunk = readChunk(path.join(campaignPath, chunkFile));
              totalCalls += chunk.length;
            }
            totalCampaigns++;
          }
        }
      }

      if (totalCalls > 0) {
        logger.info(`[Persistence] Colas encontradas: ${totalCalls} llamadas en ${totalCampaigns} campañas`);
      }
    }

    // Cargar configuraciones de campañas
    if (fs.existsSync(CAMPAIGN_FILE_PATH)) {
      const data = fs.readFileSync(CAMPAIGN_FILE_PATH, 'utf8');
      const campaignData = JSON.parse(data);

      for (const [key, value] of Object.entries(campaignData)) {
        campaignConfigs.set(key, value);
      }

      logger.info(`[Persistence] Configuraciones de campaña cargadas: ${Object.keys(campaignData).length}`);
    }
  } catch (error) {
    logger.error(`[Persistence] Error al cargar colas:`, error.message);
  }
}

/**
 * Iniciar guardado periódico
 */
function startPeriodicSave() {
  if (saveInterval) {
    clearInterval(saveInterval);
  }

  saveInterval = setInterval(() => {
    // Solo guardar las colas que fueron modificadas
    saveDirtyQueues();
  }, SAVE_INTERVAL_MS);

  logger.info(`[Persistence] Guardado periódico iniciado (cada ${SAVE_INTERVAL_MS / 1000}s)`);
}

/**
 * Detener guardado periódico
 */
function stopPeriodicSave() {
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
}

/**
 * Configurar manejo de cierre graceful
 */
function setupGracefulShutdown() {
  const shutdown = (signal) => {
    logger.info(`[Persistence] Señal ${signal} recibida, guardando todas las colas...`);
    saveAllQueues();
    stopPeriodicSave();
    stopQueueProcessor();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('beforeExit', () => {
    saveQueuesToFile();
  });

  logger.info(`[Persistence] Manejo de cierre graceful configurado`);
}

// ==================== FIN PERSISTENCIA ====================

// Timezone de Lima, Peru (UTC-5)
const LIMA_TIMEZONE = 'America/Lima';

// Días de la semana en español
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/**
 * Obtener hora actual en Lima, Peru
 * @returns {Date} Fecha/hora en timezone Lima
 */
function getLimaTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: LIMA_TIMEZONE }));
}

/**
 * Verificar si la hora actual está dentro del horario permitido
 * @param {Object} configLlamadas - Configuración de horarios de la campaña
 * @returns {boolean} true si está dentro del horario
 */
export function isWithinSchedule(configLlamadas) {
  if (!configLlamadas) return true; // Si no hay config, permitir

  const limaTime = getLimaTime();
  const diaSemana = DIAS_SEMANA[limaTime.getDay()];
  const horarioKey = `${diaSemana}_horario`;
  const horario = configLlamadas[horarioKey];

  // Si el horario es null o vacío, no se permite ese día
  if (!horario) {
    logger.info(`[Schedule] Día ${diaSemana} no tiene horario configurado`);
    return false;
  }

  // Parsear horario "HH:MM-HH:MM"
  const [inicio, fin] = horario.split('-');
  if (!inicio || !fin) {
    logger.error(`[Schedule] Formato de horario inválido: ${horario}`);
    return true; // Si hay error de formato, permitir
  }

  const [horaInicio, minInicio] = inicio.split(':').map(Number);
  const [horaFin, minFin] = fin.split(':').map(Number);

  const horaActual = limaTime.getHours();
  const minActual = limaTime.getMinutes();

  // Convertir a minutos para comparar fácilmente
  const minutosActual = horaActual * 60 + minActual;
  const minutosInicio = horaInicio * 60 + minInicio;
  const minutosFin = horaFin * 60 + minFin;

  const dentroDeHorario = minutosActual >= minutosInicio && minutosActual < minutosFin;

  logger.info(`[Schedule] ${diaSemana} ${horaActual}:${minActual.toString().padStart(2, '0')} - Horario: ${horario} - Permitido: ${dentroDeHorario}`);

  return dentroDeHorario;
}

/**
 * Guardar configuración de campaña
 * @param {number} campaniaId - ID de la campaña
 * @param {Object} configLlamadas - Configuración de horarios
 * @param {number} empresaId - ID de la empresa
 * @param {string} plataforma - Plataforma (APP, WEB, etc.)
 */
export function setCampaignConfig(campaniaId, configLlamadas, empresaId, plataforma) {
  campaignConfigs.set(campaniaId, { configLlamadas, empresaId, plataforma });
  logger.info(`[Campaign] Configuración guardada para campaña ${campaniaId} (${plataforma})`);
}

/**
 * Obtener configuración de campaña
 * @param {number} campaniaId - ID de la campaña
 * @returns {Object|null} Configuración de la campaña
 */
export function getCampaignConfig(campaniaId) {
  return campaignConfigs.get(campaniaId) || null;
}

// Audio format constants (Asterisk AudioSocket uses 8kHz SLIN by default)
const BYTES_PER_SAMPLE = 2; // 16-bit signed linear
const TARGET_SAMPLE_RATE = 16000; // Silero VAD requires 16kHz
const VAD_FRAME_SAMPLES = 512;   // Frame size for Silero VAD v5 (32ms at 16kHz)
const CHUNK_SIZE = 320

// AudioSocket message types
const MSG_TYPE_HANGUP = 0x00;
const MSG_TYPE_UUID = 0x01;
const MSG_TYPE_AUDIO = 0x10;
const MSG_TYPE_ERROR = 0xff;

const MAX_VOICE_FRAMES = 10;
const INTERRUPT_ENERGY_THRESHOLD = 1000;  // Ajustar según pruebas (rango típico 200-2000)
const INTERRUPT_FRAMES_REQUIRED = 15;     // Frames consecutivos con energía alta
const INTERRUPT_COOLDOWN_MS = 500; 
const SOCKET_CONNECT_TIMEOUT = 30000;
const VAD_DETECTION_TIMEOUT_MS = 15000; // 15 segundos para detectar voz humana
const VAD_SPEECH_THRESHOLD = 0.5; // Probabilidad mínima para detectar voz


/**
 * Clase AudioSession - gestiona el streaming de audio de una llamada
 */
class AudioSession {
  constructor(channelId, options = {}) {
    this.channelId = channelId;
    this.destination = options.destination;
    this.data = options.data;
    this.extras = options.extras;
    this._ref = options._ref;  // Referencia del número (id, id_base_numero)
    this.record = options.record;
    this.recordDate = options.recordDate;
    this.url = options.url;
    this.createdAt = Date.now();  // Timestamp de creación para detectar huérfanas

    this.socket = null;           // Socket TCP desde Asterisk
    this.socketTimeout = null;
    this.ultravoxSession = null;  // Sesión WebSocket de Ultravox
    this.coquiSession = null;

    // Componentes de Silero VAD
    this.vad = null;              // Instancia de RealTimeVAD
    this.vadBuffer = new Float32Array(0); // Buffer para acumular muestras para el VAD (se necesitan 512 muestras)
    this.vadDetectionTimeout = null; // Timeout para detectar buzón de voz
    this.voiceDetected = false;      // Flag para indicar si se detectó voz humana
    this.vadReady = false;           // Flag para indicar si el VAD está listo

    // Buffer de audio para acumular voz (a 16kHz para Ultravox)
    this.ultravoxBuffer = Buffer.alloc(0);
    this.asteriskBuffer = Buffer.alloc(0);
    this.chunksBuffer = Buffer.alloc(0);
    this.chunks = [];
    this.speechDetected = false;
    this.audioTimeout = null;
    this.ultravoxTimeout = null;
    this.silenceFrames = 0;
    this.chunkCount = 10;

    this.isProcessing = false;   // Bandera para evitar procesamiento simultáneo
    this.isCoquiProcessing = false;
    this.isSpeaking = false;     // Bandera cuando el TTS está reproduciendo audio
    this.greetingPlayed = false; // Bandera para indicar si el saludo ya fue reproducido

    this.speechStartTime = null;
    this.ultravoxSendTime = null;
    this.coquiSendTime = null;

    this.onClose = options.onClose || (() => {});
    this.ultravoxState = "";
    this.highEnergyFrames = 0;
    this.speakingStartTime = null;
    this.cleanedUp = false; // Bandera para evitar cleanup duplicado
  }

  /**
  * Inicializar la sesión - Conectarse a Ultravox y configurar VAD
  */
  async initialize() {
    try {
      // Initialize Silero VAD
      // console.log(`[ExternalMedia] Creating VAD for ${this.channelId}...`);
      
      // this.vad = await RealTimeVAD.new({
      //   // ========== MODELO ==========
      //   model: 'v5',                      // 'v5' (recomendado) o 'legacy'
        
      //   // ========== SAMPLE RATE ==========
      //   sampleRate: TARGET_SAMPLE_RATE,   // 16000 - El audio que envías (después de upsampling)
        
      //   // ========== UMBRALES DE DETECCIÓN ==========
      //   positiveSpeechThreshold: 0.6,     // Probabilidad mínima para detectar INICIO de voz (0.0 - 1.0)
      //   negativeSpeechThreshold: 0.4,    // Probabilidad para detectar FIN de voz (debe ser < positiveSpeechThreshold)
      
      //   // ========== CONFIGURACIÓN DE FRAMES ==========
      //   frameSamples: 512,                // Samples por frame (512 para v5 = 32ms)
      //   preSpeechPadFrames: 3,            // Frames a incluir ANTES del inicio de voz (3 * 32ms = 96ms)
      //   redemptionFrames: 1,             // Frames de silencio antes de declarar fin de voz (24 * 32ms = 768ms)
      //   minSpeechFrames: 5,               // Mínimo de frames para considerar voz válida (9 * 32ms = 288ms)
      //   submitUserSpeechOnPause: false,   // Enviar audio pendiente al pausar el VAD
        
      //   // ========== CALLBACKS ==========
      //   onSpeechStart: () => {
      //     console.log(`[VAD] INICIO GRABACIÓN - Usuario empezó a hablar`);
      //     this.speechDetected = true;
      //     this.asteriskBuffer = Buffer.alloc(0);
      //   },
      //   onSpeechRealStart: () => {
      //     // Se dispara después de minSpeechFrames (voz confirmada, no falso positivo)
      //     this.speechStartTime = Date.now()
      //     console.log(`[VAD] VOZ CONFIRMADA - (no es ruido)`);
      //   },
      //   onSpeechEnd: (audio) => {
      //     // Se dispara cuando termina la voz (después de redemptionFrames de silencio)
      //     const duracionTotal = Date.now() - this.speechStartTime;
      //     const samples = audio?.length || 0;
      //     const duracionAudioMs = Math.round(samples / 16); // 16 samples/ms a 16kHz
      //     console.log(`[VAD] FIN GRABACIÓN + ENVIANDO A ULTRAVOX`);
      //     console.log(`[TIMING] |─ Duración total de la grabacion: ${duracionTotal}ms`);
      //     console.log(`[VAD]    ├─ Audio capturado: ${samples} samples (${duracionAudioMs}ms)`);
      //     console.log(`[VAD]    └─ Enviando audio...`);
      //     this.handleSpeechEnd(audio);
      //   },
      //   onVADMisfire: () => {
      //     // Se dispara cuando detectó voz pero era muy corta (< minSpeechFrames)
      //     const duracion = Date.now() - (this.speechStartTime || Date.now());
      //     console.log(`[VAD] ⚠️ DESCARTADO - Voz muy corta (${duracion}ms < 160ms mínimo)`);
      //     this.speechDetected = false;
      //   },
      //   onFrameProcessed: (probs, frame) => {
      //     // Log de probabilidad para cada frame
      //     const prob = probs.isSpeech;
      //     const probPct = (prob * 100).toFixed(1);
          
      //     // Determinar estado visual
      //     let estado, emoji;
      //     if (prob >= 0.5) {
      //       estado = 'VOZ';
      //       emoji = '🎤';
      //     } else if (prob >= 0.35) {
      //       estado = 'DETECTANDO';
      //       emoji = '🔊';
      //     } else if (prob >= 0.15) {
      //       estado = 'ruido';
      //       emoji = '🔈';
      //     } else {
      //       estado = 'silencio';
      //       emoji = '🔇';
      //     }
          
      //     // Barra visual de probabilidad
      //     const barLength = Math.round(prob * 20);
      //     const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
          
      //     console.log(`[VAD] ${emoji} ${estado.padEnd(10)} | ${bar} | ${probPct.padStart(5)}%`);
      //   }
      // });

      // Start the VAD processing
      // this.vad.start();
      // console.log(`[ExternalMedia] Silero VAD initialized successfully for ${this.channelId}`);

      // Create Ultravox session
      // this.ultravoxSession = await createUltravoxSession(this.channelId, {
      //   systemPrompt: this.systemPrompt,
      //   onToken: (token) => {
      //     broadcast({
      //       type: 'ultravox_token',
      //       data: { channelId: this.channelId, token }
      //     });
      //   },
      //   onResponse: async (response) => {
      //     await this.handleUltravoxResponse(response);
      //   },
      //   onError: (error) => {
      //     console.error(`[ExternalMedia] Ultravox error for ${this.channelId}:`, error);
      //     broadcast({
      //       type: 'ultravox_error',
      //       data: { channelId: this.channelId, error: error.message }
      //     });
      //   }
      // });

      // this.coquiSession = await createCoquiSession(this.channelId, {
      //   onJson: async (response) => {
      //     await this.handleCoquiResponseJson(response);
      //   },
      //   onBytes: async (response) => {
      //     await this.handleCoquiResponseBytes(response);
      //   }
      // });

      // console.log(`[ExternalMedia] Session initialized for ${this.channelId} - Destination: ${this.destination}`);
      return true;
    } catch (error) {
      logger.error(`[ExternalMedia] Failed to initialize session:`, error);
      throw error;
    }
  }

  /**
   * Inicializar VAD para detectar voz humana
   */
  async initVAD() {
    try {
      logger.info(`[VAD] Inicializando VAD para ${this.channelId}...`);

      this.vad = await RealTimeVAD.new({
        model: 'v5',
        sampleRate: TARGET_SAMPLE_RATE,
        positiveSpeechThreshold: 0.3,      // Más sensible (antes 0.5)
        negativeSpeechThreshold: 0.15,     // Más sensible (antes 0.35)
        frameSamples: 512,
        preSpeechPadFrames: 1,
        redemptionFrames: 3,               // Menos espera (antes 8)
        minSpeechFrames: 2,                // Confirma voz más rápido (antes 3)
        submitUserSpeechOnPause: false,

        onSpeechStart: async () => {
          // Lanzar Ultravox INMEDIATAMENTE al detectar voz
          if (this.voiceDetected) return; // Ya procesado

          this.voiceDetected = true;
          logger.info(`[VAD] ¡VOZ DETECTADA! para ${this.channelId} - Lanzando Ultravox`);

          // Cancelar timeout de detección
          if (this.vadDetectionTimeout) {
            clearTimeout(this.vadDetectionTimeout);
            this.vadDetectionTimeout = null;
          }

          // Destruir VAD (ya no lo necesitamos)
          this.destroyVAD();

          // Lanzar Ultravox ahora que confirmamos voz humana
          this.ultravoxSession = await createUltraVoxAPISession(this.channelId, {
            data: this.data,
            extras: this.extras,
            url: this.url,
            onBytes: async (response) => {
              await this.handleUltravoxAPIBytes(response);
            },
            onJson: async (response) => {
              await this.handleUltravoxAPIJson(response);
            },
            onClose: async () => {
              this.cleanup();
            }
          });
        }
      });

      this.vad.start();
      this.vadReady = true;
      logger.info(`[VAD] VAD inicializado correctamente para ${this.channelId}`);

    } catch (error) {
      logger.error(`[VAD] Error al inicializar VAD para ${this.channelId}:`, error.message);
      // Si falla el VAD, lanzar Ultravox directamente
      this.voiceDetected = true;
      this.ultravoxSession = await createUltraVoxAPISession(this.channelId, {
        data: this.data,
        extras: this.extras,
        url: this.url,
        onBytes: async (response) => {
          await this.handleUltravoxAPIBytes(response);
        },
        onJson: async (response) => {
          await this.handleUltravoxAPIJson(response);
        },
        onClose: async () => {
          this.cleanup();
        }
      });
    }
  }

  /**
   * Destruir VAD y liberar recursos
   */
  destroyVAD() {
    if (this.vad) {
      try {
        this.vad.destroy();
        this.vad = null;
        this.vadReady = false;
        this.vadBuffer = new Float32Array(0);
        logger.info(`[VAD] VAD destruido para ${this.channelId}`);
      } catch (error) {
        logger.error(`[VAD] Error al destruir VAD:`, error.message);
      }
    }
  }

  /**
   * Procesar audio con VAD para detectar voz
   */
  async processAudioWithVAD(audioData) {
    if (!this.vad || !this.vadReady || this.voiceDetected) return;

    try {
      // Convertir PCM 16-bit a Float32Array normalizado (-1.0 a 1.0)
      const float32Audio = this.int16BufferToFloat32(audioData);

      // Upsample de 8kHz a 16kHz
      const upsampled = this.upsample8to16(float32Audio);

      // Acumular en VAD buffer
      const newBuffer = new Float32Array(this.vadBuffer.length + upsampled.length);
      newBuffer.set(this.vadBuffer);
      newBuffer.set(upsampled, this.vadBuffer.length);
      this.vadBuffer = newBuffer;

      // Procesar frames completos de 512 muestras
      while (this.vadBuffer.length >= VAD_FRAME_SAMPLES) {
        const frame = this.vadBuffer.slice(0, VAD_FRAME_SAMPLES);
        this.vadBuffer = this.vadBuffer.slice(VAD_FRAME_SAMPLES);
        await this.vad.processAudio(frame);
      }
    } catch (error) {
      logger.error(`[VAD] Error procesando audio:`, error.message);
    }
  }

  /**
   * Convertir Int16 PCM Buffer a Float32Array normalizado (-1.0 a 1.0)
   */
  int16BufferToFloat32(buffer) {
    const alignedBuffer = Buffer.alloc(buffer.length);
    buffer.copy(alignedBuffer);
    const samples = new Int16Array(alignedBuffer.buffer, alignedBuffer.byteOffset, alignedBuffer.length / 2);
    const float32 = new Float32Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      float32[i] = samples[i] / 32768.0;
    }

    return float32;
  }

  /**
   * Upsample audio de 8kHz a 16kHz usando interpolación lineal
   */
  upsample8to16(audio) {
    const upsampled = new Float32Array(audio.length * 2);

    for (let i = 0; i < audio.length; i++) {
      const current = audio[i];
      const next = i < audio.length - 1 ? audio[i + 1] : current;
      upsampled[i * 2] = current;
      upsampled[i * 2 + 1] = (current + next) / 2;
    }

    return upsampled;
  }

  /**
   * Set the TCP socket connection from Asterisk
   */
  async setSocket(socket) {
    // console.log(this.extras);
    this.socket = socket;
    this.lastActivityTime = Date.now();

    // Cancelar timeout de conexión ya que el socket se conectó
    if (this.socketTimeout) {
      clearTimeout(this.socketTimeout);
      this.socketTimeout = null;
    }

    logger.info(`[ExternalMedia] Asterisk TCP socket connected for ${this.channelId}`);

    // Notificar al CRM que la llamada ha iniciado
    sendCallEntrada({
      provider_call_id: this.channelId,
      id_llamada: this.data?.id_llamada,
      apiUrl: this.url
    });

    // Inicializar VAD para detectar voz humana antes de lanzar Ultravox
    await this.initVAD();

    // Iniciar timeout para detectar buzón de voz (si no hay voz en X segundos)
    this.vadDetectionTimeout = setTimeout(() => {
      if (!this.voiceDetected) {
        logger.info(`[VAD] No se detectó voz humana en ${VAD_DETECTION_TIMEOUT_MS / 1000}s para ${this.channelId}, probable buzón de voz`);
        this.cleanup();
      }
    }, VAD_DETECTION_TIMEOUT_MS);

    socket.on('data', (data) => {
      this.handleAsteriskData(data);
    });

    socket.on('close', () => {
      logger.info(`[ExternalMedia] Asterisk TCP socket closed for ${this.channelId}`);
      if (this.audioTimeout) clearTimeout(this.audioTimeout);
      if (this.socket && !this.socket.destroyed) {
        this.socket.destroy();
      }
      this.socket = null;

      // Pedir a Ultravox que tipifique inmediatamente cuando el usuario cuelga
      if (this.ultravoxSession?.ultravoxCallId) {
        const callId = this.ultravoxSession.ultravoxCallId;

        // Timeout de seguridad: si Ultravox no cierra en 30 segundos, forzar cleanup
        this.forceCleanupTimeout = setTimeout(() => {
          if (audioSessions.has(this.channelId)) {
            logger.warn(`[ExternalMedia] Timeout de 30s - Ultravox no cerró, forzando cleanup: ${this.channelId}`);
            this.cleanup();
          }
        }, 30000);

        (async () => {
          try {
            logger.info(`[ExternalMedia] Usuario colgó - Pidiendo a Ultravox que tipifique: ${callId}`);
            const response = await fetch(`https://api.ultravox.ai/api/calls/${callId}/send_data_message`, {
              method: "POST",
              headers: { "Content-Type": "application/json", 'X-API-Key': config.ultravox.key },
              body: JSON.stringify({
                "type": "user_text_message",
                "text": "El usuario ha colgado la llamada. Tipifica la llamada con la información recopilada y cuelga.",
                "urgency": "now"
              })
            });
            if (response.ok) {
              logger.info(`[ExternalMedia] Mensaje de tipificación enviado a Ultravox`);
            }
          } catch (error) {
            logger.error(`[ExternalMedia] Error enviando mensaje a Ultravox:`, error.message);
          }
        })();
      }
    });

    socket.on('error', (error) => {
      logger.error(`[ExternalMedia] Asterisk TCP socket error:`, error.message);
    });

    // Start keep-alive interval to prevent connection timeout
    this.startKeepAlive();
    // if (!this.greetingPlayed) {
    //   this.playGreeting();
    // }
  }

  /**
   * Start keep-alive interval to maintain AudioSocket connection
   */
  startKeepAlive() {
    // Send silence frames every 20ms when not actively streaming
    this.keepAliveInterval = setInterval(() => {
      if (this.socket && !this.isSpeaking) {
        this.sendSilenceFrame();
      }
    }, 20);
  }

  /**
   * Stop keep-alive interval
   */
  stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Handle incoming data from Asterisk AudioSocket
   * Protocol: 3-byte header + payload
   */
  handleAsteriskData(data) {
    let offset = 0;

    // Reset activity timer on any data received
    this.lastActivityTime = Date.now();

    while (offset < data.length) {
      if (data.length - offset < 3) break;

      const msgType = data[offset];
      const msgLen = data.readUInt16BE(offset + 1);

      if (data.length - offset < 3 + msgLen) break;

      const payload = data.slice(offset + 3, offset + 3 + msgLen);

      switch (msgType) {
        case MSG_TYPE_UUID:
          const uuid = payload.toString('utf8');
          // console.log(`[ExternalMedia] UUID received: ${uuid}`);
          break;

        case MSG_TYPE_AUDIO:
          // Si VAD está activo y no se ha detectado voz, procesar con VAD
          if (this.vadReady && !this.voiceDetected) {
            this.processAudioWithVAD(payload);
            break;
          }

          // Si ya se detectó voz, procesar normalmente con Ultravox
          this.chunkCount++;
          if (this.ultravoxState === "listening" && this.asteriskBuffer.length === 0) {
            this.ultravoxBuffer = Buffer.concat([this.ultravoxBuffer, payload]);

            if (!this.isProcessing) {
              this.isProcessing = true;
              this.streamAudioToUltravox();
            }
          }
          else if (this.ultravoxState === "speaking") {
            if (this.speakingStartTime && (Date.now() - this.speakingStartTime) < INTERRUPT_COOLDOWN_MS) {
              return;
            }

            const rms = this.calculateRMS(payload);
            if (rms > INTERRUPT_ENERGY_THRESHOLD) {
              this.highEnergyFrames++;
              // console.log(`[Interrupt] Energía alta detectada: ${rms.toFixed(0)}, frames: ${this.highEnergyFrames}`);
              
              if (this.highEnergyFrames >= INTERRUPT_FRAMES_REQUIRED) {
                this.interruptBot();

                this.ultravoxBuffer = Buffer.concat([this.ultravoxBuffer, payload]);
                if (!this.isProcessing) {
                  this.isProcessing = true;
                  this.streamAudioToUltravox();
                }
              }
            } else {
              this.highEnergyFrames = Math.max(0, this.highEnergyFrames - 1);
            }
            return;
          }
          break;

        case MSG_TYPE_HANGUP:
          logger.info(`[ExternalMedia] Hangup received for ${this.channelId}`);
          this.cleanup();
          return;

        case MSG_TYPE_ERROR:
          logger.error(`[ExternalMedia] Error from Asterisk:`, payload.toString('utf8'));
          break;

        default:
          // console.log(`[ExternalMedia] Unknown message type: ${msgType}`);
      }

      offset += 3 + msgLen;
    }
  }

  interruptBot() {
    // console.log("[External Media] === INTERRUPCIÓN ===");
    this.stopStreamToAsterisk();
    this.chunkCount = 0;
    this.highEnergyFrames = 0;
    this.ultravoxState = "listening"
  }

  /**
   * Send a silence frame to Asterisk to keep the connection alive
   */
  sendSilenceFrame() {
    if (!this.socket || this.socket.destroyed) return;

    // Send a small silence frame (320 bytes = 20ms of silence at 8kHz)
    const silenceData = Buffer.alloc(320, 0);
    const frame = Buffer.alloc(3 + silenceData.length);
    frame[0] = MSG_TYPE_AUDIO;
    frame.writeUInt16BE(silenceData.length, 1);
    silenceData.copy(frame, 3);

    try {
      this.socket.write(frame);
      this.lastActivityTime = Date.now();
    } catch (error) {
      // Ignore write errors for keep-alive
    }
  }

  calculateRMS(audioBuffer) {
  if (!audioBuffer || audioBuffer.length < 2) return 0;
  
    let sumSquares = 0;
    const samples = audioBuffer.length / 2;
    
    for (let i = 0; i < audioBuffer.length; i += 2) {
      const sample = audioBuffer.readInt16LE(i);
      sumSquares += sample * sample;
    }
    
    return Math.sqrt(sumSquares / samples);
  }

  /**
   * Upsample audio from 8kHz to 16kHz using linear interpolation
   */
  // upsample8to16(audio, bitdepth) {
  //   // Double the sample rate: for each sample, output original + interpolated
  //   let upsampled;
  //   if (bitdepth == 32) {
  //     upsampled = new Float32Array(audio.length * 2);
  //   }
  //   else if (bitdepth == 16) {
  //     upsampled = new Int16Array(audio.length * 2);
  //   }

  //   for (let i = 0; i < audio.length; i++) {
  //     const current = audio[i];
  //     const next = i < audio.length - 1 ? audio[i + 1] : current;
  //     upsampled[i * 2] = current;
  //     upsampled[i * 2 + 1] = (current + next) / 2; // Linear interpolation
  //   }
  //   return upsampled;
  // }

  /**
   * Process audio chunk with Silero VAD (Voice Activity Detection)
   */
  // async processAudioChunk(audioData) {
  //   // Debug: log every 100th chunk to avoid spam
  //   if (!this.chunkCount) this.chunkCount = 0;
  //   this.chunkCount++;
  //   if (this.chunkCount % 100 === 1) {
  //     console.log(`[VAD] Processing chunk #${this.chunkCount}, size: ${audioData.length} bytes, isSpeaking: ${this.isSpeaking}, isProcessing: ${this.isProcessing}`);
  //   }

  //   // Skip processing if bot is speaking or already processing a response
  //   if (this.isSpeaking || this.isProcessing) {
  //     if (this.chunkCount > MAX_VOICE_FRAMES) {
  //       this.stopAudioStream();
  //     }
  //     return;
  //   }

  //   if (!this.vad) {
  //     console.error('[VAD] VAD not initialized');
  //     return;
  //   }

  //   try {
  //     // Convert PCM 16-bit to Float32Array normalized (-1.0 to 1.0)
  //     const float32Audio = this.int16BufferToFloat32(audioData);

  //     // Upsample from 8kHz to 16kHz
  //     const upsampled = this.upsample8to16(float32Audio, 32);

  //     // Accumulate in VAD buffer
  //     const newBuffer = new Float32Array(this.vadBuffer.length + upsampled.length);
  //     newBuffer.set(this.vadBuffer);
  //     newBuffer.set(upsampled, this.vadBuffer.length);
  //     this.vadBuffer = newBuffer;

  //     // Process complete frames of 512 samples
  //     while (this.vadBuffer.length >= VAD_FRAME_SAMPLES) {
  //       const frame = this.vadBuffer.slice(0, VAD_FRAME_SAMPLES);
  //       this.vadBuffer = this.vadBuffer.slice(VAD_FRAME_SAMPLES);
        
  //       // Debug: log frame processing
  //       if (this.chunkCount % 100 === 1) {
  //         console.log(`[VAD] Processing frame of ${frame.length} samples, buffer remaining: ${this.vadBuffer.length}`);
  //       }
        
  //       await this.vad.processAudio(frame);
  //     }

  //   } catch (error) {
  //     console.error('[VAD] Error processing audio chunk:', error);
  //   }
  // }

  /**
   * Handle speech end event from Silero VAD
   */
  // handleSpeechEnd(audio) {
  //   if (!audio || audio.length === 0) {
  //     console.log('[VAD] No audio data in speech segment');
  //     this.speechDetected = false;
  //     return;
  //   }

  //   // Convert Float32Array to Int16 Buffer for Ultravox
  //   const asteriskBuffer = this.float32ToInt16Buffer(audio);

  //   // Append to existing buffer (in case onSpeechStart had initial audio)
  //   this.asteriskBuffer = Buffer.concat([this.asteriskBuffer, asteriskBuffer]);

  //   const audioDurationMs = (this.asteriskBuffer.length / (TARGET_SAMPLE_RATE * BYTES_PER_SAMPLE) * 1000).toFixed(0);
  //   console.log(`[VAD] Speech segment complete: ${this.asteriskBuffer.length} bytes (${audioDurationMs}ms audio)`);

  //   this.speechDetected = false;
  //   this.isProcessing = true;
  //   this.sendAudioToUltravox();
  // }

  /**
   * Convert Int16 PCM Buffer to Float32Array normalized (-1.0 to 1.0)
   */
  // int16BufferToFloat32(buffer) {
  //   const alignedBuffer = Buffer.alloc(buffer.length);
  //   buffer.copy(alignedBuffer);
  //   const samples = new Int16Array(alignedBuffer.buffer, alignedBuffer.byteOffset, alignedBuffer.length / 2);
  //   const float32 = new Float32Array(samples.length);

  //   for (let i = 0; i < samples.length; i++) {
  //     float32[i] = samples[i] / 32768.0;
  //   }

  //   return float32;
  // }

  // /**
  //  * Convert Float32Array to Int16 PCM Buffer
  //  */
  // float32ToInt16Buffer(float32Array) {
  //   const buffer = Buffer.alloc(float32Array.length * 2);

  //   for (let i = 0; i < float32Array.length; i++) {
  //     // Clamp to -1.0 to 1.0 range
  //     const sample = Math.max(-1.0, Math.min(1.0, float32Array[i]));
  //     const int16 = Math.round(sample * 32767);
  //     buffer.writeInt16LE(int16, i * 2);
  //   }

  //   return buffer;
  // }

  /**
   * Send accumulated audio to Ultravox (audio is now at 16kHz)
   */
  // async sendAudioToUltravox() {
  //   if (this.asteriskBuffer.length === 0) {
  //     this.isProcessing = false;
  //     return;
  //   }
    
  //   const audioToSend = this.asteriskBuffer;
  //   this.asteriskBuffer = Buffer.alloc(0);

  //   try {
  //     // console.log(`[ExternalMedia] Sending ${audioToSend.length} bytes (16kHz) to Ultravox for ${this.channelId}`);

  //     // Send to Ultravox (audio is now at 16kHz)
  //     if (this.ultravoxSession && this.ultravoxSession.isConnected()) {
  //       this.ultravoxSendTime = Date.now();
  //       this.ultravoxSession.sendAudio(audioToSend);

  //     } else {
  //       console.error(`[ExternalMedia] Ultravox not connected for ${this.channelId}`);
  //       this.isProcessing = false;
  //     }

  //   } catch (error) {
  //     console.error(`[ExternalMedia] Error sending audio:`, error);
  //     this.isProcessing = false;
  //   }
  // }

  // async sendChunksToCoqui() {
  //   if (this.chunks.length === 0) {
  //     return;
  //   }

  //   if (this.isCoquiProcessing) {
  //     return;
  //   }

  //   this.isCoquiProcessing = true;
  //   const chunkToSend = this.chunks.shift();

  //   try {
  //     console.log(`[ExternalMedia] Sending ${chunkToSend} to CoquiXTTS for ${this.channelId}`);

  //     if (this.coquiSession && this.coquiSession.isConnected()) {
  //       this.coquiSession.sendChunks(chunkToSend);
  //     } else {
  //       console.error(`[ExternalMedia] CoquiXTTS not connected for ${this.channelId}`);
  //     }
  //   } catch (error) {
  //     console.error(`[ExternalMedia] Error sending chunks:`, error);
  //   }
  // }

  /**
   * Handle response from Ultravox - generate TTS and send back
   */
  // async handleUltravoxResponse(response) {
  //   if (!response) {
  //     console.log("[ExternalMedia] No hay data de Ultravox");
  //     this.isProcessing = false;
  //     return;
  //   }

  //   if (response.event === "end_turn") {
  //     // this.isProcessing = false;
  //     console.log("[ExternalMedia] Ultravox processing complete");
  //     this.isProcessing = true;
  //     this.sendChunksToCoqui();
  //   }
  //   else if (response.event === "data") {
  //     this.chunks.push(response.chunk);
  //     const ultravoxLatency = this.ultravoxSendTime ? Date.now() - this.ultravoxSendTime : 0;
  //     console.log(`[TIMING] Ultravox responded in ${ultravoxLatency}ms`);
  //     console.log(`[ExternalMedia] Ultravox response for ${this.channelId}: ${response.chunk.substring(0, 100)}...`);
  //     this.sendChunksToCoqui();
  //   }
  // }

  async handleUltravoxAPIBytes(response) {
    if (!Buffer.isBuffer(response) || response.length === 0) return;
    // console.log(`[ExternalMedia] 📦 Bytes recibidos: ${response.length}, state: ${this.ultravoxState}`);

    // console.log(`[ExternalMedia] 🔊 Agregando al audioOutputBuffer`);
    this.asteriskBuffer = Buffer.concat([this.asteriskBuffer, response]);

    if (!this.isSpeaking) {
      this.isSpeaking = true;
      this.streamAudioToAsterisk()
    }
    
  }

  async handleUltravoxAPIJson(response) {
    if (!response) {
      // console.log("[External Media] No se recibio JSON por parte de Ultravox API");
      return
    }

    if (response.type === "transcript") {
      if (response.final) {
        // console.log("[External Media] Ultravox message:", response);
      }
    } else {
      logger.info("[External Media] Ultravox message:", response);
    }

    switch (response.type) {
      case "state":
        this.ultravoxState = response.state;
        if (response.state === "speaking") {
          this.stopStreamToUltravox();
        }
        break;
      case "user_started_speaking":
        this.silenceFrames = 0;
        break;
      case "user_stopped_speaking":
        // console.log("[External Media] User stopped speaking");
        this.stopStreamToUltravox();
        break;
      case "playback_clear_buffer":
        this.asteriskBuffer = Buffer.alloc(0);
        break;
      default:
        return;
    }
  }

  // async handleCoquiResponseJson(response) {
  //   if (!response) {
  //     console.log("[ExternalMedia] No hay JSON de CoquiXTTS");
  //     this.isProcessing = false;
  //     this.isCoquiProcessing = false;
  //     return;
  //   }

  //   if (response.es_final) {
  //     console.log("[ExternalMedia] Chunks de CoquiXTTS enviados");
  //     this.isCoquiProcessing = false;
  //     if (this.chunks.length > 0) {
  //       this.sendChunksToCoqui();
  //     }
  //   }
  // }

  // async handleCoquiResponseBytes(response) {
  //   if (!response) {
  //     console.log("[ExternalMedia] No hay data de CoquiXTTS");
  //     this.isProcessing = false;
  //     this.isCoquiProcessing = false;
  //     return;
  //   }

  //   this.chunksBuffer = Buffer.concat([this.chunksBuffer, response]);

  //   if (!this.isSpeaking) {
  //     this.isSpeaking = true;
  //     this.sendAudioToAsterisk();
  //   }
  // }
  streamAudioToUltravox() {
    const sendNextFrame = () => {
      if (!this.socket || this.socket.destroyed) {
        this.isProcessing = false;
        return;
      }
      if (!this.ultravoxBuffer || this.ultravoxBuffer.length >= CHUNK_SIZE) {
        this.silenceFrames = 0;
        const frameData = this.ultravoxBuffer.subarray(0, CHUNK_SIZE);
        this.ultravoxBuffer = this.ultravoxBuffer.subarray(CHUNK_SIZE);
        this.ultravoxSession.sendAudio(frameData);
      } else {
        this.silenceFrames++;
        this.ultravoxSession.sendAudio(Buffer.alloc(CHUNK_SIZE, 0));
        // console.log("[Silence]: ", this.silenceFrames);

        // if (this.silenceFrames >= 15) {
        //   this.stopStreamToUltravox();
        //   return;
        // }
      }

      // Programar siguiente frame
      this.ultravoxTimeout = setTimeout(sendNextFrame, 20);
    };

    sendNextFrame();
  }

  stopStreamToUltravox() {
    if (this.ultravoxTimeout) {
      clearTimeout(this.ultravoxTimeout);
      this.ultravoxTimeout = null;
        // console.log("[External Media] User stopped speaking");
      this.isProcessing = false;
      this.ultravoxBuffer = Buffer.alloc(0);
    }
  }

  streamAudioToAsterisk() {
    this.speakingStartTime = Date.now();
    this.highEnergyFrames = 0;

    const sendNextFrame = () => {
      if (!this.socket || this.socket.destroyed) {
        this.isSpeaking = false;
        return;
      }

      if (!this.asteriskBuffer || this.asteriskBuffer.length < CHUNK_SIZE) {
        // Si no hay más datos y el buffer está vacío, terminar
        if (!this.asteriskBuffer || this.asteriskBuffer.length === 0) {
          this.isSpeaking = false;
          // console.log('[ExternalMedia] Audio streaming complete');
          return;
        }
        // Padding con silencio si el último chunk es menor
        const padded = Buffer.alloc(CHUNK_SIZE, 0);
        this.asteriskBuffer.copy(padded);
        this.asteriskBuffer = Buffer.alloc(0);
        this.sendFrameToAsterisk(padded);
      } else {
        const frameData = this.asteriskBuffer.subarray(0, CHUNK_SIZE);
        this.asteriskBuffer = this.asteriskBuffer.subarray(CHUNK_SIZE);
        this.sendFrameToAsterisk(frameData);
      }

      // Programar siguiente frame
      this.audioTimeout = setTimeout(sendNextFrame, 20);
    };

    sendNextFrame();
  }

  stopStreamToAsterisk() {
    if (this.audioTimeout) {
      clearTimeout(this.audioTimeout);
      this.audioTimeout = null;
      this.isSpeaking = false;
      this.asteriskBuffer = Buffer.alloc(0);
    }
  }

  sendFrameToAsterisk(payload) {
    const frame = Buffer.alloc(3 + payload.length);
    frame[0] = MSG_TYPE_AUDIO;
    frame.writeUInt16BE(payload.length, 1);
    payload.copy(frame, 3);
    this.socket.write(frame);
  }
  /**
   * Send audio to Asterisk via AudioSocket TCP
   */
  // async sendAudioToAsterisk() {
    
  //   const CHUNK_SIZE = 320;
  //   const INTERVAL_MS = 20;
  //   const SILENCE = Buffer.alloc(CHUNK_SIZE, 0);
  //   const MAX_EMPTY_FRAMES = 25;

  //   const startTime = process.hrtime.bigint();
  //   let emptyFrames = 0;
  //   let frameCount = 0;

  //   this.stopKeepAlive();
    
  //   const sendFrame = () => {
  //     if (!this.socket || this.socket.destroyed) {
  //         console.error('[ExternalMedia] Socket disconnected');
  //         this.stopAudioStream();
  //         return;
  //     }
      
  //     let framePayload
      
  //     if (this.chunksBuffer.length >= CHUNK_SIZE) {
  //         framePayload = this.chunksBuffer.subarray(0, CHUNK_SIZE);
  //         this.chunksBuffer = this.chunksBuffer.subarray(CHUNK_SIZE);
  //         emptyFrames = 0;
  //     } else if (this.chunksBuffer.length > 0) {
  //         framePayload = Buffer.alloc(CHUNK_SIZE, 0);
  //         this.chunksBuffer.copy(framePayload);
  //         this.chunksBuffer = Buffer.alloc(0);
  //         emptyFrames = 0;
  //     } else {
  //         emptyFrames++;
  //         if (emptyFrames >= MAX_EMPTY_FRAMES) {
  //             this.stopAudioStream();
  //             return;
  //         }
  //         framePayload = SILENCE;
  //     }
      
  //     const frame = Buffer.alloc(3 + CHUNK_SIZE);
  //     frame[0] = MSG_TYPE_AUDIO;
  //     frame.writeUInt16BE(CHUNK_SIZE, 1);
  //     framePayload.copy(frame, 3);
  //     this.socket.write(frame);

  //     frameCount++;
      
  //     // Scheduling preciso
  //     const expectedTime = startTime + BigInt(frameCount * INTERVAL_MS * 1_000_000);
  //     const now = process.hrtime.bigint();
  //     const elapsed = Number(expectedTime - now) / 1_000_000; // a ms
  //     const nextDelay = Math.max(1, Math.round(elapsed));
      
  //     this.audioTimeout = setTimeout(sendFrame, nextDelay);
  //   };
    
  //   sendFrame();
  // }

  // stopAudioStream() {
  //   if (this.audioStream) {
  //       clearTimeout(this.audioStream);
  //       this.audioTimeout = null;
  //   }
  //   this.chunksBuffer = Buffer.alloc(0);
  //   this.isSpeaking = false;
  //   this.isProcessing = false;
  //   this.chunkCount = 0;
  //   this.startKeepAlive();
  //   console.log('[ExternalMedia] Envío a Asterisk finalizado');
  // }

  /**
   * Play greeting message
   */
  // async playGreeting() {
  //   if (this.greetingPlayed) return;
  //   this.greetingPlayed = true;

  //   console.log(`[ExternalMedia] Playing greeting for ${this.channelId}: "${this.greeting.substring(0, 50)}..."`);
  //   this.isProcessing = true;
  //   this.coquiSession.sendChunks(this.greeting);
  // }

  /**
   * Cleanup session
   */
  async cleanup() {
    logger.info(`[ExternalMedia] Cleaning up session ${this.channelId}`);

    // Cancelar timeout de conexión si existe
    if (this.socketTimeout) {
      clearTimeout(this.socketTimeout);
      this.socketTimeout = null;
    }

    // Cancelar timeout de buzón de voz si existe
    if (this.voicemailTimeout) {
      clearTimeout(this.voicemailTimeout);
      this.voicemailTimeout = null;
    }

    // Cancelar timeout de detección VAD si existe
    if (this.vadDetectionTimeout) {
      clearTimeout(this.vadDetectionTimeout);
      this.vadDetectionTimeout = null;
    }

    // Cancelar timeout de forzar cleanup si existe
    if (this.forceCleanupTimeout) {
      clearTimeout(this.forceCleanupTimeout);
      this.forceCleanupTimeout = null;
    }

    // Destruir VAD si existe
    this.destroyVAD();

    // Guardar datos antes de cerrar sesiones
    const ultravoxCallId = this.ultravoxSession?.ultravoxCallId;

    // Stop keep-alive interval
    this.stopKeepAlive();
    // Destroy Silero VAD
    // if (this.vad) {
    //   try {
    //     this.vad.destroy();
    //     this.vad = null;
    //     console.log(`[ExternalMedia] VAD destroyed for ${this.channelId}`);
    //   } catch (error) {
    //     console.error(`[ExternalMedia] Error destroying VAD:`, error);
    //   }
    // }

    // Clear VAD buffer
    // this.vadBuffer = new Float32Array(0);

    if (this.ultravoxSession) {
      closeUltravoxAPISession(this.channelId);
    }

    // if (this.coquiSession) {
    //   closeCoquiSession(this.channelId);
    // }

    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
      this.socket = null;
    }

    audioSessions.delete(this.channelId);
    this.onClose();

    broadcast({
      type: 'audio_session_ended',
      data: { channelId: this.channelId, timestamp: new Date().toISOString() }
    });

    // Subir audio al CRM después de cerrar la sesión
    const providerCallId = this.channelId;
    const idEmpresa = this.extras?.empresa?.id;
    const canal = this.extras?.canal;

    // console.log(`[ExternalMedia] ========== FINALIZANDO LLAMADA ==========`);
    // console.log(`[ExternalMedia] Provider Call ID: ${providerCallId}`);
    // console.log(`[ExternalMedia] ID Empresa: ${idEmpresa}`);
    // console.log(`[ExternalMedia] Ultravox Call ID: ${ultravoxCallId}`);
    // console.log(`[ExternalMedia] Record: ${this.record}`);
    // console.log(`[ExternalMedia] Record Date: ${this.recordDate}`);

    // Ejecutar secuencialmente: call-terminada, audio, transcripción
    (async () => {
      // [1/3] Notificar call-terminada
      if (providerCallId && this.url) {
        try {
          await sendCallTerminada({
            provider_call_id: providerCallId,
            id_llamada: this.data?.id_llamada,
            apiUrl: this.url
          });
        } catch (err) {
          logger.error(`[ExternalMedia] [1/3] Error al notificar call-terminada:`, err.message);
        }
      }

      // [2/3] Subir audio
      if (this.record && this.recordDate && providerCallId && idEmpresa) {
        const audioPath = getRecordingPath(idEmpresa, this.recordDate, this.record);

        try {
          const result = await uploadCallAudio({
            audioPath,
            provider_call_id: providerCallId,
            id_llamada: this.data?.id_llamada,
            id_empresa: idEmpresa,
            apiUrl: this.url
          });
          logger.info(`[ExternalMedia] [2/3] Audio subido exitosamente:`, result);
        } catch (err) {
          logger.error(`[ExternalMedia] [2/3] Error al subir audio al CRM:`, err.message);
        }
      } else {
        logger.error(`[ExternalMedia] [2/3] No se puede subir audio - faltan datos (record: ${this.record}, recordDate: ${this.recordDate}, providerCallId: ${providerCallId}, idEmpresa: ${idEmpresa})`);
      }

      // [3/3] Enviar transcripción (después del audio)
      const idLlamada = this.data?.id_llamada;
      if (idLlamada && ultravoxCallId) {
        try {
          const [transcripcion, metadata] = await Promise.all([
            getCallTranscription(ultravoxCallId),
            getCallMetadata(ultravoxCallId)
          ]);

          const result = await sendTranscription({
            id_llamada: idLlamada,
            id_ultravox_call: ultravoxCallId,
            metadata: metadata,
            transcripcion: transcripcion?.results || [],
            apiUrl: this.url
          });

          logger.info(`[ExternalMedia] [3/3] Transcripción enviada exitosamente:`, result);
        } catch (err) {
          logger.error(`[ExternalMedia] [3/3] Error al enviar transcripción al CRM:`, err.message);
        }
      } else {
        logger.error(`[ExternalMedia] [3/3] No se puede enviar transcripción - faltan datos (idLlamada: ${idLlamada}, ultravoxCallId: ${ultravoxCallId})`);
      }

      // Procesar siguiente llamada de la cola
      const plataforma = this.extras?.plataforma;
      if (idEmpresa && canal) {
        await processQueue(idEmpresa, plataforma, canal);
      }
    })();
  }
}

/**
* Inicializar el servidor TCP de AudioSocket
* Este recibe conexiones de la aplicación AudioSocket de Asterisk
 */
export function initAudioSocketServer() {
  // Cargar colas guardadas desde archivo
  loadQueuesFromFile();

  // Configurar cierre graceful para guardar colas
  setupGracefulShutdown();

  // Iniciar guardado periódico
  startPeriodicSave();

  // Iniciar limpieza de sesiones huérfanas
  startOrphanCleanup();

  // AudioSocket usa TCP, no WebSocket
  const tcpPort = config.server?.audioSocketPort || 9092;

  audioServer = net.createServer((socket) => {
    // console.log(`[ExternalMedia] ========================================`);
    // console.log(`[ExternalMedia] NEW TCP CONNECTION RECEIVED!`);
    // console.log(`[ExternalMedia] From: ${socket.remoteAddress}:${socket.remotePort}`);
    // console.log(`[ExternalMedia] ========================================`);

    // Necesitamos esperar el mensaje UUID para identificar la sesión
    let identified = false;
    let tempBuffer = Buffer.alloc(0);

    const identifyHandler = (data) => {
      tempBuffer = Buffer.concat([tempBuffer, data]);

      // Look for UUID message
      if (tempBuffer.length >= 3) {
        const msgType = tempBuffer[0];
        const msgLen = tempBuffer.readUInt16BE(1);

        if (msgType === MSG_TYPE_UUID && tempBuffer.length >= 3 + msgLen) {
          const uuidBytes = tempBuffer.slice(3, 3 + msgLen);

          // AudioSocket sends UUID as 16 binary bytes, convert to string format
          // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
          let uuid;
          if (msgLen === 16) {
            // Binary UUID - convert to string format
            const hex = uuidBytes.toString('hex');
            uuid = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
          } else {
            // Already string format
            uuid = uuidBytes.toString('utf8');
          }
          // console.log(`[ExternalMedia] Identified session: ${uuid}`);

          // Find the session by UUID (channel ID)
          // AudioSocket sends the UUID we provided in the Originate command
          let session = audioSessions.get(uuid);

          if (!session) {
            // Try to find by partial match (in case of format differences)
            for (const [key, sess] of audioSessions) {
              if (uuid.includes(key) || key.includes(uuid)) {
                session = sess;
                // console.log(`[ExternalMedia] Matched session by partial: ${key}`);
                break;
              }
            }
          }

          if (session) {
            socket.removeListener('data', identifyHandler);
            session.setSocket(socket);

            // Procesar los datos restantes
            const remaining = tempBuffer.slice(3 + msgLen);
            if (remaining.length > 0) {
              session.handleAsteriskData(remaining);
            }
          } else {
            // console.error(`[ExternalMedia] No session found for UUID: ${uuid}`);
            // console.log(`[ExternalMedia] Available sessions:`, Array.from(audioSessions.keys()));
            socket.destroy();
          }

          identified = true;
        }
      }
    };

    socket.on('data', identifyHandler);

    // Timeout para la identificación
    setTimeout(() => {
      if (!identified) {
        logger.error(`[ExternalMedia] Socket identification timeout`);
        socket.destroy();
      }
    }, 5000);
  });

  audioServer.listen(tcpPort, '0.0.0.0', () => {
    // console.log(`[ExternalMedia] ========================================`);
    logger.info(`[ExternalMedia] AudioSocket TCP server READY`);
    // console.log(`[ExternalMedia] Listening on 0.0.0.0:${tcpPort}`);
    // console.log(`[ExternalMedia] Waiting for Asterisk connections...`);
    // console.log(`[ExternalMedia] ========================================`);

    // Iniciar procesador de colas periódico
    startQueueProcessor();
  });

  audioServer.on('error', (error) => {
    logger.error(`[ExternalMedia] TCP server error:`, error);
  });

  return audioServer;
}

/**
* Crear una nueva sesión de audio para un canal
*/
// Timeout para limpiar sesiones deshabilitado - confiamos en handleHangup de AMI
// const SESSION_CONNECTION_TIMEOUT_MS = 30000;

export async function createAudioSession(channelId, options = {}) {
  try {
    // Cerrar sesión existente si existe
    if (audioSessions.has(channelId)) {
      const existing = audioSessions.get(channelId);
      existing.cleanup();
    }

    const session = new AudioSession(channelId, options);
    await session.initialize();
    audioSessions.set(channelId, session);

  // Timeout deshabilitado - handleHangup de AMI limpia las sesiones cuando no contesta
  // session.socketTimeout = setTimeout(() => {
  //   if (!session.socket) {
  //     logger.warn(`[ExternalMedia] Session ${channelId} timed out (no socket connection), cleaning up`);
  //     session.cleanup();
  //   }
  // }, SESSION_CONNECTION_TIMEOUT_MS);

  logger.info(`[ExternalMedia] Audio session created for ${channelId} - Destination: ${session.destination}`);

  broadcast({
    type: 'audio_session_created',
    data: {
      channelId,
      systemPrompt: session.systemPrompt,
      greeting: session.greeting,
      timestamp: new Date().toISOString()
    }
  });

    return session;
  } catch (error) {
    logger.error(`[ExternalMedia] Error al crear sesión de audio para ${channelId}:`, error.message);

    // Enviar call-no-contesta si falla la creación
    if (options.url) {
      sendCallNoContesta({
        provider_call_id: channelId,
        id_llamada: options.data?.id_llamada,
        status: 'FAILED',
        apiUrl: options.url
      });
    }

    throw error;
  }
}

/**
* Obtener una sesión de audio por ID de canal
*/
export function getAudioSession(channelId) {
  return audioSessions.get(channelId);
}

/**
* Eliminar una sesión de audio (para llamadas no contestadas)
*/
export function removeAudioSession(channelId) {
  const session = audioSessions.get(channelId);
  if (session) {
    // Limpiar timeout si existe
    if (session.socketTimeout) {
      clearTimeout(session.socketTimeout);
      session.socketTimeout = null;
    }
    audioSessions.delete(channelId);
    logger.info(`[ExternalMedia] Sesión ${channelId} eliminada (llamada no contestada)`);

    // Procesar siguiente llamada de la cola
    const empresaId = session.extras?.empresa?.id;
    const plataforma = session.extras?.plataforma;
    const canal = session.extras?.canal || 10;
    if (empresaId && plataforma) {
      processQueue(empresaId, plataforma, canal);
    }
  }
}

/**
* Cerrar una sesión de audio
*/
export function closeAudioSession(channelId) {
  const session = audioSessions.get(channelId);
  if (session) {
    session.cleanup();
  }
}

/**
* Obtener todas las sesiones de audio activas
* Si se pasa empresaId y plataforma, filtra solo las sesiones de esa empresa-plataforma
*/
export function getAllAudioSessions(empresaId = null, plataforma = null) {
  const parsedId = empresaId != null ? Number(empresaId) : null;
  return Array.from(audioSessions.entries())
    .filter(([, session]) => {
      const matchEmpresa = parsedId === null || session.extras?.empresa?.id === parsedId;
      const matchPlataforma = plataforma === null || session.extras?.plataforma === plataforma;
      return matchEmpresa && matchPlataforma;
    })
    .map(([channelId, session]) => ({
      channelId,
      destination: session.destination,
      plataforma: session.extras?.plataforma
    }));
}

/**
* Cerrar todas las sesiones (para limpieza)
*/
export function closeAllSessions() {
  for (const [channelId] of audioSessions) {
    closeAudioSession(channelId);
  }
}

/**
 * Agregar llamada a la cola
 * @param {number} empresaId - ID de la empresa
 * @param {string} plataforma - Plataforma (APP, WEB, etc.)
 * @param {Object} callData - Datos de la llamada (destination, data, extras, url)
 * @param {number} campaniaId - ID de la campaña (opcional)
 */
export function addToQueue(empresaId, plataforma, callData, campaniaId = null) {
  // Debug: ver qué se guarda en la cola
  console.log(`[Queue] Encolando - data: ${JSON.stringify(callData.data)}, id_llamada: ${callData.data?.id_llamada}`);

  // Agregar campaniaId a los datos de la llamada
  const callWithCampania = { ...callData, campaniaId };

  // Guardar configuración de la campaña si viene en extras
  if (campaniaId && callData.extras?.config_llamadas) {
    setCampaignConfig(campaniaId, callData.extras.config_llamadas, empresaId, plataforma);
  }

  // Agregar a chunks en disco (persistencia inmediata)
  const position = addCallToChunks(empresaId, plataforma, campaniaId || 'default', callWithCampania);

  const totalInQueue = countCallsInQueue(empresaId, plataforma);
  logger.info(`[Queue] Llamada encolada para empresa ${empresaId} (${plataforma}), campaña ${campaniaId}. Total en cola: ${totalInQueue}`);

  return position;
}

/**
 * Agregar múltiples llamadas a la cola de forma eficiente (batch)
 * Escribe todas las llamadas en chunks de una sola vez
 */
export function addToQueueBatch(empresaId, plataforma, callsData, campaniaId = null) {
  if (!callsData || callsData.length === 0) return 0;

  // Guardar configuración de la campaña si viene en el primer elemento
  const firstCall = callsData[0];
  if (campaniaId && firstCall.extras?.config_llamadas) {
    setCampaignConfig(campaniaId, firstCall.extras.config_llamadas, empresaId, plataforma);
  }

  const campaignDir = getCampaignDir(empresaId, plataforma, campaniaId || 'default');
  ensureDir(campaignDir);

  // Obtener el último chunk
  let lastChunkNumber = getLastChunkNumber(empresaId, plataforma, campaniaId || 'default');
  if (lastChunkNumber === 0) lastChunkNumber = 1;

  let lastChunkPath = getChunkPath(empresaId, plataforma, campaniaId || 'default', lastChunkNumber);
  let lastChunk = readChunk(lastChunkPath);

  let encoladas = 0;

  for (const callData of callsData) {
    // Debug: ver qué se guarda en la cola (solo el primero para no saturar)
    if (encoladas === 0) {
      console.log(`[Queue Batch] Encolando - data: ${JSON.stringify(callData.data)}, id_llamada: ${callData.data?.id_llamada}`);
    }
    const callWithCampania = { ...callData, campaniaId };

    // Si el chunk está lleno, guardar y crear uno nuevo
    if (lastChunk.length >= MAX_CALLS_PER_CHUNK) {
      writeChunk(lastChunkPath, lastChunk);
      lastChunkNumber++;
      lastChunkPath = getChunkPath(empresaId, plataforma, campaniaId || 'default', lastChunkNumber);
      lastChunk = [];
    }

    lastChunk.push(callWithCampania);
    encoladas++;
  }

  // Guardar el último chunk
  if (lastChunk.length > 0) {
    writeChunk(lastChunkPath, lastChunk);
  }

  const totalInQueue = countCallsInQueue(empresaId, plataforma);
  logger.info(`[Queue] ${encoladas} llamadas encoladas para empresa ${empresaId} (${plataforma}), campaña ${campaniaId}. Total en cola: ${totalInQueue}`);

  return encoladas;
}

/**
 * Obtener tamaño de la cola de una empresa-plataforma
 */
export function getQueueSize(empresaId, plataforma) {
  return countCallsInQueue(empresaId, plataforma);
}

// Intervalo para procesar colas periódicamente
let queueProcessorInterval = null;
const QUEUE_CHECK_INTERVAL_MS = 10000; // Cada 10 segundos

// Intervalo para limpiar sesiones huérfanas
let orphanCleanupInterval = null;
const ORPHAN_CHECK_INTERVAL_MS = 60000; // Cada 60 segundos
const ORPHAN_TIMEOUT_MS = 120000; // 2 minutos sin socket = huérfana

/**
 * Limpiar sesiones huérfanas (sin socket por más de 2 minutos)
 * Fallback en caso de que AMI no envíe el evento Hangup
 */
function cleanupOrphanSessions() {
  const now = Date.now();

  for (const [channelId, session] of audioSessions) {
    // Si no tiene socket y pasaron más de 2 minutos desde que se creó
    if (!session.socket && session.createdAt && (now - session.createdAt > ORPHAN_TIMEOUT_MS)) {

      // NO limpiar si tiene Ultravox activo (está procesando la llamada)
      if (session.ultravoxSession?.isConnected) {
        logger.info(`[ExternalMedia] Sesión ${channelId} sin socket pero Ultravox activo, esperando...`);
        continue;
      }

      logger.warn(`[ExternalMedia] Sesión huérfana detectada: ${channelId}, limpiando...`);

      // Solo enviar call-no-contesta si NO se detectó voz (no fue contestada)
      if (session.url && !session.voiceDetected) {
        sendCallNoContesta({
          provider_call_id: channelId,
          id_llamada: session.data?.id_llamada,
          status: 'NO_ANSWER',
          apiUrl: session.url
        });
      }

      // Eliminar sesión y procesar cola
      removeAudioSession(channelId);
    }
  }
}

/**
 * Iniciar limpieza periódica de sesiones huérfanas
 */
export function startOrphanCleanup() {
  if (orphanCleanupInterval) {
    clearInterval(orphanCleanupInterval);
  }

  orphanCleanupInterval = setInterval(cleanupOrphanSessions, ORPHAN_CHECK_INTERVAL_MS);
  logger.info(`[ExternalMedia] Limpieza de sesiones huérfanas iniciada (cada ${ORPHAN_CHECK_INTERVAL_MS / 1000}s)`);
}

/**
 * Detener limpieza de sesiones huérfanas
 */
export function stopOrphanCleanup() {
  if (orphanCleanupInterval) {
    clearInterval(orphanCleanupInterval);
    orphanCleanupInterval = null;
  }
}

/**
 * Procesar todas las colas de todas las empresas-plataformas
 * Se ejecuta periódicamente para procesar llamadas cuando el horario sea válido
 */
async function processAllQueues() {
  // Iterar por los directorios de colas en disco
  if (!fs.existsSync(QUEUES_DIR)) {
    return;
  }

  const queueDirs = fs.readdirSync(QUEUES_DIR);

  for (const queueDir of queueDirs) {
    const queuePath = path.join(QUEUES_DIR, queueDir);

    if (!fs.statSync(queuePath).isDirectory()) {
      continue;
    }

    // Extraer empresaId y plataforma del nombre del directorio
    const parts = queueDir.split('-');
    if (parts.length < 2) continue;

    const empresaId = parts[0];
    const plataforma = parts.slice(1).join('-'); // Por si plataforma tiene guiones

    // Obtener campañas
    const campaigns = getCampaignsInQueue(empresaId, plataforma);

    for (const campaniaId of campaigns) {
      // Obtener la primera llamada para saber el canal
      const firstCall = getFirstCallFromChunks(empresaId, plataforma, campaniaId);

      if (firstCall) {
        // Si no hay límite de canales configurado, usar 10 por defecto
        const canal = firstCall.call?.extras?.canal || 10;
        await processQueue(Number(empresaId), plataforma, canal);
        break; // Solo procesar una vez por empresa-plataforma
      }
    }
  }
}

/**
 * Iniciar el procesador periódico de colas
 */
export function startQueueProcessor() {
  if (queueProcessorInterval) {
    clearInterval(queueProcessorInterval);
  }

  queueProcessorInterval = setInterval(async () => {
    await processAllQueues();
  }, QUEUE_CHECK_INTERVAL_MS);

  logger.info(`[Queue] Procesador de colas iniciado (cada ${QUEUE_CHECK_INTERVAL_MS / 1000}s)`);
}

/**
 * Detener el procesador periódico de colas
 */
export function stopQueueProcessor() {
  if (queueProcessorInterval) {
    clearInterval(queueProcessorInterval);
    queueProcessorInterval = null;
    logger.info(`[Queue] Procesador de colas detenido`);
  }
}

/**
 * Procesar llamadas de la cola que estén dentro de horario
 * Procesa tantas como canales disponibles haya
 */
async function processQueue(empresaId, plataforma, canal) {
  const totalEnCola = countCallsInQueue(empresaId, plataforma);

  if (totalEnCola === 0) {
    return;
  }

  // Calcular canales disponibles
  let llamadasActivas = getAllAudioSessions(empresaId, plataforma).length;
  let canalesDisponibles = canal - llamadasActivas;

  if (canalesDisponibles <= 0) {
    logger.info(`[Queue] Empresa ${empresaId} (${plataforma}) en límite (${llamadasActivas}/${canal}). Cola pendiente: ${totalEnCola}`);
    return;
  }

  let llamadasProcesadas = 0;

  // Obtener todas las campañas de esta empresa-plataforma
  const campaigns = getCampaignsInQueue(empresaId, plataforma);

  // Procesar tantas llamadas como canales disponibles
  while (canalesDisponibles > 0) {
    let callData = null;
    let foundCampaignId = null;
    let chunkInfo = null;

    // Buscar la primera llamada que esté dentro de horario (FIFO por campaña)
    for (const campaniaId of campaigns) {
      const firstCallInfo = getFirstCallFromChunks(empresaId, plataforma, campaniaId);

      if (!firstCallInfo) continue;

      const call = firstCallInfo.call;

      // Obtener configuración de la campaña
      const campaignConfig = campaniaId ? getCampaignConfig(campaniaId) : null;
      const configLlamadas = campaignConfig?.configLlamadas || call.extras?.config_llamadas;

      // Verificar si está dentro de horario
      if (isWithinSchedule(configLlamadas)) {
        callData = call;
        foundCampaignId = campaniaId;
        chunkInfo = firstCallInfo;
        break;
      }
    }

    // Si no hay más llamadas dentro de horario, salir del loop
    if (!callData || !chunkInfo) {
      const remaining = countCallsInQueue(empresaId, plataforma);
      if (remaining > 0) {
        logger.info(`[Queue] Empresa ${empresaId} (${plataforma}): ${remaining} llamadas en cola, ninguna dentro de horario`);
      }
      break;
    }

    // Remover la llamada del chunk
    removeFirstCallFromChunk(
      chunkInfo.chunkPath,
      chunkInfo.chunk,
      empresaId,
      plataforma,
      foundCampaignId,
      chunkInfo.chunkNumber
    );

    try {
      // Debug: ver qué contiene callData
      logger.info(`[Queue] callData.data: ${JSON.stringify(callData.data)}, id_llamada: ${callData.data?.id_llamada}`);

      // Originar la llamada
      const trunk = callData.extras?.trunk || 'svip_bitel';
      const prefijoTroncal = callData.extras?.prefijo_troncal || null;
      const result = await originateUltravoxCall(
        callData.destination,
        empresaId,
        callData.data?.id_llamada,
        trunk,
        prefijoTroncal
      );

      // Crear la sesión de audio
      await createAudioSession(result.channelId, {
        destination: result.destination,
        data: callData.data,
        extras: callData.extras,
        _ref: callData._ref,
        record: result.record,
        recordDate: result.recordDate,
        url: callData.url
      });

      logger.info(`[Queue] Llamada de cola iniciada: ${result.channelId} (${plataforma}, campaña ${foundCampaignId})`);
      llamadasProcesadas++;
      canalesDisponibles--;

    } catch (error) {
      logger.error(`[Queue] Error al procesar llamada de cola:`, error.message);
    }
  }

  if (llamadasProcesadas > 0) {
    const remaining = countCallsInQueue(empresaId, plataforma);
    logger.info(`[Queue] Empresa ${empresaId} (${plataforma}): ${llamadasProcesadas} llamadas procesadas de cola. Restantes: ${remaining}`);
  }
}

export default {
  initAudioSocketServer,
  createAudioSession,
  getAudioSession,
  closeAudioSession,
  getAllAudioSessions,
  closeAllSessions
};
