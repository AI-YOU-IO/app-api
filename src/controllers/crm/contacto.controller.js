const { pool } = require("../../config/dbConnection.js");
const TblMensajeVistoUsuarioModel = require("../../models/tblMensajeVistoUsuario.model.js");
const logger = require('../../config/logger/loggerClient.js');

class ContactoController {

  async getMensajes(req, res) {
    try {
      const { id } = req.params;

      const [rows] = await pool.execute(
        `SELECT m.id, m.id_chat, m.direccion, m.tipo_mensaje, m.contenido, m.fecha_hora, m.estado_registro
         FROM mensaje m
         WHERE m.id_chat = ? AND m.estado_registro = 1
         ORDER BY m.id ASC`,
        [id]
      );

      return res.status(200).json({ data: rows });
    } catch (error) {
      logger.error(`[contacto.controller.js] Error al obtener mensajes: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener mensajes" });
    }
  }

  async markRead(req, res) {
    try {
      const { id } = req.params;
      const { idMensaje } = req.body;
      const { userId } = req.user || {};

      if (!userId || !idMensaje) {
        return res.status(400).json({ msg: "userId e idMensaje son requeridos" });
      }

      const mensajeVistoModel = new TblMensajeVistoUsuarioModel();
      await mensajeVistoModel.saveLastSeenMessage(userId, id, idMensaje);

      return res.status(200).json({ msg: "Mensajes marcados como leídos" });
    } catch (error) {
      logger.error(`[contacto.controller.js] Error al marcar como leído: ${error.message}`);
      return res.status(500).json({ msg: "Error al marcar como leído" });
    }
  }

  async toggleBot(req, res) {
    try {
      const { id } = req.params;

      const [rows] = await pool.execute(
        `SELECT bot_activo FROM chat WHERE id = ?`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ msg: "Chat no encontrado" });
      }

      const newBotActivo = rows[0].bot_activo === 1 ? 0 : 1;

      await pool.execute(
        `UPDATE chat SET bot_activo = ? WHERE id = ?`,
        [newBotActivo, id]
      );

      return res.status(200).json({ data: { bot_activo: newBotActivo } });
    } catch (error) {
      logger.error(`[contacto.controller.js] Error al toggle bot: ${error.message}`);
      return res.status(500).json({ msg: "Error al cambiar estado del bot" });
    }
  }

  async sendMensaje(req, res) {
    try {
      const { id } = req.params;
      const { contenido } = req.body;
      const { userId } = req.user || {};

      if (!contenido) {
        return res.status(400).json({ msg: "El contenido del mensaje es requerido" });
      }

      const [result] = await pool.execute(
        `INSERT INTO mensaje (id_chat, direccion, tipo_mensaje, contenido, fecha_hora, estado_registro, usuario_registro)
         VALUES (?, 'out', 'text', ?, CURRENT_TIMESTAMP, 1, ?)`,
        [id, contenido, userId || 'system']
      );

      return res.status(201).json({ data: { id: result.insertId, contenido, direccion: 'out' } });
    } catch (error) {
      logger.error(`[contacto.controller.js] Error al enviar mensaje: ${error.message}`);
      return res.status(500).json({ msg: "Error al enviar mensaje" });
    }
  }
}

module.exports = new ContactoController();
