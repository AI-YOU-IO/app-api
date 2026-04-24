/**
 * Controlador para envío masivo desde n8n
 * Usa la misma lógica de resolución de variables que envioMasivoWhatsapp.controller.js:
 * formato_campo_plantilla → base_numero_detalle (columnas directas o json_adicional)
 */

const EnvioMasivoWhatsappModel = require("../../models/envioMasivoWhatsapp.model.js");
const EnvioPersonaModel = require("../../models/envioBase.model.js");
const PlantillaWhatsappModel = require("../../models/plantillaWhatsapp.model.js");
const FormatoCampoPlantillaModel = require("../../models/formatoCampoPlantilla.model.js");
const configuracionWhatsappRepository = require("../../repositories/configuracionWhatsapp.repository.js");
const whatsappGraphService = require("../../services/whatsapp/whatsappGraph.service.js");
const Persona = require("../../models/persona.model.js");
const Chat = require("../../models/chat.model.js");
const Mensaje = require("../../models/mensaje.model.js");
const { normalizarCelular } = require("../../utils/phone.js");
const logger = require('../../config/logger/loggerClient.js');

/**
 * Extrae el texto del body desde el array/string de components
 */
function extraerBodyDeComponents(components) {
    let comps = components;
    if (typeof comps === 'string') {
        try { comps = JSON.parse(comps); } catch { return ''; }
    }
    if (!Array.isArray(comps)) return '';
    const bodyComp = comps.find(c => (c.type || '').toUpperCase() === 'BODY');
    return bodyComp?.text || '';
}

// Configuración
const BATCH_SIZE = 50;
const DELAY_BETWEEN_MESSAGES = 500;

// Columnas directas de base_numero_detalle
const DIRECT_COLUMNS = ['telefono', 'nombre', 'correo', 'tipo_documento', 'numero_documento'];

class N8nEnvioMasivoController {
  /**
   * GET /n8n/envios-masivos/pendientes
   * Obtiene envíos pendientes agrupados por empresa
   * Ahora itera base_numero_detalle para obtener los números reales
   */
  async getPendientesAgrupados(req, res) {
    try {
      const { pool } = require("../../config/dbConnection.js");

      // Subconsulta para obtener el envío programado más antiguo por empresa
      const [rows] = await pool.execute(
        `SELECT
           emw.id              AS envio_id,
           emw.id_empresa,
           emw.titulo,
           emw.cantidad,
           emw.fecha_envio,
           pw.name             AS plantilla,
           pw.language         AS language,
           e.nombre_comercial  AS empresa_nombre,
           COUNT(eb.id)        AS cantidad_pendientes
         FROM envio_masivo_whatsapp emw
         INNER JOIN (
           SELECT id_empresa, MIN(fecha_envio) AS primera_fecha
           FROM envio_masivo_whatsapp
           WHERE estado_envio = 'pendiente'
             AND es_programado = true
             AND fecha_envio <= CURRENT_TIMESTAMP
             AND estado_registro = 1
           GROUP BY id_empresa
         ) primero ON primero.id_empresa = emw.id_empresa
                  AND primero.primera_fecha = emw.fecha_envio
         INNER JOIN configuracion_whatsapp cw ON cw.id_empresa = emw.id_empresa
         LEFT JOIN plantilla_whatsapp pw      ON pw.id = emw.id_plantilla
         LEFT JOIN empresa e                  ON e.id  = emw.id_empresa
         LEFT JOIN envio_base eb              ON eb.id_envio_masivo = emw.id
                                             AND eb.estado = 'pendiente'
                                             AND eb.estado_registro = 1
         WHERE emw.estado_envio = 'pendiente'
           AND emw.es_programado = true
           AND emw.fecha_envio <= CURRENT_TIMESTAMP
           AND emw.estado_registro = 1
         GROUP BY emw.id, emw.id_empresa, emw.titulo, emw.cantidad,
                  emw.fecha_envio, pw.name, pw.language, e.nombre_comercial
         ORDER BY emw.id_empresa ASC`
      );

      const empresas = rows.map(row => ({
        id_empresa: row.id_empresa,
        empresa_nombre: row.empresa_nombre || 'Sin nombre',
        envio: {
          envio_id: row.envio_id,
          titulo: row.titulo || '',
          plantilla: row.plantilla || '',
          language: row.language || 'es',
          cantidad: row.cantidad,
          cantidad_pendientes: parseInt(row.cantidad_pendientes || 0),
          fecha_envio: row.fecha_envio
        }
      }));

      logger.info(`[n8nEnvioMasivo] getPendientesAgrupados: ${empresas.length} empresas con envío programado listo`);

      return res.json({
        success: true,
        empresas,
        total_empresas: empresas.length
      });

    } catch (error) {
      logger.error(`[n8nEnvioMasivo] Error getPendientesAgrupados: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /n8n/envios-masivos/:id/enviar
   * Envía los mensajes de un envío masivo usando la lógica de campo mappings
   */
  async enviarMasivo(req, res) {
    try {
      const { id } = req.params;
      const { id_empresa } = req.body;

      if (!id_empresa) {
        return res.status(400).json({ error: 'Falta parámetro requerido (id_empresa)' });
      }

      // Obtener el envio masivo
      const envio = await EnvioMasivoWhatsappModel.getById(id);
      if (!envio) {
        return res.status(404).json({ error: 'Envío masivo no encontrado' });
      }

      // Obtener la plantilla para detectar parámetros en el body
      const plantilla = await PlantillaWhatsappModel.getById(envio.id_plantilla);
      if (!plantilla) {
        return res.status(400).json({ error: 'La plantilla asociada no fue encontrada' });
      }

      const plantillaBody = extraerBodyDeComponents(plantilla.components);
      const bodyParams = plantillaBody ? (plantillaBody.match(/\{\{\d+\}\}/g) || []) : [];
      const numBodyParams = new Set(bodyParams).size;

      // Obtener mapeo de campos de la plantilla (variables → campos)
      const formatoCampoPlantillaModel = new FormatoCampoPlantillaModel();
      const camposPlantilla = await formatoCampoPlantillaModel.getAllByPlantilla(plantilla.id);

      // Verificar configuración de WhatsApp
      const configWhatsapp = await configuracionWhatsappRepository.findByEmpresaId(id_empresa);
      if (!configWhatsapp || !configWhatsapp.numero_telefono_id) {
        return res.status(400).json({ error: 'No se encontró configuración de WhatsApp para esta empresa' });
      }

      // Obtener los registros asociados al envío (cada uno apunta a base_numero_detalle)
      const envioBaseRecords = await EnvioPersonaModel.getByEnvioMasivo(id);
      logger.info(`[n8nEnvioMasivo] Envio ${id}: ${envioBaseRecords.length} registros, ${camposPlantilla.length} campos mapeados, ${numBodyParams} params en plantilla`);

      if (envioBaseRecords.length === 0) {
        return res.status(400).json({ error: 'No hay registros asociados a este envío' });
      }

      // Actualizar estado a enviado (en proceso)
      await EnvioMasivoWhatsappModel.updateEstado(id, 'entregado');

      const resultados = {
        envio_id: parseInt(id),
        total: envioBaseRecords.filter(eb => eb.estado === 'pendiente').length,
        enviados: 0,
        fallidos: 0,
        detalles: []
      };

      // Procesar en batches
      const pendientes = envioBaseRecords.filter(eb => eb.estado === 'pendiente');

      for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
        const batch = pendientes.slice(i, i + BATCH_SIZE);

        for (const eb of batch) {
          try {
            // eb.id_base ahora apunta a base_numero_detalle.id
            // Los datos del detalle ya vienen en el JOIN del query
            const detalle = {
              id: eb.id_base,
              telefono: eb.detalle_telefono,
              nombre: eb.detalle_nombre,
              correo: eb.detalle_correo,
              tipo_documento: eb.detalle_tipo_documento,
              numero_documento: eb.detalle_numero_documento,
              json_adicional: eb.detalle_json_adicional
            };

            const celular = normalizarCelular(detalle.telefono);
            if (!celular) {
              resultados.fallidos++;
              resultados.detalles.push({
                telefono: '',
                nombre: detalle.nombre || '',
                status: 'cancelado',
                error: 'Sin número de teléfono'
              });
              await EnvioPersonaModel.updateEstado(eb.id, 'cancelado', 'Sin número de teléfono');
              continue;
            }

            try {
              // Construir components resolviendo variables desde los campos mapeados
              const components = [];

              if (camposPlantilla.length > 0 && numBodyParams > 0) {
                const bodyParameters = camposPlantilla.map((campo) => {
                  const nombreCampo = campo.nombre_campo;
                  let valor = '';

                  if (DIRECT_COLUMNS.includes(nombreCampo)) {
                    valor = detalle[nombreCampo] || '';
                  } else if (detalle.json_adicional) {
                    const jsonData = typeof detalle.json_adicional === 'string'
                      ? JSON.parse(detalle.json_adicional)
                      : detalle.json_adicional;
                    valor = jsonData?.[nombreCampo] || '';
                  }

                  return { type: 'text', text: String(valor) || '' };
                });
                components.push({ type: 'body', parameters: bodyParameters });
              } else if (numBodyParams > 0) {
                const bodyParameters = [];
                for (let p = 0; p < numBodyParams; p++) {
                  const valor = p === 0 ? (detalle.nombre || 'Cliente') : '';
                  bodyParameters.push({ type: 'text', text: valor });
                }
                components.push({ type: 'body', parameters: bodyParameters });
              }

              await whatsappGraphService.enviarPlantilla(
                id_empresa,
                celular,
                plantilla.name,
                plantilla.language || 'es',
                components
              );

              resultados.enviados++;
              resultados.detalles.push({
                telefono: celular,
                nombre: detalle.nombre || '',
                status: 'entregado'
              });
              await EnvioPersonaModel.updateEstado(eb.id, 'entregado');

              // Registrar chat y mensaje saliente en BD
              try {
                let personaBd = await Persona.selectByCelular(celular, id_empresa);
                if (!personaBd) {
                  personaBd = await Persona.createPersona({
                    id_estado: 1,
                    celular: celular,
                    nombre_completo: detalle.nombre || null,
                    id_empresa: id_empresa,
                    usuario_registro: null
                  });
                  if (!personaBd || !personaBd.id) {
                    personaBd = await Persona.selectByCelular(celular, id_empresa);
                  }
                }

                if (!personaBd || !personaBd.id) {
                  logger.error(`[n8nEnvioMasivo] No se pudo obtener persona para ${celular}`);
                  continue;
                }

                await Persona.updatePersona(personaBd.id, {
                  id_ref_base_num_detalle: detalle.id,
                  usuario_actualizacion: null
                });

                let chat = await Chat.findByPersona(personaBd.id);
                if (!chat) {
                  const chatId = await Chat.create({
                    id_empresa,
                    id_persona: personaBd.id,
                    usuario_registro: null
                  });
                  chat = { id: chatId };
                }

                let contenidoMensaje = plantillaBody || `[Envío masivo] Plantilla: ${plantilla.name}`;
                const bodyComp = components.find(c => c.type === 'body');
                if (bodyComp && bodyComp.parameters) {
                    bodyComp.parameters.forEach((param, i) => {
                        contenidoMensaje = contenidoMensaje.replace(`{{${i + 1}}}`, param.text);
                    });
                }

                await Mensaje.create({
                  id_chat: chat.id,
                  contenido: contenidoMensaje,
                  direccion: "out",
                  wid_mensaje: null,
                  tipo_mensaje: "plantilla",
                  fecha_hora: new Date(),
                  usuario_registro: null
                });
              } catch (chatError) {
                logger.error(`[n8nEnvioMasivo] Error al registrar chat/mensaje para ${celular}: ${chatError.message}`);
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
                telefono: celular,
                nombre: detalle.nombre || '',
                status: 'cancelado',
                error: error.message,
                error_detalle: errorDetalle
              });
              await EnvioPersonaModel.updateEstado(eb.id, 'cancelado', error.message);

              logger.error(`[n8nEnvioMasivo] Error enviando a ${celular}: ${error.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));
          } catch (baseError) {
            await EnvioPersonaModel.updateEstado(eb.id, 'cancelado', baseError.message);
            logger.error(`[n8nEnvioMasivo] Error procesando detalle ${eb.id_base}: ${baseError.message}`);
          }
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
   * GET /n8n/envios-masivos/:id/personas-pendientes
   * Devuelve TODAS las personas pendientes de un envío (sin json_adicional).
   * El payload es ligero (~60 bytes/persona). enviar-persona busca el detalle completo por id_base.
   */
  async getPersonasPendientes(req, res) {
    try {
      const { id } = req.params;
      const { pool } = require("../../config/dbConnection.js");

      const [rows] = await pool.execute(
        `SELECT eb.id   AS envio_base_id,
                eb.id_base,
                bnd.telefono,
                bnd.nombre
         FROM envio_base eb
         LEFT JOIN base_numero_detalle bnd ON bnd.id = eb.id_base
         WHERE eb.id_envio_masivo = ? AND eb.estado = 'pendiente' AND eb.estado_registro = 1
         ORDER BY eb.id ASC`,
        [id]
      );

      return res.json({ success: true, total: rows.length, personas: rows });

    } catch (error) {
      logger.error(`[n8nEnvioMasivo] Error getPersonasPendientes: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /n8n/envios-masivos/:id/enviar-persona
   * Envía la plantilla a UNA persona. Llamar en batches paralelos desde n8n.
   * Body: { id_empresa, envio_base_id, telefono, nombre, id_base,
   *         correo?, tipo_documento?, numero_documento?, json_adicional? }
   */
  async enviarPersona(req, res) {
    try {
      const { id } = req.params;
      const { id_empresa, envio_base_id, id_base, telefono, nombre } = req.body;

      if (!id_empresa || !envio_base_id || !id_base) {
        return res.status(400).json({ error: 'Faltan parámetros: id_empresa, envio_base_id, id_base' });
      }

      const celular = normalizarCelular(telefono);
      if (!celular) {
        await EnvioPersonaModel.updateEstado(envio_base_id, 'cancelado', 'Sin número válido');
        return res.json({ success: false, status: 'cancelado', telefono: '', error: 'Sin número válido' });
      }

      // Cargar config del envío y detalle completo en paralelo
      const { pool } = require("../../config/dbConnection.js");
      const [envio, [detalleRows]] = await Promise.all([
        EnvioMasivoWhatsappModel.getById(id),
        pool.execute(
          `SELECT telefono, nombre, correo, tipo_documento, numero_documento, json_adicional
           FROM base_numero_detalle WHERE id = ?`,
          [id_base]
        )
      ]);

      if (!envio) return res.status(404).json({ error: 'Envío masivo no encontrado' });

      const [plantilla, configWhatsapp] = await Promise.all([
        PlantillaWhatsappModel.getById(envio.id_plantilla),
        configuracionWhatsappRepository.findByEmpresaId(id_empresa)
      ]);

      if (!plantilla) return res.status(400).json({ error: 'Plantilla no encontrada' });
      if (!configWhatsapp?.numero_telefono_id) {
        return res.status(400).json({ error: 'No se encontró configuración de WhatsApp para esta empresa' });
      }

      const plantillaBody = extraerBodyDeComponents(plantilla.components);
      const numBodyParams = new Set((plantillaBody?.match(/\{\{\d+\}\}/g) || [])).size;
      const formatoCampoPlantillaModel = new FormatoCampoPlantillaModel();
      const camposPlantilla = await formatoCampoPlantillaModel.getAllByPlantilla(plantilla.id);

      const raw = detalleRows[0] || {};
      const detalle = {
        id: id_base,
        telefono: celular,
        nombre: raw.nombre || nombre || 'Sin nombre',
        correo: raw.correo || null,
        tipo_documento: raw.tipo_documento || null,
        numero_documento: raw.numero_documento || null,
        json_adicional: raw.json_adicional || null
      };

      // Construir components resolviendo variables mapeadas
      const components = [];
      if (numBodyParams > 0) {
        let bodyParameters;
        if (camposPlantilla.length > 0) {
          bodyParameters = camposPlantilla.map((campo) => {
            let valor = '';
            if (DIRECT_COLUMNS.includes(campo.nombre_campo)) {
              valor = detalle[campo.nombre_campo] || '';
            } else if (detalle.json_adicional) {
              const jsonData = typeof detalle.json_adicional === 'string'
                ? JSON.parse(detalle.json_adicional)
                : detalle.json_adicional;
              valor = jsonData?.[campo.nombre_campo] || '';
            }
            return { type: 'text', text: String(valor) };
          });
        } else {
          bodyParameters = [{ type: 'text', text: detalle.nombre }];
        }
        components.push({ type: 'body', parameters: bodyParameters });
      }

      // Enviar por WhatsApp
      try {
        await whatsappGraphService.enviarPlantilla(
          id_empresa, celular, plantilla.name, plantilla.language || 'es', components
        );
        await EnvioPersonaModel.updateEstado(envio_base_id, 'entregado');

        // Registrar persona, chat y mensaje en BD
        try {
          let personaBd = await Persona.selectByCelular(celular, id_empresa);
          if (!personaBd) {
            personaBd = await Persona.createPersona({
              id_estado: 1, celular, nombre_completo: detalle.nombre || null,
              id_empresa, usuario_registro: null
            });
            if (!personaBd?.id) personaBd = await Persona.selectByCelular(celular, id_empresa);
          }
          if (personaBd?.id) {
            await Persona.updatePersona(personaBd.id, {
              id_ref_base_num_detalle: detalle.id, usuario_actualizacion: null
            });
            let chat = await Chat.findByPersona(personaBd.id);
            if (!chat) {
              const chatId = await Chat.create({
                id_empresa, id_persona: personaBd.id, usuario_registro: null
              });
              chat = { id: chatId };
            }
            let contenidoMensaje = plantillaBody || `[Envío masivo] Plantilla: ${plantilla.name}`;
            const bodyComp = components.find(c => c.type === 'body');
            if (bodyComp?.parameters) {
              bodyComp.parameters.forEach((param, i) => {
                contenidoMensaje = contenidoMensaje.replace(`{{${i + 1}}}`, param.text);
              });
            }
            await Mensaje.create({
              id_chat: chat.id, contenido: contenidoMensaje, direccion: 'out',
              wid_mensaje: null, tipo_mensaje: 'plantilla',
              fecha_hora: new Date(), usuario_registro: null
            });
          }
        } catch (chatError) {
          logger.error(`[n8nEnvioMasivo] Error chat/mensaje ${celular}: ${chatError.message}`);
        }

        return res.json({ success: true, status: 'entregado', telefono: celular });

      } catch (waError) {
        const errorMsg = waError.message || 'Error al enviar';
        await EnvioPersonaModel.updateEstado(envio_base_id, 'cancelado', errorMsg);
        logger.error(`[n8nEnvioMasivo] Error WA ${celular}: ${errorMsg}`);
        return res.json({ success: false, status: 'cancelado', telefono: celular, error: errorMsg });
      }

    } catch (error) {
      logger.error(`[n8nEnvioMasivo] Error enviarPersona: ${error.message}`);
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
