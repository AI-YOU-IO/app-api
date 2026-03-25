const AssistantService = require("../services/assistant/asistant.service");
const WhatsappGraphService = require("../services/whatsapp/whatsappGraph.service.js");
const Persona = require("../models/persona.model.js");
const Usuario = require("../models/usuario.model.js");
const Chat = require("../models/chat.model.js");
const Mensaje = require("../models/mensaje.model.js");
const ConfiguracionWhatsapp = require("../models/configuracionWhatsapp.model.js");
const websocketNotifier = require("../services/websocketNotifier.service.js");
const s3Service = require("../services/s3.service.js");
const logger = require("../config/logger/loggerClient");

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'bitel_webhook_token_2026';

// Trackeo de errores unicos por telefono (evita spam)
const erroresUnicosEnviados = {};

/**
 * Mapeo de formato de archivo a tipo de mensaje
 */
const FORMATO_A_TIPO = {
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
    '.webp': 'image', '.bmp': 'image',
    '.mp4': 'video', '.mov': 'video', '.avi': 'video', '.webm': 'video', '.3gp': 'video',
    '.mp3': 'audio', '.ogg': 'audio', '.wav': 'audio', '.aac': 'audio', '.m4a': 'audio', '.opus': 'audio',
    '.pdf': 'document', '.doc': 'document', '.docx': 'document',
    '.xls': 'document', '.xlsx': 'document', '.ppt': 'document', '.pptx': 'document',
    '.txt': 'document', '.csv': 'document'
};

/**
 * URLs whitelist (no extraer como media)
 */
const URLS_WHITELIST = [
    /google\.\w+\/maps/i,
    /maps\.google/i,
    /goo\.gl\/maps/i,
    /maps\.app\.goo\.gl/i
];

/**
 * Delimitadores para split de mensajes largos
 */
const DELIMITADORES_SPLIT = ['¿'];

/**
 * Divide texto largo en segmentos usando delimitadores
 */
function splitPorDelimitadores(texto) {
    if (!texto || DELIMITADORES_SPLIT.length === 0) return [texto];
    const escaped = DELIMITADORES_SPLIT.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`(?=${escaped})`, 'g');
    return texto.split(regex).map(s => s.trim()).filter(Boolean);
}

/**
 * Extrae URLs de archivos del texto y las clasifica
 */
function procesarMultiplesURLs(texto) {
    if (!texto) return { urlsEncontradas: [], textoLimpio: texto };

    const urlRegex = /(https?:\/\/[^\s\)\]]+|\/uploads\/[^\s\)\]]+)/gi;
    const urlsEncontradas = [];

    const textoSinURLs = texto.replace(urlRegex, (url) => {
        if (URLS_WHITELIST.some(pattern => pattern.test(url))) return url;

        const urlLower = url.toLowerCase();
        for (const [formato, tipo] of Object.entries(FORMATO_A_TIPO)) {
            if (urlLower.includes(formato)) {
                urlsEncontradas.push({ url: url.trim(), formato, tipo });
                break;
            }
        }
        return '';
    });

    const textoLimpio = textoSinURLs
        .split('\n')
        .filter(linea => linea.replace(/!?\[[^\]]*\]\(\s*\)/g, '').replace(/[-•*>\s]/g, '').length > 0)
        .join('\n')
        .trim();

    return { urlsEncontradas, textoLimpio };
}

/**
 * Envia mensaje de error unico al usuario cuando el bot falla
 */
async function enviarErrorUnico(empresaId, phone) {
    if (!phone || erroresUnicosEnviados[phone]) return;

    erroresUnicosEnviados[phone] = true;
    const mensajeError = "Lo siento, estoy teniendo problemas tecnicos. Un asesor te atendera pronto.";

    try {
        await WhatsappGraphService.enviarMensajeTexto(empresaId, phone, mensajeError);
        logger.info(`[webhook] Mensaje de error unico enviado a ${phone}`);
    } catch (e) {
        logger.error(`[webhook] No se pudo enviar mensaje de error: ${e.message}`);
        delete erroresUnicosEnviados[phone];
    }
}

class WebhookController {

    /**
     * GET /webhook - Verificacion de Meta
     */
    async verify(req, res) {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            logger.info('[webhook] Verificacion exitosa');
            return res.status(200).send(challenge);
        }

        logger.warn('[webhook] Verificacion fallida');
        return res.sendStatus(403);
    }

    /**
     * POST /webhook - Recibe mensajes de WhatsApp Cloud API
     */
    async receive(req, res) {
        res.sendStatus(200);

        try {
            const body = req.body;
            if (body.object !== 'whatsapp_business_account') return;

            const entries = body.entry || [];

            for (const entry of entries) {
                const changes = entry.changes || [];

                for (const change of changes) {
                    if (change.field !== 'messages') continue;

                    const value = change.value || {};
                    const metadata = value.metadata || {};
                    const phoneNumberId = metadata.phone_number_id;
                    const messages = value.messages || [];
                    const contacts = value.contacts || [];
                    const statuses = value.statuses || [];

                    // Procesar status updates (delivered, read, etc)
                    if (statuses.length > 0) {
                        for (const status of statuses) {
                            logger.info(`[webhook] Status: ${status.status} para ${status.recipient_id}`);
                        }
                    }

                    if (!phoneNumberId || messages.length === 0) continue;

                    for (const message of messages) {
                        try {
                            await this.processIncomingMessage(phoneNumberId, message, contacts);
                        } catch (msgError) {
                            logger.error(`[webhook] Error procesando mensaje ${message.id}: ${msgError.message}`);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error(`[webhook] Error general: ${error.message}`);
        }
    }

    /**
     * Procesa un mensaje entrante individual
     */
    async processIncomingMessage(phoneNumberId, message, contacts) {
        const phone = message.from;
        const wid = message.id;
        const messageType = message.type;
        const timestamp = message.timestamp;
        const contactName = contacts?.[0]?.profile?.name || null;

        let paso = 'inicio';

        // Resolver empresa desde phone_number_id
        paso = 'resolver empresa';
        const configWhatsapp = await ConfiguracionWhatsapp.getByPhoneNumberId(phoneNumberId);
        if (!configWhatsapp) {
            logger.error(`[webhook] No se encontro config para phone_number_id: ${phoneNumberId}`);
            return;
        }
        const empresaId = configWhatsapp.id_empresa;

        // Extraer contenido segun tipo
        let contenidoTexto = '';
        let mediaId = null;
        let mimeType = null;
        let filename = null;

        switch (messageType) {
            case 'text':
                contenidoTexto = message.text?.body || '';
                break;
            case 'image':
                contenidoTexto = message.image?.caption || '';
                mediaId = message.image?.id;
                mimeType = message.image?.mime_type;
                break;
            case 'video':
                contenidoTexto = message.video?.caption || '';
                mediaId = message.video?.id;
                mimeType = message.video?.mime_type;
                break;
            case 'audio':
                mediaId = message.audio?.id;
                mimeType = message.audio?.mime_type;
                break;
            case 'document':
                contenidoTexto = message.document?.caption || '';
                mediaId = message.document?.id;
                mimeType = message.document?.mime_type;
                filename = message.document?.filename;
                break;
            case 'sticker':
                mediaId = message.sticker?.id;
                mimeType = message.sticker?.mime_type;
                break;
            case 'location':
                const loc = message.location || {};
                contenidoTexto = `Ubicacion: ${loc.latitude}, ${loc.longitude}${loc.name ? ' - ' + loc.name : ''}`;
                break;
            case 'reaction':
                return; // Ignorar reacciones
            default:
                contenidoTexto = `[Mensaje tipo ${messageType}]`;
                break;
        }

        logger.info(`[webhook] Mensaje de ${phone} tipo=${messageType} media=${mediaId || 'none'}`);

        // Descargar media y subir a S3 si aplica
        paso = 'descargar media';
        let contenidoArchivo = null;
        if (mediaId) {
            try {
                const media = await WhatsappGraphService.descargarMedia(empresaId, mediaId);
                const fakeFile = {
                    buffer: media.buffer,
                    mimetype: media.contentType,
                    originalname: filename || `whatsapp_${Date.now()}${media.extension}`
                };
                contenidoArchivo = await s3Service.uploadFile(fakeFile, 'chat-incoming', empresaId);
                logger.info(`[webhook] Media subido a S3: ${contenidoArchivo}`);
            } catch (mediaError) {
                logger.error(`[webhook] Error descargando media ${mediaId}: ${mediaError.message}`);
            }
        }

        // Buscar o crear persona
        paso = 'buscar/crear persona';
        let persona = await Persona.selectByCelular(phone, empresaId);

        if (!persona) {
            const usuarioInstance = new Usuario();
            const asesores = await usuarioInstance.getByRol(3);
            const ids = asesores.map(a => a.id);

            let id_asesor = null;
            if (ids.length > 0) {
                const ultimoAsignacion = await Persona.getAsignacionesAsesor();
                if (ultimoAsignacion?.id_usuario) {
                    const indice = (ids.indexOf(ultimoAsignacion.id_usuario) + 1) % ids.length;
                    id_asesor = ids[indice];
                } else {
                    id_asesor = ids[0];
                }
            }

            persona = await Persona.createPersona({
                id_estado: 1,
                celular: phone,
                nombre_completo: contactName,
                id_usuario: id_asesor,
                id_empresa: empresaId,
                usuario_registro: null
            });
        }

        // Buscar o crear chat
        paso = 'buscar/crear chat';
        let chat = await Chat.findByPersona(persona.id);
        if (!chat) {
            const chatId = await Chat.create({
                id_empresa: empresaId,
                id_persona: persona.id,
                usuario_registro: null
            });
            chat = { id: chatId };
        }

        const chatId = chat.id || chat;

        // Guardar mensaje entrante
        paso = 'guardar mensaje entrante';
        const fechaEntrante = new Date(timestamp ? parseInt(timestamp) * 1000 : Date.now());
        await Mensaje.create({
            id_chat: chatId,
            contenido: contenidoTexto || (contenidoArchivo ? `[${messageType}]` : null),
            contenido_archivo: contenidoArchivo,
            direccion: "in",
            wid_mensaje: wid,
            tipo_mensaje: messageType,
            fecha_hora: fechaEntrante,
            usuario_registro: null
        });

        // Notificar WebSocket
        websocketNotifier.notificarMensajeEntrante(chatId, {
            id_contacto: chatId,
            contenido: contenidoTexto,
            contenido_archivo: contenidoArchivo,
            direccion: "in",
            wid_mensaje: wid,
            tipo: messageType,
            fecha_hora: fechaEntrante.toISOString()
        });

        // Verificar si el bot esta activo
        const chatData = await Chat.findById(chatId);
        if (chatData && chatData.bot_activo === 0) {
            logger.info(`[webhook] Bot desactivado para chat ${chatId}, no se genera respuesta`);
            return;
        }

        // Generar respuesta con AI
        paso = 'procesar con asistente AI';
        let messageForAssistant = contenidoTexto || '';
        if (contenidoArchivo) {
            messageForAssistant = `[El usuario envio un archivo de tipo ${messageType}: ${contenidoArchivo}]\n${messageForAssistant}`.trim();
        }
        if (!messageForAssistant) {
            messageForAssistant = `[El usuario envio un mensaje de tipo ${messageType}]`;
        }

        try {
            const resultado = await AssistantService.runProcess({
                chatId: chatId,
                message: messageForAssistant,
                persona: persona,
                id_empresa: empresaId
            });

            const respuestaTexto = resultado.content;
            logger.info(`[webhook] Respuesta AI: ${respuestaTexto?.substring(0, 100)}...`);

            // Procesar URLs de archivos en la respuesta
            paso = 'procesar URLs de respuesta';
            const { urlsEncontradas, textoLimpio } = procesarMultiplesURLs(respuestaTexto);

            // Enviar texto (dividido en segmentos si es largo)
            paso = 'enviar texto por WhatsApp';
            if (textoLimpio) {
                const segmentos = splitPorDelimitadores(textoLimpio);
                for (const segmento of segmentos) {
                    try {
                        const envio = await WhatsappGraphService.enviarMensajeTexto(empresaId, phone, segmento);

                        if (envio?.wid_mensaje) {
                            const fechaSaliente = new Date();
                            await Mensaje.create({
                                id_chat: chatId,
                                contenido: segmento,
                                direccion: "out",
                                wid_mensaje: envio.wid_mensaje,
                                tipo_mensaje: "texto",
                                fecha_hora: fechaSaliente,
                                usuario_registro: null
                            });

                            websocketNotifier.notificarMensajeSaliente(chatId, {
                                id_contacto: chatId,
                                contenido: segmento,
                                direccion: "out",
                                wid_mensaje: envio.wid_mensaje,
                                tipo: "texto",
                                fecha_hora: fechaSaliente.toISOString()
                            });
                        }
                    } catch (sendError) {
                        logger.error(`[webhook] Error enviando segmento a ${phone}: ${sendError.message}`);
                    }
                }
            }

            // Enviar archivos encontrados en la respuesta del AI
            for (const urlInfo of urlsEncontradas) {
                if (urlInfo.url.startsWith('http://')) {
                    logger.warn(`[webhook] URL HTTP ignorada (Meta requiere HTTPS): ${urlInfo.url}`);
                    continue;
                }

                paso = `enviar archivo ${urlInfo.tipo}`;
                try {
                    let envio = null;

                    switch (urlInfo.tipo) {
                        case 'image':
                            envio = await WhatsappGraphService.enviarImagen(empresaId, phone, urlInfo.url, '');
                            break;
                        case 'video':
                            envio = await WhatsappGraphService.enviarVideo(empresaId, phone, urlInfo.url, '');
                            break;
                        case 'audio':
                            envio = await WhatsappGraphService.enviarAudio(empresaId, phone, urlInfo.url);
                            break;
                        case 'document':
                            const fname = urlInfo.url.split('/').pop() || 'documento';
                            envio = await WhatsappGraphService.enviarDocumento(empresaId, phone, urlInfo.url, fname, '');
                            break;
                    }

                    if (envio?.wid_mensaje) {
                        const fechaArchivo = new Date();
                        await Mensaje.create({
                            id_chat: chatId,
                            contenido: `[${urlInfo.tipo}]`,
                            contenido_archivo: urlInfo.url,
                            direccion: "out",
                            wid_mensaje: envio.wid_mensaje,
                            tipo_mensaje: urlInfo.tipo,
                            fecha_hora: fechaArchivo,
                            usuario_registro: null
                        });

                        websocketNotifier.notificarMensajeSaliente(chatId, {
                            id_contacto: chatId,
                            contenido: `[${urlInfo.tipo}]`,
                            contenido_archivo: urlInfo.url,
                            direccion: "out",
                            wid_mensaje: envio.wid_mensaje,
                            tipo: urlInfo.tipo,
                            fecha_hora: fechaArchivo.toISOString()
                        });
                    }
                } catch (fileError) {
                    logger.error(`[webhook] Error enviando ${urlInfo.tipo}: ${fileError.message}`);
                }
            }

        } catch (aiError) {
            logger.error(`[webhook] Error en paso "${paso}": ${aiError.message}`);
            logger.error(`[webhook] Stack: ${aiError.stack}`);
            await enviarErrorUnico(empresaId, phone);
        }
    }
}

module.exports = new WebhookController();
