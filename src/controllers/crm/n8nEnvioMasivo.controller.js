/**
 * Controlador para envío masivo desde n8n
 * Adaptado de viva-api para usar los modelos raw MySQL de bitel-portabilidad
 */

const EnvioMasivoWhatsappModel = require("../../models/envioMasivoWhatsapp.model.js");
const EnvioPersonaModel = require("../../models/envioPersona.model.js");
const PlantillaWhatsappModel = require("../../models/plantillaWhatsapp.model.js");
const configuracionWhatsappRepository = require("../../repositories/configuracionWhatsapp.repository.js");
const whatsappGraphService = require("../../services/whatsapp/whatsappGraph.service.js");
const logger = require('../../config/logger/loggerClient.js');

// Configuración
const BATCH_SIZE = 50;
const DELAY_BETWEEN_MESSAGES = 500;

class N8nEnvioMasivoController {
  /**
   * GET /n8n/envios-masivos/pendientes
   * Obtiene envíos pendientes agrupados por empresa
   */
  async getPendientesAgrupados(req, res) {
    try {
      const { limite_por_empresa = 5 } = req.query;

      // Obtener envíos pendientes con fecha <= ahora
      const { pool } = require("../../config/dbConnection.js");
      const [envios] = await pool.execute(
        `SELECT emw.*, pw.name as plantilla_nombre, pw.language as plantilla_language,
                e.nombre_comercial as empresa_nombre
         FROM envio_masivo_whatsapp emw
         LEFT JOIN plantilla_whatsapp pw ON emw.id_plantilla = pw.id
         LEFT JOIN empresa e ON emw.id_empresa = e.id
         WHERE emw.estado_envio = 'pendiente'
           AND emw.fecha_envio <= NOW()
           AND (emw.estado_registro = 1 OR emw.estado_registro IS NULL)
         ORDER BY emw.id_empresa ASC, emw.fecha_envio ASC`
      );

      // Obtener configuraciones de WhatsApp
      const [configuraciones] = await pool.execute(
        `SELECT * FROM configuracion_whatsapp WHERE 1=1`
      );

      const configMap = {};
      configuraciones.forEach(config => {
        configMap[config.id_empresa] = {
          numero_telefono_id: config.numero_telefono_id,
          token_whatsapp: config.token_whatsapp
        };
      });

      // Agrupar por empresa
      const empresasMap = {};

      for (const envio of envios) {
        const idEmpresa = envio.id_empresa;
        const config = configMap[idEmpresa];

        if (!config) continue;

        if (!empresasMap[idEmpresa]) {
          empresasMap[idEmpresa] = {
            id_empresa: idEmpresa,
            empresa_nombre: envio.empresa_nombre || 'Sin nombre',
            envios: []
          };
        }

        if (empresasMap[idEmpresa].envios.length < parseInt(limite_por_empresa)) {
          // Obtener envio_persona pendientes para este envío
          const envioPersonas = await EnvioPersonaModel.getByEnvioMasivo(envio.id);
          const personasPendientes = envioPersonas.filter(ep => ep.estado === 'pendiente');

          const personas = personasPendientes.map(ep => ({
            envio_persona_id: ep.id,
            id_persona: ep.id_persona,
            nombre: ep.persona_nombre || 'Sin nombre',
            telefono: ep.persona_celular || ''
          }));

          empresasMap[idEmpresa].envios.push({
            envio_id: envio.id,
            plantilla: envio.plantilla_nombre || '',
            language: envio.plantilla_language || 'es',
            cantidad: envio.cantidad,
            personas: personas
          });
        }
      }

      return res.json({
        success: true,
        empresas: Object.values(empresasMap),
        total_empresas: Object.keys(empresasMap).length
      });

    } catch (error) {
      logger.error(`[n8nEnvioMasivo] Error getPendientesAgrupados: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /n8n/envios-masivos/:id/enviar
   * Envía los mensajes de un envío masivo
   */
  async enviarMasivo(req, res) {
    try {
      const { id } = req.params;
      const {
        personas = [],
        plantilla,
        language = 'es',
        id_empresa
      } = req.body;

      if (!personas.length || !plantilla || !id_empresa) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos (personas, plantilla, id_empresa)' });
      }

      // Verificar configuración de WhatsApp
      const configWhatsapp = await configuracionWhatsappRepository.findByEmpresaId(id_empresa);
      if (!configWhatsapp || !configWhatsapp.numero_telefono_id) {
        return res.status(400).json({ error: 'No se encontró configuración de WhatsApp para esta empresa' });
      }

      // Actualizar estado a enviado (en proceso)
      await EnvioMasivoWhatsappModel.updateEstado(id, 'enviado');

      const resultados = {
        envio_id: parseInt(id),
        total: personas.length,
        enviados: 0,
        fallidos: 0,
        detalles: []
      };

      // Procesar en batches
      for (let i = 0; i < personas.length; i += BATCH_SIZE) {
        const batch = personas.slice(i, i + BATCH_SIZE);

        for (const persona of batch) {
          if (!persona.telefono) {
            resultados.fallidos++;
            resultados.detalles.push({
              envio_persona_id: persona.envio_persona_id,
              telefono: '',
              nombre: persona.nombre,
              status: 'cancelado',
              error: 'Sin número de teléfono'
            });

            if (persona.envio_persona_id) {
              await EnvioPersonaModel.updateEstado(
                persona.envio_persona_id,
                'cancelado',
                'Sin número de teléfono'
              );
            }
            continue;
          }

          try {
            await whatsappGraphService.enviarPlantilla(
              id_empresa,
              persona.telefono,
              plantilla,
              language
            );

            resultados.enviados++;
            resultados.detalles.push({
              envio_persona_id: persona.envio_persona_id,
              telefono: persona.telefono,
              nombre: persona.nombre,
              status: 'enviado'
            });

            if (persona.envio_persona_id) {
              await EnvioPersonaModel.updateEstado(
                persona.envio_persona_id,
                'enviado'
              );
            }

          } catch (error) {
            const errorDetalle = error.metaError
              ? {
                  mensaje: error.message,
                  codigo: error.metaError.code,
                  subcodigo: error.metaError.error_subcode,
                  tipo: error.metaError.type,
                  titulo: error.metaError.error_user_title || null,
                  detalle_usuario: error.metaError.error_user_msg || null
                }
              : { mensaje: error.message };

            resultados.fallidos++;
            resultados.detalles.push({
              envio_persona_id: persona.envio_persona_id,
              telefono: persona.telefono,
              nombre: persona.nombre,
              status: 'cancelado',
              error: error.message,
              error_detalle: errorDetalle
            });

            if (persona.envio_persona_id) {
              await EnvioPersonaModel.updateEstado(
                persona.envio_persona_id,
                'cancelado',
                error.message
              );
            }

            logger.error(`[n8nEnvioMasivo] Error enviando a ${persona.telefono}: ${error.message}`);
          }

          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));
        }
      }

      // Determinar nuevo estado
      let nuevoEstado = 'entregado';
      if (resultados.fallidos > 0 && resultados.enviados === 0) {
        nuevoEstado = 'cancelado';
      }

      // Actualizar contadores y estado final
      await EnvioMasivoWhatsappModel.updateContadores(id, resultados.enviados, resultados.fallidos);
      await EnvioMasivoWhatsappModel.updateEstado(id, nuevoEstado);

      logger.info(`[n8nEnvioMasivo] Envío ${id} completado: ${resultados.enviados} enviados, ${resultados.fallidos} fallidos`);

      return res.json({
        success: true,
        resultados
      });

    } catch (error) {
      logger.error(`[n8nEnvioMasivo] Error enviarMasivo: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * PUT /n8n/envios-masivos/:id/completar
   * Marca un envío como completado
   */
  async marcarCompletado(req, res) {
    try {
      const { id } = req.params;
      const {
        estado = 'entregado',
        enviados = 0,
        fallidos = 0
      } = req.body;

      await EnvioMasivoWhatsappModel.updateContadores(id, enviados, fallidos);
      await EnvioMasivoWhatsappModel.updateEstado(id, estado);

      return res.json({
        success: true,
        message: `Envío ${id} marcado como ${estado}`,
        enviados,
        fallidos
      });

    } catch (error) {
      logger.error(`[n8nEnvioMasivo] Error marcarCompletado: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new N8nEnvioMasivoController();
