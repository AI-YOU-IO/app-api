import config from '../config/config.js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from "../config/logger/loggerClient.js";

const execAsync = promisify(exec);

/**
 * Convierte un archivo WAV a MP3 con la menor calidad/peso posible
 * @param {string} wavPath - Ruta del archivo WAV
 * @returns {Promise<string>} - Ruta del archivo MP3 generado
 */
async function convertWavToMp3(wavPath) {
  const mp3Path = wavPath.replace('.wav', '.mp3');

  try {
    // Convertir a MP3 con baja calidad para menor peso
    // -q:a 9 es la calidad más baja (0-9, donde 9 es la más baja)
    // -ar 8000 reduce el sample rate
    // -ac 1 mono
    await execAsync(`ffmpeg -i "${wavPath}" -q:a 9 -ar 8000 -ac 1 -y "${mp3Path}"`);
    // console.log(`[CRM] WAV convertido a MP3: ${mp3Path}`);
    return mp3Path;
  } catch (error) {
    logger.error(`[CRM] Error al convertir WAV a MP3:`, error.message);
    throw error;
  }
}

/**
 * Obtiene la duración en segundos de un archivo WAV leyendo el header
 * @param {string} audioPath - Ruta del archivo de audio
 * @returns {number} - Duración en segundos (entero)
 */
function getWavDuration(audioPath) {
  try {
    const buffer = fs.readFileSync(audioPath);

    // WAV header: bytes 24-27 = sample rate, bytes 40-43 = data size
    const sampleRate = buffer.readUInt32LE(24);
    const bitsPerSample = buffer.readUInt16LE(34);
    const numChannels = buffer.readUInt16LE(22);
    const dataSize = buffer.readUInt32LE(40);

    const bytesPerSample = bitsPerSample / 8;
    const totalSamples = dataSize / (bytesPerSample * numChannels);
    const duration = Math.round(totalSamples / sampleRate);

    return duration;
  } catch (error) {
    logger.error(`[CRM] Error al obtener duración del WAV:`, error.message);
    return 0;
  }
}

/**
 * Obtiene la duración en segundos de un archivo de audio usando ffprobe (fallback)
 * @param {string} audioPath - Ruta del archivo de audio
 * @returns {Promise<number>} - Duración en segundos (entero)
 */
async function getAudioDuration(audioPath) {
  // Primero intentar con header WAV (más rápido)
  const wavDuration = getWavDuration(audioPath);
  if (wavDuration > 0) {
    return wavDuration;
  }

  // Fallback a ffprobe
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    const duration = Math.round(parseFloat(stdout.trim()));
    return duration;
  } catch (error) {
    logger.error(`[CRM] Error al obtener duración del audio:`, error.message);
    return 0;
  }
}

/**
 * Valida que el archivo de audio corresponda a la llamada correcta
 * @param {string} audioPath - Ruta del archivo de audio
 * @param {string} idLlamada - ID de la llamada
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateAudioFile(audioPath, idLlamada) {
  // Obtener nombre del archivo sin extensión
  const fileName = path.basename(audioPath, '.wav');

  // Validar que el archivo comience con el id_llamada
  // Formato: {id_llamada}-{destination}.wav
  if (idLlamada && !fileName.startsWith(String(idLlamada))) {
    return {
      valid: false,
      error: `id_llamada no coincide. Esperado: ${idLlamada}, Archivo: ${fileName}`
    };
  }

  return { valid: true };
}

/**
 * Sube el audio de una llamada al CRM
 * @param {Object} params - Parámetros para el upload
 * @param {string} params.audioPath - Ruta del archivo de audio (WAV)
 * @param {string} params.provider_call_id - ID del proveedor (channelId)
 * @param {number} params.id_llamada - ID de la llamada
 * @param {number} params.id_empresa - ID de la empresa
 * @param {string} params.apiUrl - URL del API
 */
export async function uploadCallAudio(params) {
  const { audioPath, provider_call_id, id_llamada, id_empresa, apiUrl } = params;

  if (!provider_call_id) {
    logger.error('[CRM] provider_call_id es requerido para subir el audio');
    return null;
  }

  if (!id_llamada) {
    logger.error('[CRM] id_llamada es requerido para subir el audio');
    return null;
  }

  if (!fs.existsSync(audioPath)) {
    logger.error(`[CRM] Archivo de audio no encontrado: ${audioPath}`);
    return null;
  }

  // Validar que el archivo corresponda a la llamada correcta (por id_llamada)
  const validation = validateAudioFile(audioPath, id_llamada);
  if (!validation.valid) {
    logger.error(`[CRM] Validación de archivo fallida: ${validation.error}`);
    return null;
  }

  logger.info(`[CRM] Archivo de audio validado correctamente: ${path.basename(audioPath)}`);

  let mp3Path = null;

  try {
    // Obtener duración del WAV antes de convertir
    const segundos = await getAudioDuration(audioPath);
    logger.info(`[CRM] Duración del audio: ${segundos} segundos`);

    // Convertir WAV a MP3
    mp3Path = await convertWavToMp3(audioPath);

    // Leer el archivo MP3
    const fileBuffer = fs.readFileSync(mp3Path);
    const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });

    // Crear FormData nativo de Node.js
    const form = new FormData();
    form.append('audio', blob, path.basename(mp3Path));
    form.append('id_llamada', id_llamada.toString());
    form.append('segundos', segundos.toString());
    if (id_empresa) {
      form.append('id_empresa', id_empresa.toString());
    }

    const uploadUrl = `${apiUrl}/api/asterisk/upload-audio`;
    // console.log(`[CRM] Subiendo audio a: ${uploadUrl}`);
    // console.log(`[CRM] Provider Call ID: ${provider_call_id}, ID Empresa: ${id_empresa}`);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.crm.token}`
      },
      body: form
    });

    const contentType = response.headers.get('content-type');
    let result;

    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
    } else {
      const text = await response.text();
      logger.error(`[CRM] Respuesta no es JSON:`, response.status, text.substring(0, 200));
      return null;
    }

    if (!response.ok) {
      logger.error(`[CRM] Error al subir audio:`, response.status, result);
      return null;
    }

    logger.info(`[CRM] Audio subido exitosamente para llamada ${provider_call_id}`);

    // Eliminar el archivo MP3 temporal
    if (mp3Path && fs.existsSync(mp3Path)) {
      fs.unlinkSync(mp3Path);
      // console.log(`[CRM] Archivo MP3 temporal eliminado: ${mp3Path}`);
    }

    // Eliminar el archivo WAV original después de subir exitosamente
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      // console.log(`[CRM] Archivo WAV original eliminado: ${audioPath}`);
    }

    return result;

  } catch (error) {
    logger.error(`[CRM] Error al subir audio de llamada: ${error.message}`);

    // Limpiar archivo MP3 temporal en caso de error
    if (mp3Path && fs.existsSync(mp3Path)) {
      try {
        fs.unlinkSync(mp3Path);
      } catch (e) {
        // Ignorar error de limpieza
      }
    }

    return null;
  }
}

/**
 * Envía los datos de transcripción de Ultravox al CRM
 * @param {Object} params - Parámetros para la transcripción
 * @param {number} params.id_llamada - ID de la llamada
 * @param {string} params.id_ultravox_call - ID de Ultravox de la llamada
 * @param {Object} params.metadata - Metadata de Ultravox
 * @param {string} params.transcripcion - Transcripción de la llamada
 */
export async function sendTranscription(params) {
  const { id_llamada, id_ultravox_call, metadata, transcripcion, apiUrl } = params;

  if (!id_llamada) {
    logger.error('[CRM] id_llamada es requerido para enviar transcripción');
    return null;
  }

  try {
    const url = `${apiUrl}/api/asterisk/transcripcion`;

    const payload = {
      id_llamada,
      id_ultravox_call,
      metadata,
      transcripcion
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.crm.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      logger.error(`[CRM] Error al enviar transcripción:`, response.status, result);
      return null;
    }

    logger.info(`[CRM] Transcripción enviada exitosamente para llamada ${id_llamada}`);
    return result;

  } catch (error) {
    logger.error(`[CRM] Error al enviar transcripción:`, error.message);
    return null;
  }
}

/**
 * Construye la ruta del archivo de grabación
 * @param {string} idEmpresa - ID de la empresa
 * @param {string} date - Fecha en formato YYYY-MM-DD
 * @param {string} record - Nombre del archivo de grabación
 * @returns {string} - Ruta completa del archivo WAV
 */
export function getRecordingPath(idEmpresa, date, record) {
  return path.join(config.recordings.path, String(idEmpresa), date, `${record}.wav`);
}

/**
 * Notifica al CRM que una llamada contestada ha terminado
 * @param {Object} params - Parámetros
 * @param {string} params.provider_call_id - ID del proveedor (channelId)
 * @param {number} params.id_llamada - ID de la llamada (de _ref.id)
 * @param {string} params.apiUrl - URL del API
 */
export async function sendCallTerminada(params) {
  const { provider_call_id, id_llamada, apiUrl } = params;

  if (!provider_call_id) {
    logger.error('[CRM] provider_call_id es requerido para notificar call-terminada');
    return null;
  }

  try {
    const url = `${apiUrl}/api/asterisk/call-terminada`;
    logger.info(`[CRM] Notificando call-terminada: ${provider_call_id}, id_llamada: ${id_llamada}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.crm.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider_call_id, id_llamada })
    });

    const contentType = response.headers.get('content-type');
    let result;

    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
    } else {
      const text = await response.text();
      logger.error(`[CRM] Respuesta no es JSON en call-terminada: status=${response.status}, response=${text.substring(0, 200)}`);
      return null;
    }

    if (!response.ok) {
      logger.error(`[CRM] Error en call-terminada: status=${response.status}, response=${JSON.stringify(result)}`);
      return null;
    }

    logger.info(`[CRM] Call-terminada notificado exitosamente: ${provider_call_id}`);
    return result;

  } catch (error) {
    logger.error(`[CRM] Error al notificar call-terminada: ${error.message}`);
    return null;
  }
}

/**
 * Notifica al CRM que una llamada no fue contestada
 * @param {Object} params - Parámetros
 * @param {string} params.provider_call_id - ID del proveedor (channelId)
 * @param {number} params.id_llamada - ID de la llamada (de _ref.id)
 * @param {string} params.status - Estado de la llamada (NO_ANSWER, BUSY, REJECTED, etc.)
 * @param {string} params.apiUrl - URL del API
 */
export async function sendCallNoContesta(params) {
  const { provider_call_id, id_llamada, status, apiUrl } = params;

  if (!provider_call_id && !id_llamada) {
    logger.error('[CRM] provider_call_id o id_llamada es requerido para notificar call-no-contesta');
    return null;
  }

  try {
    const url = `${apiUrl}/api/asterisk/call-no-contesta`;
    logger.info(`[CRM] Notificando call-no-contesta: ${provider_call_id}, id_llamada: ${id_llamada}, status: ${status}, url: ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.crm.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider_call_id, id_llamada, status })
    });

    const contentType = response.headers.get('content-type');
    let result;

    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
    } else {
      const text = await response.text();
      logger.error(`[CRM] Respuesta no es JSON en call-no-contesta:`, response.status, text.substring(0, 200));
      return null;
    }

    if (!response.ok) {
      logger.error(`[CRM] Error en call-no-contesta: status=${response.status}, response=${JSON.stringify(result)}`);
      return null;
    }

    logger.info(`[CRM] Call-no-contesta notificado exitosamente: ${provider_call_id}`);
    return result;

  } catch (error) {
    logger.error(`[CRM] Error al notificar call-no-contesta:`, error.message);
    return null;
  }
}

/**
 * Notifica al CRM que una llamada ha iniciado
 * @param {Object} params - Parámetros
 * @param {string} params.provider_call_id - ID del proveedor (channelId)
 * @param {number} params.id_llamada - ID de la llamada (de _ref.id)
 * @param {string} params.apiUrl - URL del API
 */
export async function sendCallEntrada(params) {
  const { provider_call_id, id_llamada, apiUrl } = params;

  if (!provider_call_id) {
    logger.error('[CRM] provider_call_id es requerido para notificar call-entrada');
    return null;
  }

  try {
    const url = `${apiUrl}/api/asterisk/call-entrada`;
    logger.info(`[CRM] Notificando call-entrada: ${provider_call_id}, id_llamada: ${id_llamada}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.crm.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider_call_id, id_llamada })
    });

    const result = await response.json();

    if (!response.ok) {
      logger.error(`[CRM] Error en call-entrada:`, response.status, result);
      return null;
    }

    logger.info(`[CRM] Call-entrada notificado exitosamente: ${provider_call_id}`);
    return result;

  } catch (error) {
    logger.error(`[CRM] Error al notificar call-entrada:`, error.message);
    return null;
  }
}

export default {
  uploadCallAudio,
  sendTranscription,
  sendCallTerminada,
  sendCallNoContesta,
  sendCallEntrada,
  convertWavToMp3,
  getRecordingPath,
  validateAudioFile
};
