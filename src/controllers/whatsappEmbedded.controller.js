const whatsappEmbeddedService = require('../services/whatsapp/whatsappEmbedded.service.js');
const configuracionWhatsappRepository = require('../repositories/configuracionWhatsapp.repository.js');
const logger = require('../config/logger/loggerClient.js');

const VIVA_ID_PLATAFORMA = 4;

class WhatsappEmbeddedController {
  /**
   * Procesa el token del Embedded Signup
   * POST /whatsapp-embedded/procesar-token
   */
  async procesarToken(req, res) {
    try {
      const userId = req.user?.userId || null;
      const idEmpresa = req.user?.idEmpresa || null;
      const { access_token, event_type } = req.body;

      if (!access_token) {
        return res.status(400).json({ success: false, msg: 'access_token es requerido' });
      }
      if (!idEmpresa) {
        return res.status(400).json({ success: false, msg: 'No se pudo determinar la empresa del usuario' });
      }

      const result = await whatsappEmbeddedService.procesarToken(
        access_token,
        event_type || 'FINISH',
        VIVA_ID_PLATAFORMA,
        idEmpresa,
        userId
      );

      // Si Maravia responde exitosamente, guardar credenciales en BD local
      if (result.success && result.data) {
        try {
          await configuracionWhatsappRepository.upsertByEmpresaId(idEmpresa, {
            app_id: result.data.app_id || null,
            numero_telefono_id: result.data.phone_number_id || null,
            clave_secreta: result.data.app_secret || null,
            token_whatsapp: result.data.access_token || access_token,
            waba_id: result.data.waba_id || null,
            phone_number: result.data.phone_number || null,
            token_expiration: result.data.token_expiration || null,
            usuario_registro: userId,
            usuario_actualizacion: userId
          });
          logger.info(`[WhatsappEmbeddedController] Credenciales guardadas en BD para empresa ${idEmpresa}`);
        } catch (dbError) {
          logger.error(`[WhatsappEmbeddedController] Error guardando en BD: ${dbError.message}`);
        }
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error(`[WhatsappEmbeddedController] Error procesando token: ${error.message}`);
      return res.status(500).json({ success: false, msg: 'Error procesando token' });
    }
  }

  /**
   * Obtiene la configuración del Embedded Signup
   * GET /whatsapp-embedded/configuracion
   */
  async obtenerConfiguracion(req, res) {
    try {
      const idEmpresa = req.user?.idEmpresa || null;
      if (!idEmpresa) {
        return res.status(400).json({ success: false, msg: 'No se pudo determinar la empresa del usuario' });
      }

      const result = await whatsappEmbeddedService.obtenerConfiguracion(VIVA_ID_PLATAFORMA, idEmpresa);

      return res.status(200).json(result);
    } catch (error) {
      logger.error(`[WhatsappEmbeddedController] Error obteniendo configuración: ${error.message}`);
      return res.status(500).json({ success: false, msg: 'Error obteniendo configuración' });
    }
  }

  /**
   * Desconecta el Embedded Signup
   * POST /whatsapp-embedded/desconectar
   */
  async desconectar(req, res) {
    try {
      const userId = req.user?.userId || null;
      const idEmpresa = req.user?.idEmpresa || null;
      if (!idEmpresa) {
        return res.status(400).json({ success: false, msg: 'No se pudo determinar la empresa del usuario' });
      }

      const result = await whatsappEmbeddedService.desconectar(VIVA_ID_PLATAFORMA, idEmpresa, userId);

      return res.status(200).json(result);
    } catch (error) {
      logger.error(`[WhatsappEmbeddedController] Error desconectando: ${error.message}`);
      return res.status(500).json({ success: false, msg: 'Error desconectando' });
    }
  }

  /**
   * Verifica el estado de la conexión
   * GET /whatsapp-embedded/estado
   */
  async verificarEstado(req, res) {
    try {
      const idEmpresa = req.user?.idEmpresa || null;
      if (!idEmpresa) {
        return res.status(400).json({ success: false, msg: 'No se pudo determinar la empresa del usuario' });
      }

      const result = await whatsappEmbeddedService.verificarEstado(VIVA_ID_PLATAFORMA, idEmpresa);

      return res.status(200).json(result);
    } catch (error) {
      logger.error(`[WhatsappEmbeddedController] Error verificando estado: ${error.message}`);
      return res.status(500).json({ success: false, msg: 'Error verificando estado' });
    }
  }

  /**
   * Suscribe el WABA a webhooks
   * POST /whatsapp-embedded/suscribir-webhook
   */
  async suscribirWebhook(req, res) {
    try {
      const idEmpresa = req.user?.idEmpresa || null;
      if (!idEmpresa) {
        return res.status(400).json({ success: false, msg: 'No se pudo determinar la empresa del usuario' });
      }

      const result = await whatsappEmbeddedService.suscribirWebhook(VIVA_ID_PLATAFORMA, idEmpresa);

      return res.status(200).json(result);
    } catch (error) {
      logger.error(`[WhatsappEmbeddedController] Error suscribiendo webhook: ${error.message}`);
      return res.status(500).json({ success: false, msg: 'Error suscribiendo webhook' });
    }
  }

  /**
   * Suscribe webhooks para Coexistence
   * POST /whatsapp-embedded/suscribir-coexistence
   */
  async suscribirWebhooksCoexistence(req, res) {
    try {
      const idEmpresa = req.user?.idEmpresa || null;
      if (!idEmpresa) {
        return res.status(400).json({ success: false, msg: 'No se pudo determinar la empresa del usuario' });
      }

      const result = await whatsappEmbeddedService.suscribirWebhooksCoexistence(VIVA_ID_PLATAFORMA, idEmpresa);

      return res.status(200).json(result);
    } catch (error) {
      logger.error(`[WhatsappEmbeddedController] Error suscribiendo webhooks coexistence: ${error.message}`);
      return res.status(500).json({ success: false, msg: 'Error suscribiendo webhooks coexistence' });
    }
  }

  /**
   * Sincroniza datos SMB
   * POST /whatsapp-embedded/sincronizar-smb
   */
  async sincronizarSMBData(req, res) {
    try {
      const idEmpresa = req.user?.idEmpresa || null;
      const { sync_type } = req.body;
      if (!idEmpresa) {
        return res.status(400).json({ success: false, msg: 'No se pudo determinar la empresa del usuario' });
      }

      const result = await whatsappEmbeddedService.sincronizarSMBData(
        VIVA_ID_PLATAFORMA,
        idEmpresa,
        sync_type || 'all'
      );

      return res.status(200).json(result);
    } catch (error) {
      logger.error(`[WhatsappEmbeddedController] Error sincronizando SMB: ${error.message}`);
      return res.status(500).json({ success: false, msg: 'Error sincronizando SMB' });
    }
  }
}

module.exports = new WhatsappEmbeddedController();
