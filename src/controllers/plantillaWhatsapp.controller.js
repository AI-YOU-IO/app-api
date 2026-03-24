const plantillaWhatsappRepository = require("../repositories/plantillaWhatsapp.repository.js");
const whatsappGraphService = require("../services/whatsapp/whatsappGraph.service.js");
const logger = require('../config/logger/loggerClient.js');
const Usuario = require("../models/usuario.model.js");
const Persona = require("../models/persona.model.js");
const Chat = require("../models/chat.model.js");
const Mensaje = require("../models/mensaje.model.js");

class PlantillaWhatsappController {
  /**
   * Obtiene plantillas desde Meta Graph API
   * El listado siempre viene de Meta para tener datos actualizados (status, quality_score, etc)
   */
  async getPlantillas(req, res) {
    try {
      const idEmpresa = req.user?.idEmpresa || null;
      const { status, limit } = req.query;

      if (!idEmpresa) {
        return res.status(400).json({ msg: "ID de empresa requerido" });
      }

      // Obtener plantillas desde Meta
      const result = await whatsappGraphService.listarPlantillas(idEmpresa, { status, limit });

      // Obtener datos locales para enriquecer (id local, url media, etc)
      const plantillasLocales = await plantillaWhatsappRepository.findAll(idEmpresa);
      const mapaLocal = {};
      for (const p of plantillasLocales) {
        mapaLocal[p.name] = {
          id_local: p.id,
          url: p.url,
          tipo: p.tipo
        };
      }

      // Enriquecer plantillas de Meta con datos locales
      const templatesEnriquecidos = result.templates.map(template => {
        const local = mapaLocal[template.name];
        if (local) {
          return {
            ...template,
            id_local: local.id_local,
            media_url: local.url,
            media_tipo: local.tipo
          };
        }
        return template;
      });

      return res.status(200).json({
        success: true,
        data: {
          templates: templatesEnriquecidos,
          total: result.total,
          waba_id: result.waba_id
        }
      });
    } catch (error) {
      logger.error(`[plantillaWhatsapp.controller.js] Error al obtener plantillas: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener plantillas" });
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
      const { name, category, language, header_type, header_text, body, footer, buttons } = req.body;
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

      // 2. Si Meta fue exitoso, guardar en BD (incluir meta_template_id)
      const plantilla = await plantillaWhatsappRepository.create({
        name: nombreFormateado,
        status: resultMeta.status || 'PENDING',
        category: category || 'MARKETING',
        language: language || 'es',
        header_type,
        header_text,
        body,
        footer,
        buttons: buttons || [],
        id_empresa,
        meta_template_id: resultMeta.id ? String(resultMeta.id) : null,
        usuario_registro
      });

      logger.info(`[plantillaWhatsapp.controller.js] Plantilla creada en Meta y BD: ${nombreFormateado}`);

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
      const { name, category, language, header_type, header_text, body, footer, buttons, meta_template_id } = req.body;
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

      // 2. Actualizar en BD
      const [updated] = await plantillaWhatsappRepository.update(id, {
        name: name.toLowerCase().replace(/\s+/g, '_'),
        category,
        language,
        header_type,
        header_text,
        body,
        footer,
        buttons: buttons || [],
        meta_template_id: meta_template_id ? String(meta_template_id) : null,
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
      logger.error(`[plantillaWhatsapp.controller.js] Error al actualizar plantilla: ${error.message}`);
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

      const result = await whatsappGraphService.enviarPlantilla(
        id_empresa,
        phone,
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
        const persona = await Persona.selectByCelular(phone, id_empresa);
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
              celular: phone,
              id_usuario: id_asesor,
              id_empresa: id_empresa,
              usuario_registro: null
          });
        }
        
        let chat = await Chat.findByPersona(persona.id);
        if (!chat) {
          chat = await Chat.create({
            id_empresa,
            id_persona: persona.id,
            usuario_registro: null
          });
        }

        await Mensaje.create({
          id_chat: chat.id || chat,
          contenido: `Hola soy Lili, aqui te comparto el link de operación: ${template_name}`,
          direccion: "out",
          wid_mensaje: null,
          tipo_mensaje: "texto",
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
