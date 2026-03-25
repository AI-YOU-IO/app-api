/**
 * Controlador para envío masivo desde n8n
 * Usa la misma lógica de resolución de variables que envioMasivoWhatsapp.controller.js:
 * formato_campo_plantilla → base_numero_detalle (columnas directas o json_adicional)
 */

const EnvioMasivoWhatsappModel = require("../../models/envioMasivoWhatsapp.model.js");
const EnvioPersonaModel = require("../../models/envioBase.model.js");
const PlantillaWhatsappModel = require("../../models/plantillaWhatsapp.model.js");
const FormatoCampoPlantillaModel = require("../../models/formatoCampoPlantilla.model.js");
const BaseNumeroDetalleModel = require("../../models/baseNumeroDetalle.model.js");
const configuracionWhatsappRepository = require("../../repositories/configuracionWhatsapp.repository.js");
const whatsappGraphService = require("../../services/whatsapp/whatsappGraph.service.js");
const Persona = require("../../models/persona.model.js");
const Chat = require("../../models/chat.model.js");
const Mensaje = require("../../models/mensaje.model.js");
const logger = require('../../config/logger/loggerClient.js');

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
           AND emw.fecha_envio <= CURRENT_TIMESTAMP
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
      const baseNumeroDetalleModel = new BaseNumeroDetalleModel();

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
          // Obtener bases asociadas al envío
          const envioBaseRecords = await EnvioPersonaModel.getByEnvioMasivo(envio.id);
          const basesPendientes = envioBaseRecords.filter(eb => eb.estado === 'pendiente');

          // Obtener personas de base_numero_detalle para cada base
          const personas = [];
          for (const eb of basesPendientes) {
            const detalles = await baseNumeroDetalleModel.getAllByBaseNumeroSinPaginar(eb.id_base);
            for (const detalle of detalles) {
              if (detalle.telefono) {
                personas.push({
                  envio_base_id: eb.id,
                  id_base: eb.id_base,
                  telefono: detalle.telefono,
                  nombre: detalle.nombre || 'Sin nombre',
                  detalle_id: detalle.id
                });
              }
            }
          }

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

      const bodyParams = plantilla.body ? (plantilla.body.match(/\{\{\d+\}\}/g) || []) : [];
      const numBodyParams = new Set(bodyParams).size;

      // Obtener mapeo de campos de la plantilla (variables → campos)
      const formatoCampoPlantillaModel = new FormatoCampoPlantillaModel();
      const camposPlantilla = await formatoCampoPlantillaModel.getAllByPlantilla(plantilla.id);

      // Verificar configuración de WhatsApp
      const configWhatsapp = await configuracionWhatsappRepository.findByEmpresaId(id_empresa);
      if (!configWhatsapp || !configWhatsapp.numero_telefono_id) {
        return res.status(400).json({ error: 'No se encontró configuración de WhatsApp para esta empresa' });
      }

      // Obtener las bases asociadas al envío
      const envioBaseRecords = await EnvioPersonaModel.getByEnvioMasivo(id);
      logger.info(`[n8nEnvioMasivo] Envio ${id}: ${envioBaseRecords.length} bases, ${camposPlantilla.length} campos mapeados, ${numBodyParams} params en plantilla`);

      if (envioBaseRecords.length === 0) {
        return res.status(400).json({ error: 'No hay bases asociadas a este envío' });
      }

      // Actualizar estado a enviado (en proceso)
      await EnvioMasivoWhatsappModel.updateEstado(id, 'entregado');

      const resultados = {
        envio_id: parseInt(id),
        total: 0,
        enviados: 0,
        fallidos: 0,
        detalles: []
      };

      const baseNumeroDetalleModel = new BaseNumeroDetalleModel();

      for (const eb of envioBaseRecords) {
        // Solo procesar bases pendientes
        if (eb.estado !== 'pendiente') {
          continue;
        }

        try {
          // Obtener todos los registros de base_numero_detalle de esta base
          const detalles = await baseNumeroDetalleModel.getAllByBaseNumeroSinPaginar(eb.id_base);
          logger.info(`[n8nEnvioMasivo] Base ${eb.id_base}: ${detalles.length} registros`);
          resultados.total += detalles.length;

          // Procesar en batches
          for (let i = 0; i < detalles.length; i += BATCH_SIZE) {
            const batch = detalles.slice(i, i + BATCH_SIZE);

            for (const detalle of batch) {
              const celular = detalle.telefono;
              if (!celular) {
                resultados.fallidos++;
                resultados.detalles.push({
                  telefono: '',
                  nombre: detalle.nombre || '',
                  status: 'cancelado',
                  error: 'Sin número de teléfono'
                });
                continue;
              }

              try {
                // Construir components resolviendo variables desde los campos mapeados
                const components = [];

                if (camposPlantilla.length > 0 && numBodyParams > 0) {
                  // Resolver variables usando el mapeo de campos
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
                  // Sin mapeo de campos, fallback: usar nombre para {{1}}
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
                    // Si createPersona no retornó objeto válido, buscar de nuevo
                    if (!personaBd || !personaBd.id) {
                      personaBd = await Persona.selectByCelular(celular, id_empresa);
                    }
                  }

                  if (!personaBd || !personaBd.id) {
                    logger.error(`[n8nEnvioMasivo] No se pudo obtener persona para ${celular}`);
                    continue;
                  }

                  // Actualizar persona.id_ref_base_num_detalle
                  if (personaBd) {
                    await Persona.updatePersona(personaBd.id, {
                      id_ref_base_num_detalle: detalle.id,
                      usuario_actualizacion: null
                    });
                  }

                  let chat = await Chat.findByPersona(personaBd.id);
                  if (!chat) {
                    const chatId = await Chat.create({
                      id_empresa,
                      id_persona: personaBd.id,
                      usuario_registro: null
                    });
                    chat = { id: chatId };
                  }

                  await Mensaje.create({
                    id_chat: chat.id,
                    contenido: `[Envío masivo] Plantilla: ${plantilla.name}`,
                    direccion: "in",
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

                logger.error(`[n8nEnvioMasivo] Error enviando a ${celular}: ${error.message}`);
              }

              await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));
            }
          }

          // Marcar la base como entregada
          await EnvioPersonaModel.updateEstado(eb.id, 'entregado');
        } catch (baseError) {
          await EnvioPersonaModel.updateEstado(eb.id, 'cancelado', baseError.message);
          logger.error(`[n8nEnvioMasivo] Error procesando base ${eb.id_base}: ${baseError.message}`);
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
