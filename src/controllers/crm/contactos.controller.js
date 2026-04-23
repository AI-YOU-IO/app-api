const { pool } = require("../../config/dbConnection.js");
const logger = require('../../config/logger/loggerClient.js');

const LIMIT = 20;

class ContactosController {

  async getContactos(req, res) {
    try {
      const { userId, rolId, idEmpresa } = req.user || {};
      const offset = parseInt(req.params.offset) || 0;
      const {
        id_estado,
        id_tipificacion,
        id_tipificacion_asesor,
        link_enviado,
        derivado,
        lista_negra,
        respondieron
      } = req.query;

      let query = `
        SELECT c.id, c.id_persona, c.fecha_registro, c.estado_registro, c.bot_activo,
               c.id_tipificacion_bot, c.id_tipificacion_asesor,
               p.celular, p.nombre_completo, p.id_estado, p.id_tipificacion, p.id_usuario, p.id_empresa,
               p.lista_negra,
               e.nombre as estado_nombre, e.color as estado_color,
               tb.nombre as tipificacion_bot_nombre,
               ta.nombre as tipificacion_asesor_nombre,
               EXISTS(
                 SELECT 1 FROM link_pago lp
                 WHERE lp.id_persona = p.id AND lp.id_empresa = p.id_empresa
               ) as se_envio_link,
               EXISTS(
                 SELECT 1 FROM mensaje m
                 WHERE m.id_chat = c.id AND m.direccion = 'in' AND m.estado_registro = 1
               ) as cliente_respondio,
               (SELECT contenido FROM mensaje WHERE id_chat = c.id AND estado_registro = 1 ORDER BY id DESC LIMIT 1) as ultimo_mensaje,
               (SELECT fecha_hora FROM mensaje WHERE id_chat = c.id AND estado_registro = 1 ORDER BY id DESC LIMIT 1) as fecha_ultimo_mensaje,
               (SELECT COUNT(*) FROM mensaje WHERE id_chat = c.id AND estado_registro = 1) as total_mensajes,
               (SELECT COUNT(*) FROM mensaje WHERE id_chat = c.id AND estado_registro = 1 AND leido = false) as mensajes_no_leidos
        FROM chat c
        LEFT JOIN persona p ON p.id = c.id_persona
        LEFT JOIN estado e ON e.id = p.id_estado
        LEFT JOIN tipificacion_whasap tb ON tb.id = c.id_tipificacion_bot
        LEFT JOIN tipificacion_whasap ta ON ta.id = c.id_tipificacion_asesor
        WHERE c.estado_registro = 1`;

      const params = [];

      if (idEmpresa) {
        query += ' AND p.id_empresa = ?';
        params.push(idEmpresa);
      }

      if (rolId && rolId >= 3 && userId) {
        query += ' AND p.id_usuario = ?';
        params.push(userId);
      }

      if (id_estado) {
        query += ' AND p.id_estado = ?';
        params.push(id_estado);
      }

      // Tipificación Bot → filtra por c.id_tipificacion_bot (incluye descendientes)
      if (id_tipificacion) {
        query += ` AND c.id_tipificacion_bot IN (
          WITH RECURSIVE arbol AS (
            SELECT id FROM tipificacion_whasap WHERE id = ?
            UNION ALL
            SELECT t.id FROM tipificacion_whasap t
            INNER JOIN arbol a ON t.id_padre = a.id
          ) SELECT id FROM arbol
        )`;
        params.push(id_tipificacion);
      }

      // Tipificación Asesor → filtra por c.id_tipificacion_asesor (incluye descendientes)
      if (id_tipificacion_asesor) {
        query += ` AND c.id_tipificacion_asesor IN (
          WITH RECURSIVE arbol AS (
            SELECT id FROM tipificacion_whasap WHERE id = ?
            UNION ALL
            SELECT t.id FROM tipificacion_whasap t
            INNER JOIN arbol a ON t.id_padre = a.id
          ) SELECT id FROM arbol
        )`;
        params.push(id_tipificacion_asesor);
      }

      // Nuevos filtros (todos son boolean: "1"/"true" para activar)
      const isTrue = (v) => v === '1' || v === 'true' || v === true;

      if (isTrue(link_enviado)) {
        query += ` AND EXISTS(
          SELECT 1 FROM link_pago lp
          WHERE lp.id_persona = p.id AND lp.id_empresa = p.id_empresa
        )`;
      }

      if (isTrue(derivado)) {
        query += ' AND c.bot_activo = 0';
      }

      if (isTrue(lista_negra)) {
        query += ' AND p.lista_negra = true';
      }

      if (isTrue(respondieron)) {
        query += ` AND EXISTS(
          SELECT 1 FROM mensaje m
          WHERE m.id_chat = c.id AND m.direccion = 'in' AND m.estado_registro = 1
        )`;
      }

      // Count total
      const countQuery = query.replace(/SELECT[\s\S]*?FROM chat c/, 'SELECT COUNT(*) as total FROM chat c');
      const [countResult] = await pool.execute(countQuery, params);
      const total = countResult[0]?.total || 0;

      query += ' ORDER BY fecha_ultimo_mensaje DESC NULLS LAST LIMIT ? OFFSET ?';
      params.push(LIMIT, offset);

      const [rows] = await pool.query(query, params);

      return res.status(200).json({ data: rows, total });
    } catch (error) {
      logger.error(`[contactos.controller.js] Error al obtener contactos: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener contactos" });
    }
  }

  async searchContactos(req, res) {
    try {
      const { userId, rolId, idEmpresa } = req.user || {};
      const { query: searchQuery } = req.params;
      const offset = parseInt(req.query.offset) || 0;
      const {
        id_estado,
        id_tipificacion,
        id_tipificacion_asesor,
        link_enviado,
        derivado,
        lista_negra,
        respondieron
      } = req.query;

      const searchTerm = `%${searchQuery}%`;

      let query = `
        SELECT c.id, c.id_persona, c.fecha_registro, c.estado_registro, c.bot_activo,
               c.id_tipificacion_bot, c.id_tipificacion_asesor,
               p.celular, p.nombre_completo, p.id_estado, p.id_tipificacion, p.id_usuario, p.id_empresa,
               p.lista_negra,
               e.nombre as estado_nombre, e.color as estado_color,
               tb.nombre as tipificacion_bot_nombre,
               ta.nombre as tipificacion_asesor_nombre,
               EXISTS(
                 SELECT 1 FROM link_pago lp
                 WHERE lp.id_persona = p.id AND lp.id_empresa = p.id_empresa
               ) as se_envio_link,
               EXISTS(
                 SELECT 1 FROM mensaje m
                 WHERE m.id_chat = c.id AND m.direccion = 'in' AND m.estado_registro = 1
               ) as cliente_respondio,
               (SELECT contenido FROM mensaje WHERE id_chat = c.id AND estado_registro = 1 ORDER BY id DESC LIMIT 1) as ultimo_mensaje,
               (SELECT fecha_hora FROM mensaje WHERE id_chat = c.id AND estado_registro = 1 ORDER BY id DESC LIMIT 1) as fecha_ultimo_mensaje,
               (SELECT COUNT(*) FROM mensaje WHERE id_chat = c.id AND estado_registro = 1 AND leido = false) as mensajes_no_leidos
        FROM chat c
        LEFT JOIN persona p ON p.id = c.id_persona
        LEFT JOIN estado e ON e.id = p.id_estado
        LEFT JOIN tipificacion_whasap tb ON tb.id = c.id_tipificacion_bot
        LEFT JOIN tipificacion_whasap ta ON ta.id = c.id_tipificacion_asesor
        WHERE c.estado_registro = 1
        AND (p.celular LIKE ? OR p.nombre_completo LIKE ?)`;

      const params = [searchTerm, searchTerm];

      if (idEmpresa) {
        query += ' AND p.id_empresa = ?';
        params.push(idEmpresa);
      }

      if (rolId && rolId >= 3 && userId) {
        query += ' AND p.id_usuario = ?';
        params.push(userId);
      }

      if (id_estado) {
        query += ' AND p.id_estado = ?';
        params.push(id_estado);
      }

      if (id_tipificacion) {
        query += ` AND c.id_tipificacion_bot IN (
          WITH RECURSIVE arbol AS (
            SELECT id FROM tipificacion_whasap WHERE id = ?
            UNION ALL
            SELECT t.id FROM tipificacion_whasap t
            INNER JOIN arbol a ON t.id_padre = a.id
          ) SELECT id FROM arbol
        )`;
        params.push(id_tipificacion);
      }

      if (id_tipificacion_asesor) {
        query += ` AND c.id_tipificacion_asesor IN (
          WITH RECURSIVE arbol AS (
            SELECT id FROM tipificacion_whasap WHERE id = ?
            UNION ALL
            SELECT t.id FROM tipificacion_whasap t
            INNER JOIN arbol a ON t.id_padre = a.id
          ) SELECT id FROM arbol
        )`;
        params.push(id_tipificacion_asesor);
      }

      const isTrue = (v) => v === '1' || v === 'true' || v === true;

      if (isTrue(link_enviado)) {
        query += ` AND EXISTS(
          SELECT 1 FROM link_pago lp
          WHERE lp.id_persona = p.id AND lp.id_empresa = p.id_empresa
        )`;
      }

      if (isTrue(derivado)) {
        query += ' AND c.bot_activo = 0';
      }

      if (isTrue(lista_negra)) {
        query += ' AND p.lista_negra = true';
      }

      if (isTrue(respondieron)) {
        query += ` AND EXISTS(
          SELECT 1 FROM mensaje m
          WHERE m.id_chat = c.id AND m.direccion = 'in' AND m.estado_registro = 1
        )`;
      }

      const countQuery = query.replace(/SELECT[\s\S]*?FROM chat c/, 'SELECT COUNT(*) as total FROM chat c');
      const [countResult] = await pool.execute(countQuery, params);
      const total = countResult[0]?.total || 0;

      query += ' ORDER BY fecha_ultimo_mensaje DESC NULLS LAST LIMIT ? OFFSET ?';
      params.push(LIMIT, offset);

      const [rows] = await pool.query(query, params);

      return res.status(200).json({ data: rows, total });
    } catch (error) {
      logger.error(`[contactos.controller.js] Error al buscar contactos: ${error.message}`);
      return res.status(500).json({ msg: "Error al buscar contactos" });
    }
  }

  async getUnreadCount(req, res) {
    try {
      const { userId, rolId, idEmpresa } = req.user || {};

      let query = `
        SELECT COUNT(DISTINCT c.id) as "unreadCount"
        FROM chat c
        JOIN persona p ON p.id = c.id_persona
        JOIN mensaje m ON m.id_chat = c.id AND m.estado_registro = 1 AND m.leido = false
        WHERE c.estado_registro = 1`;

      const params = [];

      if (idEmpresa) {
        query += ' AND p.id_empresa = ?';
        params.push(idEmpresa);
      }

      if (rolId && rolId >= 3 && userId) {
        query += ' AND p.id_usuario = ?';
        params.push(userId);
      }

      const [rows] = await pool.execute(query, params);
      const unreadCount = rows[0]?.unreadCount || 0;

      return res.status(200).json({ data: { unreadCount } });
    } catch (error) {
      logger.error(`[contactos.controller.js] Error al obtener conteo de no leidos: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener conteo de no leidos" });
    }
  }

  async markAllRead(req, res) {
    try {
      const { userId, rolId, idEmpresa } = req.user || {};

      let query = `
        UPDATE mensaje SET leido = true
        WHERE leido = false AND estado_registro = 1
          AND id_chat IN (
            SELECT c.id FROM chat c
            JOIN persona p ON p.id = c.id_persona
            WHERE c.estado_registro = 1`;

      const params = [];

      if (idEmpresa) {
        query += ' AND p.id_empresa = ?';
        params.push(idEmpresa);
      }

      if (rolId && rolId >= 3 && userId) {
        query += ' AND p.id_usuario = ?';
        params.push(userId);
      }

      query += ')';

      await pool.execute(query, params);

      return res.status(200).json({ msg: "Todos los mensajes marcados como leídos" });
    } catch (error) {
      logger.error(`[contactos.controller.js] Error al marcar todos como leídos: ${error.message}`);
      return res.status(500).json({ msg: "Error al marcar todos como leídos" });
    }
  }
}

module.exports = new ContactosController();
