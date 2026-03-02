const TipificacionLlamadaModel = require("../models/tipificacion_llamada.model ");
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
      logger.error(`[configuracion.controller.js] Error al obtener tipificación: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipificación" });
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
      logger.error(`[configuracion.controller.js] Error al obtener tipificación: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipificación" });
    }
  }

  async createTipificacion(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { nombre, descripcion, orden, color } = req.body;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      
      const id = await TipificacionLlamadaModel.create({ nombre, descripcion, orden, color, id_empresa: idEmpresa });

      return res.status(201).json({ msg: "Tipificación creada exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear tipificación: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear tipificación" });
    }
  }

  async updateTipificacion(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { id } = req.params;
      const { nombre, descripcion, orden, color } = req.body;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      await TipificacionLlamadaModel.update(id, { nombre, descripcion, orden, color }, idEmpresa);

      return res.status(200).json({ msg: "Tipificación actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar tipificación: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar tipificación" });
    }
  }

  async deleteTipificacion(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { id } = req.params;
      
      await TipificacionLlamadaModel.delete(id, idEmpresa);
      return res.status(200).json({ msg: "Tipificación eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar tipificación: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar tipificación" });
    }
  }
}

module.exports = new TipificacionLlamadaController();