/**
 * Controlador n8n para recuperación de cobranzas
 *
 * Endpoints:
 * - POST /n8n/recuperacion/marcar-visto-masivo - Busca mensajes con URL de cobranzas
 *   en los últimos 5 mensajes por chat de una empresa y los registra en bulk en mensaje_visto
 * - GET  /n8n/recuperacion/candidatos - Lista candidatos pendientes de envío agrupados por empresa
 */

const { pool } = require('../../config/dbConnection.js');
const MensajeVistoModel = require('../../models/mensajeVisto.model.js');
const MensajeModel = require('../../models/mensaje.model.js');
const PagoService = require('../../services/pago/pago.service.js');
const WhatsappGraphService = require('../../services/whatsapp/whatsappGraph.service.js');
const logger = require('../../config/logger/loggerClient.js');

const MENSAJE_RECUPERACION = (nombre, enlace) =>
  `Hola ${nombre || ''}, notamos que aún tienes un pago pendiente. Te compartimos un nuevo enlace para que puedas realizarlo de forma rápida y segura:\n\n${enlace}\n\nSi ya realizaste el pago, por favor ignora este mensaje. ¡Estamos para ayudarte!`;

const mensajeVistoModel = new MensajeVistoModel();

class N8nRecuperacionController {

  /**
   * POST /n8n/recuperacion/marcar-visto-masivo
   *
   * 1. Obtiene de una sola query los mensajes candidatos (últimos 5 por chat,
   *    con URL de cobranzas, que no estén ya en mensaje_visto).
   * 2. Hace un bulk insert de todos los candidatos.
   *
   * Body:
   * - id_empresa (required): ID de la empresa a procesar
   */
  async marcarVistoMasivo(req, res) {
    try {
      const { id_empresa } = req.body;

      if (!id_empresa) {
        return res.status(400).json({ success: false, error: 'id_empresa es requerido' });
      }

      const candidatos = await mensajeVistoModel.getCandidatosNuevos(id_empresa);

      if (candidatos.length === 0) {
        logger.info(`[n8nRecuperacion] marcar-visto-masivo empresa ${id_empresa}: sin mensajes nuevos`);
        return res.json({
          success: true,
          id_empresa,
          total_candidatos: 0,
          total_insertados: 0
        });
      }

      const registros = candidatos.map(msg => ({
        id_mensaje: msg.id_mensaje,
        id_usuario: msg.id_usuario,
        id_contacto: msg.id_chat,
        tipo_recuperacion: null,
        fecha_visto: msg.fecha_hora
      }));

      const totalInsertados = await mensajeVistoModel.bulkCreate(registros);

      logger.info(`[n8nRecuperacion] marcar-visto-masivo empresa ${id_empresa}: ${candidatos.length} candidatos, ${totalInsertados} insertados`);

      return res.json({
        success: true,
        id_empresa,
        total_candidatos: candidatos.length,
        total_insertados: totalInsertados,
        mensajes: candidatos.map(m => ({
          id_mensaje: m.id_mensaje,
          id_chat: m.id_chat,
          contenido: m.contenido
        }))
      });

    } catch (error) {
      logger.error(`[n8nRecuperacion] Error marcar-visto-masivo: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /n8n/recuperacion/candidatos
   *
   * Lista los registros de mensaje_visto pendientes de envío (mensaje_enviado = false),
   * agrupados por empresa. Útil para que n8n itere por empresa y envíe los mensajes.
   *
   * Query params:
   * - id_empresa (optional): filtrar por empresa
   * - limit (optional, default 100): máximo de candidatos por empresa
   */
  async getCandidatosRecuperacion(req, res) {
    try {
      const { id_empresa, limit = 100 } = req.query;
      const limitNum = parseInt(limit);

      let query = `
        SELECT
          mv.id as id_mensaje_visto,
          mv.fecha_visto,
          m.id_chat,
          m.id as id_mensaje,
          m.contenido as contenido_ultimo_mensaje,
          m.fecha_hora as fecha_ultimo_mensaje,
          c.id_persona,
          p.id_empresa,
          e.nombre_comercial as nombre_empresa,
          p.celular,
          p.nombre_completo,
          bnd.json_adicional,
          ROUND((EXTRACT(EPOCH FROM (NOW() - mv.fecha_visto)) / 3600)::numeric, 2) as horas_desde_visto
        FROM mensaje_visto mv
        INNER JOIN mensaje m ON m.id = mv.id_mensaje
        INNER JOIN chat c ON c.id = m.id_chat
        INNER JOIN persona p ON p.id = c.id_persona
        INNER JOIN empresa e ON e.id = p.id_empresa
        LEFT JOIN base_numero_detalle bnd ON bnd.id = p.id_ref_base_num_detalle
        WHERE mv.estado_registro = 1
          AND mv.mensaje_enviado = false
          AND EXTRACT(EPOCH FROM (NOW() - mv.fecha_visto)) / 3600 >= 1
          AND p.celular IS NOT NULL
          AND p.celular != ''
          AND p.estado_registro = 1
          AND c.estado_registro = 1
          AND e.estado_registro = 1
          AND bnd.json_adicional IS NOT NULL
          AND bnd.json_adicional::text LIKE '%grupo_familiar%'
      `;

      const params = [];

      if (id_empresa) {
        query += ` AND p.id_empresa = ?`;
        params.push(parseInt(id_empresa));
      }

      query += ` ORDER BY p.id_empresa ASC, mv.fecha_visto ASC`;

      const [candidatosRaw] = await pool.execute(query, params);

      // Agrupar por empresa con límite por empresa
      const empresasMap = new Map();

      candidatosRaw.forEach(candidato => {
        const empresaId = candidato.id_empresa;

        if (!empresasMap.has(empresaId)) {
          empresasMap.set(empresaId, {
            id_empresa: empresaId,
            nombre_empresa: candidato.nombre_empresa,
            total_pendientes: 0,
            candidatos: []
          });
        }

        const empresa = empresasMap.get(empresaId);
        empresa.total_pendientes++;

        // Extraer grupo_familiar del json_adicional
        let grupoFamiliar = null;
        if (candidato.json_adicional) {
          try {
            const jsonData = typeof candidato.json_adicional === 'string'
              ? JSON.parse(candidato.json_adicional)
              : candidato.json_adicional;
            grupoFamiliar = jsonData.grupo_familiar || null;
          } catch (e) { /* json inválido, se ignora */ }
        }

        if (empresa.candidatos.length < limitNum) {
          empresa.candidatos.push({
            id_mensaje_visto: candidato.id_mensaje_visto,
            fecha_visto: candidato.fecha_visto,
            id_chat: candidato.id_chat,
            id_mensaje: candidato.id_mensaje,
            id_persona: candidato.id_persona,
            celular: candidato.celular,
            nombre_completo: candidato.nombre_completo,
            grupo_familiar: grupoFamiliar,
            contenido_ultimo_mensaje: candidato.contenido_ultimo_mensaje,
            fecha_ultimo_mensaje: candidato.fecha_ultimo_mensaje,
            horas_desde_visto: candidato.horas_desde_visto
          });
        }
      });

      const empresas = Array.from(empresasMap.values());
      const totalEmpresas = empresas.length;
      const totalPendientes = empresas.reduce((sum, e) => sum + e.total_pendientes, 0);
      const totalEnRespuesta = empresas.reduce((sum, e) => sum + e.candidatos.length, 0);

      logger.info(`[n8nRecuperacion] getCandidatosRecuperacion: ${totalPendientes} pendientes en ${totalEmpresas} empresas`);

      return res.json({
        success: true,
        total_empresas: totalEmpresas,
        total_pendientes: totalPendientes,
        total_en_respuesta: totalEnRespuesta,
        filtros: {
          id_empresa: id_empresa ? parseInt(id_empresa) : null,
          limit_por_empresa: limitNum
        },
        empresas
      });

    } catch (error) {
      logger.error(`[n8nRecuperacion] Error getCandidatosRecuperacion: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /n8n/recuperacion/enviar-recuperacion
   *
   * Envío individual: recibe un id_mensaje_visto (obtenido del endpoint /candidatos),
   * genera un nuevo link de pago, envía el WhatsApp, guarda el mensaje y marca como enviado.
   *
   * Body:
   * - id_mensaje_visto (required): ID del registro en mensaje_visto
   */
  async enviarRecuperacion(req, res) {
    const { id_mensaje_visto } = req.body;

    if (!id_mensaje_visto) {
      return res.json({ success: false, enviado: false, error: 'id_mensaje_visto es requerido' });
    }

    try {
      // Buscar el candidato con todos los datos necesarios
      const [rows] = await pool.execute(`
        SELECT
          mv.id as id_mensaje_visto,
          mv.mensaje_enviado,
          m.id_chat,
          c.id_persona,
          p.id_empresa,
          p.celular,
          p.nombre_completo,
          bnd.json_adicional
        FROM mensaje_visto mv
        INNER JOIN mensaje m ON m.id = mv.id_mensaje
        INNER JOIN chat c ON c.id = m.id_chat
        INNER JOIN persona p ON p.id = c.id_persona
        LEFT JOIN base_numero_detalle bnd ON bnd.id = p.id_ref_base_num_detalle
        WHERE mv.id = ?
          AND mv.estado_registro = 1
      `, [id_mensaje_visto]);

      if (rows.length === 0) {
        return res.json({ success: false, enviado: false, id_mensaje_visto, error: 'registro no encontrado' });
      }

      const candidato = rows[0];

      if (candidato.mensaje_enviado) {
        return res.json({ success: true, enviado: false, id_mensaje_visto, error: 'ya fue enviado previamente' });
      }

      // Extraer grupo_familiar
      let grupoFamiliar = null;
      const jsonRaw = candidato.json_adicional;

      if (jsonRaw) {
        try {
          const jsonData = typeof jsonRaw === 'string' ? JSON.parse(jsonRaw) : jsonRaw;
          grupoFamiliar = jsonData.grupo_familiar || null;
        } catch (e) {
          logger.error(`[n8nRecuperacion] enviar-recuperacion mv.id=${id_mensaje_visto}: error parseando json_adicional: ${e.message}`);
        }
      }

      if (!grupoFamiliar) {
        await mensajeVistoModel.actualizarEstadoEnvio(id_mensaje_visto, false, 'sin grupo_familiar');
        return res.json({ success: false, enviado: false, id_mensaje_visto, celular: candidato.celular, error: 'sin grupo_familiar' });
      }

      // Generar nuevo link de pago
      let enlace = null;
      try {
        enlace = await PagoService.generarLinkPago(grupoFamiliar, candidato.celular);
      } catch (e) {
        logger.error(`[n8nRecuperacion] enviar-recuperacion mv.id=${id_mensaje_visto}: error generando link: ${e.message}`);
        await mensajeVistoModel.actualizarEstadoEnvio(id_mensaje_visto, false, `error link pago: ${e.message}`);
        return res.json({ success: false, enviado: false, id_mensaje_visto, celular: candidato.celular, error: `error generando link: ${e.message}` });
      }

      if (!enlace) {
        await mensajeVistoModel.actualizarEstadoEnvio(id_mensaje_visto, false, 'link de pago retornó vacío');
        return res.json({ success: false, enviado: false, id_mensaje_visto, celular: candidato.celular, error: 'link de pago retornó vacío' });
      }

      // Construir y enviar mensaje por WhatsApp
      const textoMensaje = MENSAJE_RECUPERACION(candidato.nombre_completo, enlace);
      let wid = null;
      try {
        const envio = await WhatsappGraphService.enviarMensajeTexto(candidato.id_empresa, candidato.celular, textoMensaje);
        wid = envio.wid_mensaje || null;
      } catch (e) {
        logger.error(`[n8nRecuperacion] enviar-recuperacion mv.id=${id_mensaje_visto}: error enviando WhatsApp: ${e.message}`);
        await mensajeVistoModel.actualizarEstadoEnvio(id_mensaje_visto, false, `error whatsapp: ${e.message}`);
        return res.json({ success: false, enviado: false, id_mensaje_visto, celular: candidato.celular, enlace, error: `error enviando WhatsApp: ${e.message}` });
      }

      // Guardar mensaje saliente en BD
      await MensajeModel.create({
        id_chat: candidato.id_chat,
        contenido: textoMensaje,
        direccion: 'out',
        wid_mensaje: wid,
        tipo_mensaje: 'recuperacion',
        fecha_hora: new Date(),
        usuario_registro: null
      });

      // Marcar como enviado
      await mensajeVistoModel.actualizarEstadoEnvio(id_mensaje_visto, true, null);

      logger.info(`[n8nRecuperacion] enviar-recuperacion: enviado a ${candidato.celular} (mv.id=${id_mensaje_visto})`);

      return res.json({
        success: true,
        enviado: true,
        id_mensaje_visto,
        celular: candidato.celular,
        nombre_completo: candidato.nombre_completo,
        enlace
      });

    } catch (error) {
      logger.error(`[n8nRecuperacion] Error enviar-recuperacion mv.id=${id_mensaje_visto}: ${error.message}`);
      try { await mensajeVistoModel.actualizarEstadoEnvio(id_mensaje_visto, false, error.message); } catch (e) { /* ignore */ }
      return res.json({ success: false, enviado: false, id_mensaje_visto, error: error.message });
    }
  }
}

module.exports = new N8nRecuperacionController();
