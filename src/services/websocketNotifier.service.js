const logger = require('../config/logger/loggerClient');

const WS_SERVER_URL = process.env.WS_SERVER_URL || 'http://localhost:8080';

/**
 * Notifica al servidor WebSocket sobre mensajes entrantes/salientes
 * para que los clientes suscritos reciban actualizaciones en tiempo real.
 */
class WebsocketNotifierService {

  /**
   * Notifica un mensaje entrante al WebSocket server
   * @param {number|string} idContacto - ID de la persona/contacto
   * @param {object} mensaje - Datos del mensaje
   */
  async notificarMensajeEntrante(idContacto, mensaje) {
    try {
      const response = await fetch(`${WS_SERVER_URL}/webhook/mensaje-entrante`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_contacto: idContacto,
          mensaje
        })
      });

      if (!response.ok) {
        logger.warn(`[websocketNotifier] Error notificando mensaje entrante: ${response.status}`);
      }
    } catch (error) {
      // No bloquear el flujo principal si el WS server no está disponible
      logger.warn(`[websocketNotifier] WS server no disponible: ${error.message}`);
    }
  }

  /**
   * Notifica un mensaje saliente al WebSocket server
   * @param {number|string} idContacto - ID de la persona/contacto
   * @param {object} mensaje - Datos del mensaje
   */
  async notificarMensajeSaliente(idContacto, mensaje) {
    try {
      const response = await fetch(`${WS_SERVER_URL}/webhook/mensaje-saliente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_contacto: idContacto,
          mensaje
        })
      });

      if (!response.ok) {
        logger.warn(`[websocketNotifier] Error notificando mensaje saliente: ${response.status}`);
      }
    } catch (error) {
      logger.warn(`[websocketNotifier] WS server no disponible: ${error.message}`);
    }
  }
}

module.exports = new WebsocketNotifierService();
