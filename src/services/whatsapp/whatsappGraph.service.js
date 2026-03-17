/**
 * Servicio para interactuar con la Graph API de Facebook/WhatsApp
 * Usa las credenciales guardadas en configuracion_whatsapp
 */

const axios = require('axios');
const configuracionWhatsappRepository = require('../../repositories/configuracionWhatsapp.repository.js');
const logger = require('../../config/logger/loggerClient.js');

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const MARAVIA_ACCESS_TOKEN = process.env.MARAVIA_ACCESS_TOKEN;

class WhatsappGraphService {
  /**
   * Obtiene las credenciales de WhatsApp para una empresa
   */
  async obtenerCredenciales(idEmpresa) {
    const config = await configuracionWhatsappRepository.findByEmpresaId(idEmpresa);
    if (!config) {
      throw new Error(`No se encontraron credenciales de WhatsApp para la empresa ${idEmpresa}`);
    }
    if (!config.numero_telefono_id) {
      throw new Error(`No se encontró numero_telefono_id para la empresa ${idEmpresa}`);
    }
    if (!MARAVIA_ACCESS_TOKEN) {
      throw new Error('MARAVIA_ACCESS_TOKEN no está configurado en las variables de entorno');
    }
    return {
      accessToken: MARAVIA_ACCESS_TOKEN,
      phoneNumberId: config.numero_telefono_id,
      wabaId: config.waba_id,
      appId: config.app_id
    };
  }

  /**
   * Obtiene el WABA ID desde el Phone Number ID si no está guardado
   */
  async obtenerWabaIdDesdePhoneNumber(phoneNumberId, accessToken) {
    try {
      const url = `${GRAPH_API_URL}/${phoneNumberId}?fields=whatsapp_business_account`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 30000
      });
      return response.data?.whatsapp_business_account?.id || null;
    } catch (error) {
      logger.error(`[WhatsappGraph] Error obteniendo WABA ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Lista las plantillas de mensajes de WhatsApp Business desde Meta
   */
  async listarPlantillas(idEmpresa, options = {}) {
    const credenciales = await this.obtenerCredenciales(idEmpresa);
    let wabaId = credenciales.wabaId;

    if (!wabaId) {
      wabaId = await this.obtenerWabaIdDesdePhoneNumber(credenciales.phoneNumberId, credenciales.accessToken);
      if (!wabaId) {
        throw new Error('No se pudo obtener el WhatsApp Business Account ID');
      }
    }

    const fields = 'name,status,category,language,components,quality_score,rejected_reason';
    const limit = options.limit || 100;
    let url = `${GRAPH_API_URL}/${wabaId}/message_templates?fields=${fields}&limit=${limit}`;

    if (options.status) {
      url += `&status=${encodeURIComponent(options.status)}`;
    }

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${credenciales.accessToken}` },
      timeout: 30000
    });

    const templates = (response.data?.data || []).map(template => ({
      id: template.id || null,
      name: template.name || '',
      status: template.status || '',
      category: template.category || '',
      language: template.language || '',
      components: template.components || [],
      quality_score: template.quality_score || null,
      rejected_reason: template.rejected_reason || null
    }));

    return {
      success: true,
      templates,
      total: templates.length,
      waba_id: wabaId,
      paging: response.data?.paging || null
    };
  }

  /**
   * Crea una nueva plantilla de mensaje en Meta
   */
  async crearPlantilla(idEmpresa, name, category, language, components) {
    const credenciales = await this.obtenerCredenciales(idEmpresa);
    let wabaId = credenciales.wabaId;

    if (!wabaId) {
      wabaId = await this.obtenerWabaIdDesdePhoneNumber(credenciales.phoneNumberId, credenciales.accessToken);
      if (!wabaId) {
        throw new Error('No se pudo obtener el WhatsApp Business Account ID');
      }
    }

    const url = `${GRAPH_API_URL}/${wabaId}/message_templates`;
    const payload = {
      name,
      category: category.toUpperCase(),
      language,
      components: this.formatearComponentesParaCreacion(components)
    };

    logger.info(`[WhatsappGraph] Creando plantilla en Meta: ${name}`);

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credenciales.accessToken}`
      },
      timeout: 30000
    });

    return {
      success: true,
      id: response.data?.id || null,
      status: response.data?.status || 'PENDING',
      category: response.data?.category || category
    };
  }

  /**
   * Edita una plantilla existente en Meta
   */
  async editarPlantilla(idEmpresa, templateId, components) {
    const credenciales = await this.obtenerCredenciales(idEmpresa);
    const url = `${GRAPH_API_URL}/${templateId}`;

    const payload = {
      components: this.formatearComponentesParaCreacion(components)
    };

    logger.info(`[WhatsappGraph] Editando plantilla en Meta: ${templateId}`);

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credenciales.accessToken}`
      },
      timeout: 30000
    });

    return {
      success: true,
      data: response.data
    };
  }

  /**
   * Elimina una plantilla en Meta
   */
  async eliminarPlantilla(idEmpresa, name) {
    const credenciales = await this.obtenerCredenciales(idEmpresa);
    let wabaId = credenciales.wabaId;

    if (!wabaId) {
      wabaId = await this.obtenerWabaIdDesdePhoneNumber(credenciales.phoneNumberId, credenciales.accessToken);
      if (!wabaId) {
        throw new Error('No se pudo obtener el WhatsApp Business Account ID');
      }
    }

    const url = `${GRAPH_API_URL}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`;

    logger.info(`[WhatsappGraph] Eliminando plantilla en Meta: ${name}`);

    const response = await axios.delete(url, {
      headers: { Authorization: `Bearer ${credenciales.accessToken}` },
      timeout: 30000
    });

    return {
      success: true,
      data: response.data
    };
  }

  /**
   * Envía un mensaje de texto simple
   */
  async enviarMensajeTexto(idEmpresa, phone, message) {
    const credenciales = await this.obtenerCredenciales(idEmpresa);
    const url = `${GRAPH_API_URL}/${credenciales.phoneNumberId}/messages`;
    const formattedPhone = this.formatearNumeroTelefono(phone);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'text',
      text: {
        preview_url: true,
        body: message
      }
    };

    logger.info(`[WhatsappGraph] Enviando mensaje de texto a ${formattedPhone}`, {
      url,
      phoneNumberId: credenciales.phoneNumberId,
      tokenLength: credenciales.accessToken?.length || 0,
      messageLength: message?.length || 0
    });

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credenciales.accessToken}`
        },
        timeout: 30000
      });

      logger.info(`[WhatsappGraph] Respuesta OK: ${response.status}`, {
        data: JSON.stringify(response.data)
      });

      const wid_mensaje = response.data?.messages?.[0]?.id || null;
      return { success: true, wid_mensaje, response: response.data };
    } catch (error) {
      logger.error(`[WhatsappGraph] Error enviarMensajeTexto: ${error.message}`, {
        status: error.response?.status,
        data: JSON.stringify(error.response?.data || {}),
        url,
        phoneNumberId: credenciales.phoneNumberId,
        to: formattedPhone
      });
      throw error;
    }
  }

  /**
   * Envía una imagen
   */
  async enviarImagen(idEmpresa, phone, imageUrl, caption = '') {
    const credenciales = await this.obtenerCredenciales(idEmpresa);
    const url = `${GRAPH_API_URL}/${credenciales.phoneNumberId}/messages`;
    const formattedPhone = this.formatearNumeroTelefono(phone);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'image',
      image: { link: imageUrl }
    };

    if (caption) {
      payload.image.caption = caption;
    }

    logger.info(`[WhatsappGraph] Enviando imagen a ${formattedPhone}`);

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credenciales.accessToken}`
      },
      timeout: 30000
    });

    const wid_mensaje = response.data?.messages?.[0]?.id || null;
    return { success: true, wid_mensaje, response: response.data };
  }

  /**
   * Envía un documento
   */
  async enviarDocumento(idEmpresa, phone, documentUrl, filename, caption = '') {
    const credenciales = await this.obtenerCredenciales(idEmpresa);
    const url = `${GRAPH_API_URL}/${credenciales.phoneNumberId}/messages`;
    const formattedPhone = this.formatearNumeroTelefono(phone);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'document',
      document: { link: documentUrl, filename: filename }
    };

    if (caption) {
      payload.document.caption = caption;
    }

    logger.info(`[WhatsappGraph] Enviando documento a ${formattedPhone}`);

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credenciales.accessToken}`
      },
      timeout: 30000
    });

    const wid_mensaje = response.data?.messages?.[0]?.id || null;
    return { success: true, wid_mensaje, response: response.data };
  }

  /**
   * Envía un audio
   */
  async enviarAudio(idEmpresa, phone, audioUrl) {
    const credenciales = await this.obtenerCredenciales(idEmpresa);
    const url = `${GRAPH_API_URL}/${credenciales.phoneNumberId}/messages`;
    const formattedPhone = this.formatearNumeroTelefono(phone);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'audio',
      audio: { link: audioUrl }
    };

    logger.info(`[WhatsappGraph] Enviando audio a ${formattedPhone}`);

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credenciales.accessToken}`
      },
      timeout: 30000
    });

    const wid_mensaje = response.data?.messages?.[0]?.id || null;
    return { success: true, wid_mensaje, response: response.data };
  }

  /**
   * Envía un video
   */
  async enviarVideo(idEmpresa, phone, videoUrl, caption = '') {
    const credenciales = await this.obtenerCredenciales(idEmpresa);
    const url = `${GRAPH_API_URL}/${credenciales.phoneNumberId}/messages`;
    const formattedPhone = this.formatearNumeroTelefono(phone);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'video',
      video: { link: videoUrl }
    };

    if (caption) {
      payload.video.caption = caption;
    }

    logger.info(`[WhatsappGraph] Enviando video a ${formattedPhone}`);

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credenciales.accessToken}`
      },
      timeout: 30000
    });

    const wid_mensaje = response.data?.messages?.[0]?.id || null;
    return { success: true, wid_mensaje, response: response.data };
  }

  /**
   * Envía un mensaje según el tipo detectado
   */
  async enviarMensaje(idEmpresa, phone, message, type = 'text', fileUrl = null, filename = null) {
    try {
      switch (type) {
        case 'image':
          return await this.enviarImagen(idEmpresa, phone, fileUrl, message);
        case 'document':
          return await this.enviarDocumento(idEmpresa, phone, fileUrl, filename || 'documento', message);
        case 'audio':
          return await this.enviarAudio(idEmpresa, phone, fileUrl);
        case 'video':
          return await this.enviarVideo(idEmpresa, phone, fileUrl, message);
        case 'text':
        default:
          return await this.enviarMensajeTexto(idEmpresa, phone, message);
      }
    } catch (error) {
      logger.error(`[WhatsappGraph] Error enviando mensaje tipo ${type}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Envía un mensaje de plantilla
   */
  async enviarPlantilla(idEmpresa, phone, templateName, language = 'es', components = []) {
    const credenciales = await this.obtenerCredenciales(idEmpresa);
    const url = `${GRAPH_API_URL}/${credenciales.phoneNumberId}/messages`;

    const formattedPhone = this.formatearNumeroTelefono(phone);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: language }
      }
    };

    if (components && components.length > 0) {
      payload.template.components = components;
    }

    logger.info(`[WhatsappGraph] Enviando plantilla ${templateName} a ${formattedPhone}`);

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credenciales.accessToken}`
        },
        timeout: 30000
      });

      return {
        success: true,
        response: response.data
      };
    } catch (error) {
      const metaError = error.response?.data?.error;
      if (metaError) {
        const detalle = `Meta API [${error.response.status}]: ${metaError.message || 'Sin mensaje'}` +
          (metaError.error_subcode ? ` (subcode: ${metaError.error_subcode})` : '') +
          (metaError.error_user_title ? ` - ${metaError.error_user_title}` : '') +
          (metaError.error_user_msg ? `: ${metaError.error_user_msg}` : '');
        logger.error(`[WhatsappGraph] Error enviando plantilla ${templateName} a ${formattedPhone}: ${detalle}`);
        const enrichedError = new Error(detalle);
        enrichedError.statusCode = error.response.status;
        enrichedError.metaError = metaError;
        throw enrichedError;
      }
      throw error;
    }
  }

  /**
   * Envia la plantilla enlace_lili con una URL como parametro {{1}}
   * Usa el phone_number_id de la empresa y el token de Maravia
   */
  async enviarEnlaceLili(idEmpresa, phone, enlaceUrl, language = 'es') {
    const credenciales = await this.obtenerCredenciales(idEmpresa);
    const url = `${GRAPH_API_URL}/${credenciales.phoneNumberId}/messages`;

    const formattedPhone = this.formatearNumeroTelefono(phone);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: "template",
      template: {
        name: "enlace_lili",
        language: { code: language },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: enlaceUrl }
            ]
          }
        ]
      }
    };

    logger.info(`[WhatsappGraph] Enviando plantilla enlace_lili a ${formattedPhone} con URL: ${enlaceUrl}`);

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MARAVIA_ACCESS_TOKEN}`
      },
      timeout: 30000
    });

    return {
      success: true,
      response: response.data
    };
  }

  /**
   * Formatea número de teléfono para WhatsApp Cloud API
   */
  formatearNumeroTelefono(phone) {
    let formatted = phone.replace(/[\s\-\(\)\+]/g, '');
    if (formatted.startsWith('0')) {
      formatted = formatted.substring(1);
    }
    if (formatted.length <= 9) {
      formatted = '51' + formatted;
    }
    return formatted;
  }

  /**
   * Convierte los datos de BD al formato de componentes de Meta API
   */
  convertirDatosAComponentes(plantilla) {
    const components = [];

    // Header
    if (plantilla.header_type && plantilla.header_text) {
      components.push({
        type: 'HEADER',
        format: plantilla.header_type.toUpperCase(),
        text: plantilla.header_text
      });
    }

    // Body (obligatorio)
    if (plantilla.body) {
      components.push({
        type: 'BODY',
        text: plantilla.body
      });
    }

    // Footer
    if (plantilla.footer) {
      components.push({
        type: 'FOOTER',
        text: plantilla.footer
      });
    }

    // Buttons
    if (plantilla.buttons && Array.isArray(plantilla.buttons) && plantilla.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: plantilla.buttons
      });
    }

    return components;
  }

  /**
   * Formatea los componentes para la creación de plantilla según el formato de Meta API
   */
  formatearComponentesParaCreacion(components) {
    const formatted = [];

    for (const comp of components) {
      const type = (comp.type || '').toUpperCase();

      switch (type) {
        case 'HEADER':
          const format = (comp.format || 'TEXT').toUpperCase();
          if (format === 'TEXT' && comp.text) {
            const header = { type: 'HEADER', format: 'TEXT', text: comp.text };
            if (comp.example?.header_text) {
              header.example = { header_text: comp.example.header_text };
            } else if (/\{\{\w+\}\}/.test(comp.text)) {
              const matches = comp.text.match(/\{\{(\w+)\}\}/g) || [];
              header.example = { header_text: matches.map((_, i) => `ejemplo_${i + 1}`) };
            }
            formatted.push(header);
          } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format)) {
            const headerMedia = { type: 'HEADER', format };
            if (comp.example?.header_handle) {
              headerMedia.example = { header_handle: comp.example.header_handle };
            }
            formatted.push(headerMedia);
          }
          break;

        case 'BODY':
          const body = { type: 'BODY', text: comp.text || '' };
          if (comp.example?.body_text) {
            body.example = { body_text: comp.example.body_text };
          } else {
            const matches = body.text.match(/\{\{(\d+)\}\}/g) || [];
            if (matches.length > 0) {
              body.example = { body_text: [matches.map((_, i) => `ejemplo_${i + 1}`)] };
            }
          }
          formatted.push(body);
          break;

        case 'FOOTER':
          if (comp.text) {
            formatted.push({ type: 'FOOTER', text: comp.text });
          }
          break;

        case 'BUTTONS':
          if (comp.buttons && Array.isArray(comp.buttons)) {
            const buttons = [];
            for (const btn of comp.buttons) {
              const buttonType = (btn.type || 'QUICK_REPLY').toUpperCase();
              switch (buttonType) {
                case 'QUICK_REPLY':
                  buttons.push({ type: 'QUICK_REPLY', text: btn.text || 'Botón' });
                  break;
                case 'URL':
                  const urlBtn = { type: 'URL', text: btn.text || 'Ver más', url: btn.url || '' };
                  if (urlBtn.url.includes('{{')) {
                    urlBtn.example = ['https://ejemplo.com/valor'];
                  }
                  buttons.push(urlBtn);
                  break;
                case 'PHONE_NUMBER':
                  buttons.push({ type: 'PHONE_NUMBER', text: btn.text || 'Llamar', phone_number: btn.phone_number || '' });
                  break;
                case 'COPY_CODE':
                  buttons.push({ type: 'COPY_CODE', example: btn.example || 'CODIGO123' });
                  break;
              }
            }
            if (buttons.length > 0) {
              formatted.push({ type: 'BUTTONS', buttons });
            }
          }
          break;
      }
    }

    return formatted;
  }
}

module.exports = new WhatsappGraphService();
