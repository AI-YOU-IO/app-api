const EmpresaModel = require("../models/empresa.model.js");
const UsuarioModel = require("../models/usuario.model.js");
const logger = require('../config/logger/loggerClient.js');

class AdminController {
  // ==================== EMPRESAS ====================
  async getEmpresas(req, res) {
    try {
      const empresaModel = new EmpresaModel();
      const empresas = await empresaModel.getAll();
      return res.success(200, 'Empresas obtenidas correctamente', empresas);
    } catch (error) {
      logger.error(`[admin.controller.js] Error al obtener empresas: ${error.message}`);
      return res.serverError(500, 'Error al obtener empresas');
    }
  }

  async getEmpresaById(req, res) {
    try {
      const { id } = req.params;
      const empresaModel = new EmpresaModel();
      const empresa = await empresaModel.getById(id);
      if (!empresa) {
        return res.clientError(404, 'Empresa no encontrada');
      }
      return res.success(200, 'Empresa obtenida correctamente', empresa);
    } catch (error) {
      logger.error(`[admin.controller.js] Error al obtener empresa: ${error.message}`);
      return res.serverError(500, 'Error al obtener empresa');
    }
  }

  async createEmpresa(req, res) {
    try {
      const { userId } = req.user || {};
      const empresaModel = new EmpresaModel();
      const id = await empresaModel.create({ ...req.body, usuario_registro: userId });
      return res.success(201, 'Empresa creada exitosamente', { id });
    } catch (error) {
      logger.error(`[admin.controller.js] Error al crear empresa: ${error.message}`);
      return res.serverError(500, 'Error al crear empresa');
    }
  }

  async updateEmpresa(req, res) {
    try {
      const { userId } = req.user || {};
      const { id } = req.params;
      const empresaModel = new EmpresaModel();
      await empresaModel.update(id, { ...req.body, usuario_actualizacion: userId });
      return res.success(200, 'Empresa actualizada exitosamente');
    } catch (error) {
      logger.error(`[admin.controller.js] Error al actualizar empresa: ${error.message}`);
      return res.serverError(500, 'Error al actualizar empresa');
    }
  }

  async updateEmpresaEstado(req, res) {
    try {
      const { userId } = req.user || {};
      const { id } = req.params;
      const { estado } = req.body;
      const empresaModel = new EmpresaModel();
      await empresaModel.updateEstado(id, estado, userId);
      return res.success(200, 'Estado de empresa actualizado exitosamente');
    } catch (error) {
      logger.error(`[admin.controller.js] Error al actualizar estado de empresa: ${error.message}`);
      return res.serverError(500, 'Error al actualizar estado de empresa');
    }
  }

  // ==================== USUARIOS ====================
  async getUsuarios(req, res) {
    try {
      const usuarioModel = new UsuarioModel();
      const usuarios = await usuarioModel.getAll();
      return res.success(200, 'Usuarios obtenidos correctamente', usuarios);
    } catch (error) {
      logger.error(`[admin.controller.js] Error al obtener usuarios: ${error.message}`);
      return res.serverError(500, 'Error al obtener usuarios');
    }
  }

  async getUsuarioById(req, res) {
    try {
      const { id } = req.params;
      const usuarioModel = new UsuarioModel();
      const usuario = await usuarioModel.getById(id);
      if (!usuario) {
        return res.clientError(404, 'Usuario no encontrado');
      }
      return res.success(200, 'Usuario obtenido correctamente', usuario);
    } catch (error) {
      logger.error(`[admin.controller.js] Error al obtener usuario: ${error.message}`);
      return res.serverError(500, 'Error al obtener usuario');
    }
  }

  async createUsuario(req, res) {
    try {
      const { userId } = req.user || {};
      const usuarioModel = new UsuarioModel();
      const id = await usuarioModel.create({ ...req.body, usuario_registro: userId });
      return res.success(201, 'Usuario creado exitosamente', { id });
    } catch (error) {
      logger.error(`[admin.controller.js] Error al crear usuario: ${error.message}`);
      return res.serverError(500, 'Error al crear usuario');
    }
  }

  async updateUsuario(req, res) {
    try {
      const { userId } = req.user || {};
      const { id } = req.params;
      const usuarioModel = new UsuarioModel();
      await usuarioModel.update(id, { ...req.body, usuario_actualizacion: userId });
      return res.success(200, 'Usuario actualizado exitosamente');
    } catch (error) {
      logger.error(`[admin.controller.js] Error al actualizar usuario: ${error.message}`);
      return res.serverError(500, 'Error al actualizar usuario');
    }
  }

  async deleteUsuario(req, res) {
    try {
      const { userId } = req.user || {};
      const { id } = req.params;
      const usuarioModel = new UsuarioModel();
      await usuarioModel.delete(id, userId);
      return res.success(200, 'Usuario eliminado exitosamente');
    } catch (error) {
      logger.error(`[admin.controller.js] Error al eliminar usuario: ${error.message}`);
      return res.serverError(500, 'Error al eliminar usuario');
    }
  }
}

module.exports = new AdminController();
