/**
 * Servicio reutilizable de transcripción de audio usando OpenAI Whisper API.
 * Convierte archivos de audio (ogg, mp3, wav, m4a, webm) a texto.
 *
 * Uso:
 *   const transcriptionService = require('./services/transcription/transcription.service');
 *   const texto = await transcriptionService.transcribe(buffer, 'audio.ogg');
 *   const texto = await transcriptionService.transcribeFromUrl(url);
 */

const { OpenAI } = require('openai');
const axios = require('axios');
const logger = require('../../config/logger/loggerClient');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

class TranscriptionService {

    constructor() {
        if (!OPENAI_API_KEY) {
            logger.warn('[TranscriptionService] OPENAI_API_KEY no configurada, transcripción no disponible');
        }
        this.client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
    }

    /**
     * Extensiones de audio soportadas por Whisper
     */
    static SUPPORTED_EXTENSIONS = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg'];

    /**
     * Verifica si un tipo MIME o extensión es un audio soportado
     * @param {string} mimeOrExt - MIME type (audio/ogg) o extensión (.ogg)
     * @returns {boolean}
     */
    isAudioSupported(mimeOrExt) {
        if (!mimeOrExt) return false;
        const lower = mimeOrExt.toLowerCase();

        // Verificar por extensión
        if (lower.startsWith('.')) {
            return TranscriptionService.SUPPORTED_EXTENSIONS.includes(lower);
        }

        // Verificar por MIME type
        if (lower.startsWith('audio/')) return true;
        if (lower === 'video/mp4') return true; // mp4 con audio

        return false;
    }

    /**
     * Transcribe un buffer de audio a texto usando Whisper
     * @param {Buffer} buffer - Buffer del archivo de audio
     * @param {string} filename - Nombre del archivo con extensión (ej: 'audio.ogg')
     * @param {object} options - Opciones adicionales
     * @param {string} options.language - Código de idioma (default: 'es')
     * @param {string} options.model - Modelo Whisper (default: 'whisper-1')
     * @returns {Promise<string>} Texto transcrito
     */
    async transcribe(buffer, filename = 'audio.ogg', options = {}) {
        if (!this.client) {
            throw new Error('TranscriptionService no inicializado: OPENAI_API_KEY no configurada');
        }

        if (!buffer || buffer.length === 0) {
            throw new Error('Buffer de audio vacío');
        }

        const { language = 'es', model = 'whisper-1' } = options;

        try {
            const file = new File([buffer], filename, {
                type: this._mimeFromFilename(filename)
            });

            const response = await this.client.audio.transcriptions.create({
                file,
                model,
                language,
                response_format: 'text'
            });

            const texto = (typeof response === 'string' ? response : response.text || '').trim();
            logger.info(`[TranscriptionService] Audio transcrito (${buffer.length} bytes): "${texto.substring(0, 100)}..."`);
            return texto;
        } catch (error) {
            logger.error(`[TranscriptionService] Error al transcribir: ${error.message}`);
            throw error;
        }
    }

    /**
     * Descarga un audio desde URL y lo transcribe
     * @param {string} url - URL del archivo de audio
     * @param {object} options - Opciones (language, model)
     * @returns {Promise<string>} Texto transcrito
     */
    async transcribeFromUrl(url, options = {}) {
        if (!url) {
            throw new Error('URL de audio requerida');
        }

        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 60000
            });

            const buffer = Buffer.from(response.data);
            const contentType = response.headers['content-type'] || '';
            const extension = this._extensionFromMime(contentType);
            const filename = `audio_${Date.now()}${extension}`;

            return await this.transcribe(buffer, filename, options);
        } catch (error) {
            logger.error(`[TranscriptionService] Error descargando audio desde URL: ${error.message}`);
            throw error;
        }
    }

    /**
     * Obtiene MIME type a partir del nombre de archivo
     */
    _mimeFromFilename(filename) {
        const ext = (filename || '').toLowerCase().split('.').pop();
        const map = {
            'ogg': 'audio/ogg',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'm4a': 'audio/mp4',
            'webm': 'audio/webm',
            'mp4': 'video/mp4',
            'mpeg': 'audio/mpeg',
            'mpga': 'audio/mpeg'
        };
        return map[ext] || 'audio/ogg';
    }

    /**
     * Obtiene extensión a partir de MIME type
     */
    _extensionFromMime(mime) {
        const map = {
            'audio/ogg': '.ogg',
            'audio/mpeg': '.mp3',
            'audio/wav': '.wav',
            'audio/mp4': '.m4a',
            'audio/webm': '.webm',
            'audio/amr': '.amr',
            'video/mp4': '.mp4'
        };
        return map[mime] || '.ogg';
    }
}

module.exports = new TranscriptionService();
