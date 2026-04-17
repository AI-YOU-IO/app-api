/**
 * Servicio para WhatsApp Embedded de Maravia
 * Endpoints: ws_whatsapp_embedded.php
 */

const maraviaApi = require('../maravia/maraviaApi.service.js');
const logger = require('../../config/logger/loggerClient.js');

class WhatsappEmbeddedService {
  /**
   * Procesa el token del Embedded Signup
   */
  async procesarToken(accessToken, eventType = 'FINISH', idPlataforma = 2, idEmpresa, usuarioId = null) {
    logger.info(`[WhatsappEmbedded] Procesando token para empresa ${idEmpresa}`);

    return maraviaApi.request('ws_whatsapp_embedded.php', {
      codOpe: 'PROCESAR_TOKEN_EMBEDDED',
      access_token: accessToken,
      event: eventType,
      id_plataforma: idPlataforma,
      id_empresa_externo: idEmpresa,
      usuario_id: usuarioId
    });
  }

  /**
   * Obtiene la configuración del Embedded Signup
   */
  async obtenerConfiguracion(idPlataforma = 1, idEmpresa) {
    logger.info(`[WhatsappEmbedded] Obteniendo configuración para empresa ${idEmpresa}`);

    return maraviaApi.request('ws_whatsapp_embedded.php', {
      codOpe: 'OBTENER_CONFIGURACION_EMBEDDED',
      id_plataforma: idPlataforma,
      id_empresa_externo: idEmpresa
    });
  }

  /**
   * Desconecta el Embedded Signup
   */
  async desconectar(idPlataforma = 1, idEmpresa, usuarioId) {
    logger.info(`[WhatsappEmbedded] Desconectando para empresa ${idEmpresa}`);

    return maraviaApi.request('ws_whatsapp_embedded.php', {
      codOpe: 'DESCONECTAR_EMBEDDED',
      id_plataforma: idPlataforma,
      id_empresa_externo: idEmpresa,
      usuario_id: usuarioId
    });
  }

  /**
   * Verifica el estado de la conexión
   */
  async verificarEstado(idPlataforma = 1, idEmpresa) {
    logger.info(`[WhatsappEmbedded] Verificando estado para empresa ${idEmpresa}`);

    return maraviaApi.request('ws_whatsapp_embedded.php', {
      codOpe: 'VERIFICAR_ESTADO_EMBEDDED',
      id_plataforma: idPlataforma,
      id_empresa_externo: idEmpresa
    });
  }

  /**
   * Suscribe el WABA a webhooks
   */
  async suscribirWebhook(idPlataforma = 1, idEmpresa) {
    logger.info(`[WhatsappEmbedded] Suscribiendo webhook para empresa ${idEmpresa}`);

    return maraviaApi.request('ws_whatsapp_embedded.php', {
      codOpe: 'SUSCRIBIR_WEBHOOK',
      id_plataforma: idPlataforma,
      id_empresa_externo: idEmpresa
    });
  }

  /**
   * Suscribe webhooks para Coexistence
   */
  async suscribirWebhooksCoexistence(idPlataforma = 1, idEmpresa) {
    logger.info(`[WhatsappEmbedded] Suscribiendo webhooks Coexistence para empresa ${idEmpresa}`);

    return maraviaApi.request('ws_whatsapp_embedded.php', {
      codOpe: 'SUSCRIBIR_WEBHOOKS_COEXISTENCE',
      id_plataforma: idPlataforma,
      id_empresa_externo: idEmpresa
    });
  }

  /**
   * Sincroniza datos SMB (contactos e historial)
   */
  async sincronizarSMBData(idPlataforma = 1, idEmpresa, syncType = 'all') {
    logger.info(`[WhatsappEmbedded] Sincronizando SMB data (${syncType}) para empresa ${idEmpresa}`);

    return maraviaApi.request('ws_whatsapp_embedded.php', {
      codOpe: 'SINCRONIZAR_SMB_DATA',
      id_plataforma: idPlataforma,
      id_empresa_externo: idEmpresa,
      sync_type: syncType
    });
  }
}

module.exports = new WhatsappEmbeddedService();
