const PersonaModel = require("../../models/persona.model.js");
const logger = require('../../config/logger/loggerClient.js');

class PersonaController {
  async listAll(req, res) {
    try {
      const { userId, rolId, idEmpresa } = req.user || {};
      const personas = await PersonaModel.getAllByTipoUsuario(userId, rolId, idEmpresa);

      return res.status(200).json({ data: personas });
    } catch (error) {
      logger.error(`[persona.controller.js] Error al listar personas: ${error.message}`);
      return res.status(500).json({ msg: "Error al listar personas" });
    }
  }

  async getById(req, res) {
    try {
      const { id } = req.params;
      const persona = await PersonaModel.getById(id);

      if (!persona) {
        return res.status(404).json({ msg: "Persona no encontrada" });
      }

      return res.status(200).json({ data: persona });
    } catch (error) {
      logger.error(`[persona.controller.js] Error al obtener persona: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener persona" });
    }
  }

  async create(req, res) {
    try {
      const { userId, idEmpresa } = req.user || {};
      const body = { ...req.body };

      // Mapear campos del frontend a columnas reales de BD (mismo mapeo que updatePersona)
      if (body.id_tipificacion_asesor !== undefined) {
        body.id_tipificacion = body.id_tipificacion_asesor;
        delete body.id_tipificacion_asesor;
      }
      if (body.id_asesor !== undefined) {
        body.id_usuario = body.id_asesor;
        delete body.id_asesor;
      }
      if (body.id_plan !== undefined) {
        body.id_catalogo = body.id_plan;
        delete body.id_plan;
      }

      const persona = await PersonaModel.createPersona({ ...body, usuario_registro: userId, id_empresa: idEmpresa });

      return res.status(201).json({ data: persona });
    } catch (error) {
      logger.error(`[persona.controller.js] Error al crear persona: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear persona" });
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const { userId } = req.user || {};

      await PersonaModel.updatePersona(id, { ...req.body, usuario_actualizacion: userId });

      return res.status(200).json({ msg: "Persona actualizada correctamente" });
    } catch (error) {
      logger.error(`[persona.controller.js] Error al actualizar persona: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar persona" });
    }
  }

  async searchByCelular(req, res) {
    try {
      const { celular } = req.params;
      const { idEmpresa } = req.user || {};

      if (!celular) {
        return res.status(400).json({ msg: "El número de celular es requerido" });
      }

      const persona = await PersonaModel.selectByCelular(celular, idEmpresa);

      if (!persona) {
        return res.status(404).json({ msg: "Persona no encontrada" });
      }

      return res.status(200).json({ data: persona });
    } catch (error) {
      logger.error(`[persona.controller.js] Error al buscar persona por celular: ${error.message}`);
      return res.status(500).json({ msg: "Error al buscar persona por celular" });
    }
  }

  async listaNegra(req, res) {
    try {
      const personas = await PersonaModel.getListaNegra();
      return res.status(200).json({ data: personas });
    } catch (error) {
      logger.error(`[persona.controller.js] Error al listar lista negra: ${error.message}`);
      return res.status(500).json({ msg: "Error al listar lista negra" });
    }
  }

  async bulkAssign(req, res) {
    try {
      const { persona_ids, id_asesor } = req.body;
      const { userId } = req.user || {};

      if (!persona_ids || !Array.isArray(persona_ids) || persona_ids.length === 0) {
        return res.status(400).json({ msg: "Debe seleccionar al menos una persona" });
      }

      if (!id_asesor) {
        return res.status(400).json({ msg: "Debe seleccionar un asesor" });
      }

      for (const personaId of persona_ids) {
        await PersonaModel.updatePersona(personaId, { id_usuario: id_asesor, usuario_actualizacion: userId });
      }

      logger.info(`[persona.controller.js] Asignación masiva: ${persona_ids.length} personas asignadas al asesor ${id_asesor}`);
      return res.status(200).json({ msg: `${persona_ids.length} personas asignadas correctamente` });
    } catch (error) {
      logger.error(`[persona.controller.js] Error en asignación masiva: ${error.message}`);
      return res.status(500).json({ msg: "Error al asignar asesores" });
    }
  }
}

module.exports = new PersonaController();
