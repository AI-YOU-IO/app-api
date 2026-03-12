const TipificacionLlamadaModel = require("../models/tipificacion_llamada.model");
const logger = require('../config/logger/loggerClient.js');

class TipificacionLlamadaController {
  async getAllTipificacion(req, res) {
    try {
      const { idEmpresa } = req.user || {};

      const tipificacion = await TipificacionLlamadaModel.getAll(idEmpresa);

      if (!tipificacion) {
        return res.status(404).json({ msg: "Tipificación no encontrada" });
      }

      return res.status(200).json({ data: tipificacion });
    } catch (error) {
      logger.error(`[tipificacion_llamadas.controller.js] Error al obtener tipificación: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipificación" });
    }
  }

  async getAllAsTree(req, res) {
    try {
      const { idEmpresa } = req.user || {};

      const tipificaciones = await TipificacionLlamadaModel.getAllAsTree(idEmpresa);

      return res.status(200).json({ data: tipificaciones });
    } catch (error) {
      logger.error(`[tipificacion_llamadas.controller.js] Error al obtener árbol de tipificaciones: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener árbol de tipificaciones" });
    }
  }

  async getTipificacionById(req, res) {
    try {
      const { id } = req.params;

      const tipificacion = await TipificacionLlamadaModel.getById(id);

      if (!tipificacion) {
        return res.status(404).json({ msg: "Tipificación no encontrada" });
      }

      return res.status(200).json({ data: tipificacion });
    } catch (error) {
      logger.error(`[tipificacion_llamadas.controller.js] Error al obtener tipificación: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipificación" });
    }
  }

  async getByPadre(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { id_padre } = req.params;

      const hijos = await TipificacionLlamadaModel.getByPadre(id_padre, idEmpresa);

      return res.status(200).json({ data: hijos });
    } catch (error) {
      logger.error(`[tipificacion_llamadas.controller.js] Error al obtener hijos: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener hijos de tipificación" });
    }
  }

  async getRaices(req, res) {
    try {
      const { idEmpresa } = req.user || {};

      const raices = await TipificacionLlamadaModel.getRaices(idEmpresa);

      return res.status(200).json({ data: raices });
    } catch (error) {
      logger.error(`[tipificacion_llamadas.controller.js] Error al obtener raíces: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipificaciones raíz" });
    }
  }

  async createTipificacion(req, res) {
    try {
      const { idEmpresa, userId } = req.user || {};
      const { nombre, descripcion, orden, color, id_padre } = req.body;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      const id = await TipificacionLlamadaModel.create({
        nombre,
        descripcion,
        orden,
        color,
        id_padre: id_padre || null,
        id_empresa: idEmpresa,
        usuario_registro: userId
      });

      return res.status(201).json({ msg: "Tipificación creada exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[tipificacion_llamadas.controller.js] Error al crear tipificación: ${error.message}`);

      if (error.message.includes('5 niveles')) {
        return res.status(400).json({ msg: error.message });
      }

      return res.status(500).json({ msg: "Error al crear tipificación" });
    }
  }

  async updateTipificacion(req, res) {
    try {
      const { idEmpresa, userId } = req.user || {};
      const { id } = req.params;
      const { nombre, descripcion, orden, color, id_padre } = req.body;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      // Validar que no se asigne como padre a sí mismo
      if (id_padre && parseInt(id_padre) === parseInt(id)) {
        return res.status(400).json({ msg: "Una tipificación no puede ser su propio padre" });
      }

      await TipificacionLlamadaModel.update(id, {
        nombre,
        descripcion,
        orden,
        color,
        id_padre,
        usuario_actualizacion: userId
      }, idEmpresa);

      return res.status(200).json({ msg: "Tipificación actualizada exitosamente" });
    } catch (error) {
      logger.error(`[tipificacion_llamadas.controller.js] Error al actualizar tipificación: ${error.message}`);

      if (error.message.includes('5 niveles')) {
        return res.status(400).json({ msg: error.message });
      }

      return res.status(500).json({ msg: "Error al actualizar tipificación" });
    }
  }

  async deleteTipificacion(req, res) {
    try {
      const { idEmpresa, userId } = req.user || {};
      const { id } = req.params;

      await TipificacionLlamadaModel.delete(id, idEmpresa, userId);
      return res.status(200).json({ msg: "Tipificación eliminada exitosamente" });
    } catch (error) {
      logger.error(`[tipificacion_llamadas.controller.js] Error al eliminar tipificación: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar tipificación" });
    }
  }
}

module.exports = new TipificacionLlamadaController();