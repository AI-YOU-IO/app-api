const plantillaWhatsappRepository = require("../repositories/plantillaWhatsapp.repository.js");
const whatsappGraphService = require("../services/whatsapp/whatsappGraph.service.js");
const logger = require('../config/logger/loggerClient.js');
const Usuario = require("../models/usuario.model.js");
const Persona = require("../models/persona.model.js");
const Chat = require("../models/chat.model.js");
const Mensaje = require("../models/mensaje.model.js");
const { normalizarCelular } = require("../utils/phone.js");

/**
 * Extrae campos planos (header, footer) desde el array de components de Meta
 */
function extraerCamposDeComponents(components) {
  const campos = { header_type: null, header_text: null, footer: null };

  for (const comp of (components || [])) {
    const type = (comp.type || '').toUpperCase();
    switch (type) {
      case 'HEADER':
        campos.header_type = (comp.format || 'TEXT').toUpperCase();
        campos.header_text = comp.text || null;
        break;
      case 'FOOTER':
        campos.footer = comp.text || null;
        break;
    }
  }

  return campos;
}

/**
 * Extrae el texto del body desde el array de components
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

/**
 * Compara los campos relevantes de Meta con los de BD para detectar diferencias
 */
function tienenDiferencias(metaFields, local) {
  if (metaFields.status !== (local.status || null)) return true;
  if (metaFields.category !== (local.category || null)) return true;
  if (metaFields.language !== (local.language || null)) return true;
  if (metaFields.header_type !== (local.header_type || null)) return true;
  if (metaFields.header_text !== (local.header_text || null)) return true;
  if (metaFields.footer !== (local.footer || null)) return true;
  return false;
}

class PlantillaWhatsappController {
  /**
   * Lista plantillas desde BD (sin llamar a Meta)
   */
  async getPlantillas(req, res) {
    try {
      const idEmpresa = req.user?.idEmpresa || null;
      if (!idEmpresa) {
        return res.status(400).json({ msg: "ID de empresa requerido" });
      }

      const plantillas = await plantillaWhatsappRepository.findAll(idEmpresa);

      const templates = plantillas.map(local => ({
        id: local.meta_template_id,
        id_local: local.id,
        meta_template_id: local.meta_template_id,
        name: local.name,
        status: local.status,
        category: local.category,
        language: local.language,
        header_type: local.header_type,
        header_text: local.header_text,
        footer: local.footer,
        components: local.components || [],
        url_imagen: local.url_imagen,
        id_formato: local.id_formato,
        formato_nombre: local.formato_nombre,
        stats_enviados: local.stats_enviados || 0,
        stats_entregados: local.stats_entregados || 0,
        stats_leidos: local.stats_leidos || 0,
        fecha_registro: local.fecha_registro,
      }));

      return res.status(200).json({
        success: true,
        data: { templates, total: templates.length }
      });
    } catch (error) {
      logger.error(`[plantillaWhatsapp.controller.js] Error al obtener plantillas: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener plantillas" });
    }
  }

  /**
   * Sincroniza plantillas desde Meta Graph API hacia la BD.
   * Compara por name: si no existe inserta, si hay diferencias actualiza.
   * components de Meta es la fuente principal.
   */
  async syncPlantillas(req, res) {
    try {
      const idEmpresa = req.user?.idEmpresa || null;
      if (!idEmpresa) {
        return res.status(400).json({ msg: "ID de empresa requerido" });
      }

      const result = await whatsappGraphService.listarPlantillas(idEmpresa);

      const plantillasLocales = await plantillaWhatsappRepository.findAll(idEmpresa);
      const mapaLocal = {};
      for (const p of plantillasLocales) {
        mapaLocal[p.name] = p;
      }

      let insertados = 0;
      let actualizados = 0;

      for (const metaTemplate of result.templates) {
        const campos = extraerCamposDeComponents(metaTemplate.components);
        const local = mapaLocal[metaTemplate.name];

        const datosSync = {
          status: metaTemplate.status || null,
          category: metaTemplate.category || null,
          language: metaTemplate.language || null,
          header_type: campos.header_type,
          header_text: campos.header_text,
          footer: campos.footer,
          components: metaTemplate.components || [],
          meta_template_id: metaTemplate.id ? String(metaTemplate.id) : null
        };

        if (!local) {
          try {
            await plantillaWhatsappRepository.create({
              ...datosSync,
              name: metaTemplate.name,
              id_empresa: idEmpresa,
              usuario_registro: null
            });
            insertados++;
          } catch (syncError) {
            logger.error(`[plantillaWhatsapp.controller.js] Error al insertar plantilla ${metaTemplate.name}: ${syncError.message}`);
          }
        } else {
          // Siempre actualizar para mantener components sincronizado con Meta
          try {
            await plantillaWhatsappRepository.updateByName(metaTemplate.name, idEmpresa, {
              ...datosSync,
              usuario_actualizacion: null
            });
            actualizados++;
          } catch (syncError) {
            logger.error(`[plantillaWhatsapp.controller.js] Error al actualizar plantilla ${metaTemplate.name}: ${syncError.message}`);
          }
        }
      }

      logger.info(`[plantillaWhatsapp.controller.js] Sync Meta completada: ${insertados} insertadas, ${actualizados} actualizadas`);

      return res.status(200).json({
        success: true,
        msg: `Sincronización completada: ${insertados} nuevas, ${actualizados} actualizadas`,
        data: { insertados, actualizados, total_meta: result.templates.length }
      });
    } catch (error) {
      logger.error(`[plantillaWhatsapp.controller.js] Error al sincronizar plantillas: ${error.message}`);
      const errorMsg = error.response?.data?.error?.message || error.message || "Error al sincronizar";
      return res.status(500).json({ msg: errorMsg });
    }
  }

  async getPlantillaById(req, res) {
    try {
      const { id } = req.params;
      const plantilla = await plantillaWhatsappRepository.findById(id);

      if (!plantilla) {
        return res.status(404).json({ msg: "Plantilla no encontrada" });
      }

      return res.status(200).json({ data: plantilla });
    } catch (error) {
      logger.error(`[plantillaWhatsapp.controller.js] Error al obtener plantilla: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener plantilla" });
    }
  }

  /**
   * Crea plantilla: primero en Meta, luego en BD si es exitoso
   */
  async createPlantilla(req, res) {
    try {
      const { name, category, language, header_type, header_text, body, footer, buttons, id_formato } = req.body;
      const id_empresa = req.user?.idEmpresa || null;
      const usuario_registro = req.user?.userId || null;

      if (!id_empresa) {
        return res.status(400).json({ msg: "ID de empresa requerido" });
      }

      if (!name || !body) {
        return res.status(400).json({ msg: "El nombre y contenido son requeridos" });
      }

      const nombreFormateado = name.toLowerCase().replace(/\s+/g, '_');

      // Construir componentes para Meta
      const components = whatsappGraphService.convertirDatosAComponentes({
        header_type,
        header_text,
        body,
        footer,
        buttons
      });

      // 1. Crear en Meta
      const resultMeta = await whatsappGraphService.crearPlantilla(
        id_empresa,
        nombreFormateado,
        category || 'MARKETING',
        language || 'es',
        components
      );

      // 2. Si Meta fue exitoso, guardar en BD con components
      let plantilla;
      try {
        plantilla = await plantillaWhatsappRepository.create({
          name: nombreFormateado,
          status: resultMeta.status || 'PENDING',
          category: category || 'MARKETING',
          language: language || 'es',
          header_type,
          header_text,
          footer,
          components,
          id_empresa,
          meta_template_id: resultMeta.id ? String(resultMeta.id) : null,
          id_formato: id_formato || null,
          usuario_registro
        });
        logger.info(`[plantillaWhatsapp.controller.js] Plantilla creada en Meta y BD: ${nombreFormateado}`);
      } catch (dbError) {
        logger.error(`[plantillaWhatsapp.controller.js] Plantilla creada en Meta (${resultMeta.id}) pero falló en BD: ${dbError.message}`);
        return res.status(201).json({
          success: true,
          msg: "Plantilla creada en Meta pero no se guardó en BD. Usa 'Sincronizar con Meta' para importarla.",
          data: { meta_id: resultMeta.id, status: resultMeta.status, db_error: true }
        });
      }

      return res.status(201).json({
        success: true,
        msg: "Plantilla creada exitosamente. Pendiente de aprobación por Meta.",
        data: {
          id: plantilla.id,
          meta_id: resultMeta.id,
          status: resultMeta.status,
          category: resultMeta.category
        }
      });
    } catch (error) {
      logger.error(`[plantillaWhatsapp.controller.js] Error al crear plantilla: ${error.message}`);

      // Extraer mensaje de error de Meta si existe
      const errorMsg = error.response?.data?.error?.message || error.message || "Error al crear plantilla";
      return res.status(500).json({ success: false, msg: errorMsg });
    }
  }

  /**
   * Actualiza plantilla: primero en Meta, luego en BD si es exitoso
   * NOTA: Solo se pueden editar plantillas APPROVED o REJECTED en Meta
   */
  async updatePlantilla(req, res) {
    try {
      const { id } = req.params;
      const { name, category, language, header_type, header_text, body, footer, buttons, meta_template_id, id_formato } = req.body;
      const id_empresa = req.user?.idEmpresa || null;
      const usuario_actualizacion = req.user?.userId || null;

      if (!id_empresa) {
        return res.status(400).json({ msg: "ID de empresa requerido" });
      }

      if (!name || !body) {
        return res.status(400).json({ msg: "El nombre y contenido son requeridos" });
      }

      // Obtener plantilla actual para verificar que existe
      const plantillaActual = await plantillaWhatsappRepository.findById(id);
      if (!plantillaActual) {
        return res.status(404).json({ msg: "Plantilla no encontrada" });
      }

      // Construir componentes para Meta
      const components = whatsappGraphService.convertirDatosAComponentes({
        header_type,
        header_text,
        body,
        footer,
        buttons
      });

      // 1. Editar en Meta (necesitamos el template_id de Meta)
      if (meta_template_id) {
        try {
          await whatsappGraphService.editarPlantilla(id_empresa, meta_template_id, components);
        } catch (metaError) {
          const errorMsg = metaError.response?.data?.error?.message || metaError.message;
          // Si el error es porque está PENDING, avisar al usuario
          if (errorMsg.includes('PENDING')) {
            return res.status(400).json({
              success: false,
              msg: "No se puede editar una plantilla en estado PENDING. Espere a que sea aprobada o rechazada."
            });
          }
          throw metaError;
        }
      }

      // 2. Actualizar en BD con components (status pasa a PENDING tras edición en Meta)
      const [updated] = await plantillaWhatsappRepository.update(id, {
        name: name.toLowerCase().replace(/\s+/g, '_'),
        status: 'PENDING',
        category,
        language,
        header_type,
        header_text,
        footer,
        components,
        meta_template_id: meta_template_id ? String(meta_template_id) : null,
        id_formato: id_formato || null,
        usuario_actualizacion
      });

      if (!updated) {
        return res.status(404).json({ msg: "Plantilla no encontrada" });
      }

      logger.info(`[plantillaWhatsapp.controller.js] Plantilla actualizada: ${id}`);

      return res.status(200).json({
        success: true,
        msg: "Plantilla actualizada exitosamente"
      });
    } catch (error) {
      logger.error(`[plantillaWhatsapp.controller.js] Error al actualizar plantilla: ${JSON.stringify(error.response?.data || error.message)}`);
      const errorMsg = error.response?.data?.error?.message || error.message || "Error al actualizar plantilla";
      return res.status(500).json({ success: false, msg: errorMsg });
    }
  }

  /**
   * Elimina plantilla: primero en Meta, luego en BD si es exitoso
   */
  async deletePlantilla(req, res) {
    try {
      const { id } = req.params;
      const id_empresa = req.user?.idEmpresa || null;

      if (!id_empresa) {
        return res.status(400).json({ msg: "ID de empresa requerido" });
      }

      // Obtener plantilla para saber el nombre
      const plantilla = await plantillaWhatsappRepository.findById(id);
      if (!plantilla) {
        return res.status(404).json({ msg: "Plantilla no encontrada" });
      }

      // 1. Eliminar en Meta
      try {
        await whatsappGraphService.eliminarPlantilla(id_empresa, plantilla.name);
      } catch (metaError) {
        logger.error(`[plantillaWhatsapp.controller.js] Error eliminando en Meta: ${metaError.message}`);
        // Si falla en Meta, igual eliminamos de BD (puede que ya no exista en Meta)
      }

      // 2. Eliminar en BD (soft delete)
      const [deleted] = await plantillaWhatsappRepository.delete(id);

      if (!deleted) {
        return res.status(404).json({ msg: "Plantilla no encontrada" });
      }

      logger.info(`[plantillaWhatsapp.controller.js] Plantilla eliminada: ${plantilla.name}`);

      return res.status(200).json({
        success: true,
        msg: "Plantilla eliminada exitosamente"
      });
    } catch (error) {
      logger.error(`[plantillaWhatsapp.controller.js] Error al eliminar plantilla: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar plantilla" });
    }
  }

  /**
   * Envía una plantilla a un número de teléfono
   */
  async enviarPlantilla(req, res) {
    try {
      const { phone, template_name, language, components } = req.body;
      const id_empresa = req.user?.idEmpresa || null;

      if (!id_empresa) {
        return res.status(400).json({ msg: "ID de empresa requerido" });
      }

      if (!phone || !template_name) {
        return res.status(400).json({ msg: "El teléfono y nombre de plantilla son requeridos" });
      }

      // Normalizar celular (sin prefijo de país)
      const celularNorm = normalizarCelular(phone);

      // Obtener plantilla de BD para registrar el body real
      const plantillaBd = await plantillaWhatsappRepository.findByName(template_name, id_empresa);

      const result = await whatsappGraphService.enviarPlantilla(
        id_empresa,
        celularNorm,
        template_name,
        language || 'es',
        components || []
      );

      res.status(200).json({
        success: true,
        msg: "Plantilla enviada correctamente",
        data: result.response
      });

      // Crear chat si no existe y guardar mensaje saliente
      try {
        let persona = await Persona.selectByCelular(celularNorm, id_empresa);
        if (!persona) {
          const usuarioInstance = new Usuario();
          const asesores = await usuarioInstance.getByRol(3);
          const ids = asesores.map(a => a.id);

          const ultimoAsignacion = await Persona.getAsignacionesAsesor();

          let id_asesor = null;
          if (ids.length > 0) {
              if (ultimoAsignacion?.id_usuario) {
                  const indice = (ids.indexOf(ultimoAsignacion.id_usuario) + 1) % ids.length;
                  id_asesor = ids[indice];
              } else {
                  id_asesor = ids[0];
              }
          }

          persona = await Persona.createPersona({
              id_estado: 1,
              celular: celularNorm,
              id_usuario: id_asesor,
              id_empresa: id_empresa,
              usuario_registro: null
          });
        }

        let chat = await Chat.findByPersona(persona.id);
        if (!chat) {
          const chatId = await Chat.create({
            id_empresa,
            id_persona: persona.id,
            usuario_registro: null
          });
          chat = { id: chatId };
        }

        // Reemplazar {{1}}, {{2}}, etc. con los valores reales enviados
        let contenidoMensaje = extraerBodyDeComponents(plantillaBd?.components) || template_name;
        const bodyComp = (components || []).find(c => c.type === 'body');
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
        logger.error(`[plantillaWhatsapp.controller.js] Error al crear chat/mensaje: ${chatError.message}`);
      }

    } catch (error) {
      logger.error(`[plantillaWhatsapp.controller.js] Error al enviar plantilla: ${error.message}`);
      const errorMsg = error.response?.data?.error?.message || error.message || "Error al enviar plantilla";
      return res.status(500).json({ success: false, msg: errorMsg });
    }
  }
}

module.exports = new PlantillaWhatsappController();
