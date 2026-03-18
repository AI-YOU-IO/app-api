const { pool } = require("../../config/dbConnection.js");
const logger = require('../../config/logger/loggerClient.js');

class ReportesCrmController {
  async getFunnelData(req, res) {
    try {
      const { dateFrom, dateTo } = req.query;

      const { userId, rolId, idEmpresa } = req.user || {};

      let empresaCondition = '';
      const empresaParams = [];
      if (idEmpresa) {
        empresaCondition = ' AND p.id_empresa = ?';
        empresaParams.push(idEmpresa);
      }

      // Si el rol es >= 3, filtrar solo las personas asignadas a este asesor
      let asesorCondition = '';
      const asesorParams = [];
      if (rolId && rolId >= 3 && userId) {
        asesorCondition = ' AND p.id_usuario = ?';
        asesorParams.push(userId);
      }

      // Construir clausula de fecha
      let dateCondition = '';
      const dateParams = [];

      if (dateFrom && dateTo) {
        dateCondition = ' AND p.fecha_registro >= ? AND p.fecha_registro <= ?';
        dateParams.push(dateFrom + ' 00:00:00', dateTo + ' 23:59:59');
      } else if (dateFrom) {
        dateCondition = ' AND p.fecha_registro >= ?';
        dateParams.push(dateFrom + ' 00:00:00');
      } else if (dateTo) {
        dateCondition = ' AND p.fecha_registro <= ?';
        dateParams.push(dateTo + ' 23:59:59');
      }

      const params = [...empresaParams, ...asesorParams, ...dateParams];

      // 1. Total de leads
      const [totalLeadsResult] = await pool.execute(`
        SELECT COUNT(*) as total
        FROM persona p
        WHERE p.estado_registro = 1
        ${empresaCondition}
        ${asesorCondition}
        ${dateCondition}
      `, params);
      const totalLeads = totalLeadsResult[0]?.total || 0;

      // 2. Contactadas (personas que tienen al menos un mensaje via chat)
      const [contactadosResult] = await pool.execute(`
        SELECT COUNT(DISTINCT p.id) as total
        FROM persona p
        INNER JOIN chat c ON c.id_persona = p.id
        INNER JOIN mensaje m ON m.id_chat = c.id
        WHERE p.estado_registro = 1
        ${empresaCondition}
        ${asesorCondition}
        ${dateCondition}
      `, params);
      const contactados = contactadosResult[0]?.total || 0;

      // 3. Convertidos (personas que ya son Clientes: id_tipo_persona = 2)
      const [convertidosResult] = await pool.execute(`
        SELECT COUNT(*) as total
        FROM persona p
        WHERE p.id_tipo_persona = 2
        AND p.estado_registro = 1
        ${empresaCondition}
        ${asesorCondition}
        ${dateCondition}
      `, params);
      const convertidos = convertidosResult[0]?.total || 0;

      const funnelData = {
        totalLeads: {
          nombre: 'Total Leads',
          valor: totalLeads,
          porcentaje: 100
        },
        contactados: {
          nombre: 'Contactados',
          valor: contactados,
          porcentaje: totalLeads > 0 ? Math.round((contactados / totalLeads) * 100) : 0
        },
        interesados: {
          nombre: 'Convertidos',
          valor: convertidos,
          porcentaje: totalLeads > 0 ? Math.round((convertidos / totalLeads) * 100) : 0
        }
      };

      return res.status(200).json({ data: funnelData });
    } catch (error) {
      logger.error(`[reportes.controller.js] Error al obtener datos del embudo: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener datos del embudo" });
    }
  }

  async getDashboardStats(req, res) {
    try {
      const { userId, rolId, idEmpresa } = req.user || {};

      let empresaCondition = '';
      const empresaParams = [];
      if (idEmpresa) {
        empresaCondition = ' AND p.id_empresa = ?';
        empresaParams.push(idEmpresa);
      }

      // Si el rol es >= 3, filtrar solo las personas asignadas a este asesor
      let asesorCondition = '';
      const asesorParams = [];
      if (rolId && rolId >= 3 && userId) {
        asesorCondition = ' AND p.id_usuario = ?';
        asesorParams.push(userId);
      }

      const params = [...empresaParams, ...asesorParams];

      // 1. Total de leads
      const [totalLeadsResult] = await pool.execute(`
        SELECT COUNT(*) as total
        FROM persona p
        WHERE p.estado_registro = 1
        ${empresaCondition}
        ${asesorCondition}
      `, params);
      const totalLeads = totalLeadsResult[0]?.total || 0;

      // 2. Convertidos (Clientes: id_tipo_persona = 2)
      const [interesadosResult] = await pool.execute(`
        SELECT COUNT(*) as total
        FROM persona p
        WHERE p.id_tipo_persona = 2
        AND p.estado_registro = 1
        ${empresaCondition}
        ${asesorCondition}
      `, params);
      const interesados = interesadosResult[0]?.total || 0;

      // 2b. Prospectos que se convirtieron (fue_prospecto = 1 y ya son clientes)
      const [fueProspectoResult] = await pool.execute(`
        SELECT COUNT(*) as total
        FROM persona p
        WHERE p.fue_prospecto = 1
        AND p.id_tipo_persona = 2
        AND p.estado_registro = 1
        ${empresaCondition}
        ${asesorCondition}
      `, params);
      const fueProspecto = fueProspectoResult[0]?.total || 0;

      // 3. Leads nuevos esta semana
      const [leadsSemanasResult] = await pool.execute(`
        SELECT COUNT(*) as total
        FROM persona p
        WHERE p.fecha_registro >= CURRENT_DATE - INTERVAL '7 days'
        AND p.estado_registro = 1
        ${empresaCondition}
        ${asesorCondition}
      `, params);
      const leadsSemana = leadsSemanasResult[0]?.total || 0;

      // 4. Contactadas (personas que tienen al menos un mensaje via chat)
      const [contactadosResult] = await pool.execute(`
        SELECT COUNT(DISTINCT p.id) as total
        FROM persona p
        INNER JOIN chat c ON c.id_persona = p.id
        INNER JOIN mensaje m ON m.id_chat = c.id
        WHERE p.estado_registro = 1
        ${empresaCondition}
        ${asesorCondition}
      `, params);
      const contactados = contactadosResult[0]?.total || 0;

      // 5. Estadisticas por estado (pipeline)
      let pipelineQuery = `
        SELECT e.nombre, e.color, COUNT(p.id) as total
        FROM estado e
        LEFT JOIN persona p ON p.id_estado = e.id AND p.estado_registro = 1`;

      if (idEmpresa) {
        pipelineQuery += ` AND p.id_empresa = ?`;
      }
      if (rolId && rolId >= 3 && userId) {
        pipelineQuery += ` AND p.id_usuario = ?`;
      }

      pipelineQuery += `
        GROUP BY e.id, e.nombre, e.color
        ORDER BY e.id`;

      const [pipelineResult] = await pool.execute(pipelineQuery, params);

      const tasaConversion = totalLeads > 0 ? Math.round((interesados / totalLeads) * 100) : 0;

      const dashboardStats = {
        totalLeads,
        clientes: interesados,
        interesados,           // alias para no romper frontend existente
        fueProspecto,
        leadsSemana,
        contactados,
        tasaConversion,
        pipeline: pipelineResult
      };

      return res.status(200).json({ data: dashboardStats });
    } catch (error) {
      logger.error(`[reportes.controller.js] Error al obtener estadisticas del dashboard: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener estadisticas del dashboard" });
    }
  }
}

module.exports = new ReportesCrmController();
