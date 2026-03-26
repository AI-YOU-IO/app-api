const { pool } = require("../../config/dbConnection.js");
const WhatsappGraphService = require("../../services/whatsapp/whatsappGraph.service.js");
const websocketNotifier = require("../../services/websocketNotifier.service.js");
const s3Service = require("../../services/s3.service.js");
const logger = require('../../config/logger/loggerClient.js');

class ContactoController {

  async getMensajes(req, res) {
    try {
      const { id } = req.params;

      const [rows] = await pool.execute(
        `SELECT m.id, m.id_chat, m.direccion, m.tipo_mensaje, m.contenido, m.contenido_archivo, m.fecha_hora, m.estado_registro
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
      const { id } = req.params; // id del chat

      await pool.execute(
        `UPDATE mensaje SET leido = true WHERE id_chat = ? AND leido = false AND estado_registro = 1`,
        [id]
      );

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

      const [chatRows] = await pool.execute(
        `SELECT c.id, c.id_empresa, c.id_persona, p.celular
         FROM chat c
         LEFT JOIN persona p ON c.id_persona = p.id
         WHERE c.id = ? AND c.estado_registro = 1`,
        [id]
      );

      if (chatRows.length === 0) {
        return res.status(404).json({ msg: "Chat no encontrado" });
      }

      const chat = chatRows[0];

      if (!chat.celular) {
        return res.status(400).json({ msg: "El contacto no tiene numero de celular" });
      }

      let widMensaje = null;
      try {
        const envio = await WhatsappGraphService.enviarMensajeTexto(chat.id_empresa, chat.celular, contenido);
        widMensaje = envio.wid_mensaje;
        logger.info(`[contacto.controller.js] Mensaje enviado por WhatsApp a ${chat.celular}, wid: ${widMensaje}`);
      } catch (whatsappError) {
        logger.error(`[contacto.controller.js] Error enviando WhatsApp a ${chat.celular}: ${whatsappError.message}`);
        return res.status(500).json({ msg: "Error al enviar mensaje por WhatsApp" });
      }

      const fechaHora = new Date();
      const [result] = await pool.execute(
        `INSERT INTO mensaje (id_chat, direccion, tipo_mensaje, wid_mensaje, contenido, fecha_hora, estado_registro, usuario_registro)
         VALUES (?, 'out', 'texto', ?, ?, ?, 1, ?)`,
        [id, widMensaje, contenido, fechaHora, userId || null]
      );

      websocketNotifier.notificarMensajeSaliente(chat.id, {
        id_contacto: chat.id,
        contenido,
        direccion: 'out',
        wid_mensaje: widMensaje,
        tipo: 'texto',
        fecha_hora: fechaHora.toISOString()
      });

      return res.status(201).json({ data: { id: result.insertId, contenido, direccion: 'out', wid_mensaje: widMensaje } });
    } catch (error) {
      logger.error(`[contacto.controller.js] Error al enviar mensaje: ${error.message}`);
      return res.status(500).json({ msg: "Error al enviar mensaje" });
    }
  }

  async sendArchivo(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user || {};
      const caption = req.body.caption || '';

      if (!req.file) {
        return res.status(400).json({ msg: "No se envio ningun archivo" });
      }

      const [chatRows] = await pool.execute(
        `SELECT c.id, c.id_empresa, c.id_persona, p.celular
         FROM chat c
         LEFT JOIN persona p ON c.id_persona = p.id
         WHERE c.id = ? AND c.estado_registro = 1`,
        [id]
      );

      if (chatRows.length === 0) {
        return res.status(404).json({ msg: "Chat no encontrado" });
      }

      const chat = chatRows[0];

      if (!chat.celular) {
        return res.status(400).json({ msg: "El contacto no tiene numero de celular" });
      }

      const fileUrl = await s3Service.uploadFile(req.file, 'chat', chat.id_empresa);
      logger.info(`[contacto.controller.js] Archivo subido a S3: ${fileUrl}`);

      const mime = req.file.mimetype || '';
      let tipoMensaje = 'document';
      if (mime.startsWith('image/')) tipoMensaje = 'image';
      else if (mime.startsWith('video/')) tipoMensaje = 'video';
      else if (mime.startsWith('audio/')) tipoMensaje = 'audio';

      let widMensaje = null;
      try {
        const envio = await WhatsappGraphService.enviarMensaje(
          chat.id_empresa, chat.celular, caption, tipoMensaje, fileUrl, req.file.originalname
        );
        widMensaje = envio.wid_mensaje;
        logger.info(`[contacto.controller.js] Archivo enviado por WhatsApp a ${chat.celular}, tipo: ${tipoMensaje}, wid: ${widMensaje}`);
      } catch (whatsappError) {
        logger.error(`[contacto.controller.js] Error enviando archivo por WhatsApp: ${whatsappError.message}`);
        return res.status(500).json({ msg: "Error al enviar archivo por WhatsApp" });
      }

      const fechaHora = new Date();
      const [result] = await pool.execute(
        `INSERT INTO mensaje (id_chat, direccion, tipo_mensaje, wid_mensaje, contenido, contenido_archivo, fecha_hora, estado_registro, usuario_registro)
         VALUES (?, 'out', ?, ?, ?, ?, ?, 1, ?)`,
        [id, tipoMensaje, widMensaje, caption || null, fileUrl, fechaHora, userId || null]
      );

      websocketNotifier.notificarMensajeSaliente(chat.id, {
        id_contacto: chat.id,
        contenido: caption,
        contenido_archivo: fileUrl,
        direccion: 'out',
        wid_mensaje: widMensaje,
        tipo: tipoMensaje,
        fecha_hora: fechaHora.toISOString()
      });

      return res.status(201).json({
        data: {
          id: result.insertId,
          contenido: caption,
          contenido_archivo: fileUrl,
          tipo_mensaje: tipoMensaje,
          direccion: 'out',
          wid_mensaje: widMensaje
        }
      });
    } catch (error) {
      logger.error(`[contacto.controller.js] Error al enviar archivo: ${error.message}`);
      return res.status(500).json({ msg: "Error al enviar archivo" });
    }
  }
}

module.exports = new ContactoController();
