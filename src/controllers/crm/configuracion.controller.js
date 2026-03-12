const RolModel = require("../../models/rol.model.js");
const UsuarioModel = require("../../models/usuario.model.js");
const ModuloModel = require("../../models/modulo.model.js");
const SucursalModel = require("../../models/sucursal.model.js");
const PlanesTarifariosModel = require("../../models/tblPlanesTarifarios.model.js");
const FaqModel = require("../../models/faq.model.js");
const TipificacionModel = require("../../models/tipificacion.model.js");
const EstadoModel = require("../../models/estado.model.js");
const PreguntaPerfilamientoModel = require("../../models/preguntaPerfilamiento.model.js");
const ArgumentoVentaModel = require("../../models/argumentoVenta.model.js");
const PeriodicidadRecordatorioModel = require("../../models/periodicidadRecordatorio.model.js");
const FormatoModel = require("../../models/formato.model.js");
const FormatoCampoModel = require("../../models/formatoCampo.model.js");
const BaseNumeroModel = require("../../models/baseNumero.model.js");
const BaseNumeroDetalleModel = require("../../models/baseNumeroDetalle.model.js");
const PlantillaModel = require("../../models/plantilla.model.js");
const CampaniaModel = require("../../models/campania.model.js");
const CampaniaBaseNumeroModel = require("../../models/campaniaBaseNumero.model.js");
const CampaniaEjecucionModel = require("../../models/campaniaEjecucion.model.js");
const PromptAsistenteModel = require("../../models/promptAsistente.model.js");
const ConfiguracionCampaniaLlamadaModel = require("../../models/configuracionCampaniaLlamada.model.js");
const TipoPersonaModel = require("../../models/tipoPersona.model.js");
const { pool } = require("../../config/dbConnection.js");
const logger = require('../../config/logger/loggerClient.js');
const xlsx = require('xlsx');
const llamadaService = require('../../services/llamada/llamada.service.js');

class ConfiguracionController {
  // ==================== ROLES ====================
  async getRoles(req, res) {
    try {
      const rolModel = new RolModel();
      const roles = await rolModel.getAll();
      return res.status(200).json({ data: roles });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener roles: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener roles" });
    }
  }

  async getRolById(req, res) {
    try {
      const { id } = req.params;
      const rolModel = new RolModel();
      const rol = await rolModel.getById(id);

      if (!rol) {
        return res.status(404).json({ msg: "Rol no encontrado" });
      }

      // Get modules associated with this role
      const modulos = await rolModel.getModulosByRolId(id);
      rol.modulos = modulos;

      return res.status(200).json({ data: rol });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener rol: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener rol" });
    }
  }

  async createRol(req, res) {
    try {
      const { nombre, descripcion, modulos } = req.body;
      const { userId } = req.user || {};

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      const rolModel = new RolModel();
      const id = await rolModel.create({ nombre, descripcion, usuario_registro: userId });

      // Save modules for this role
      if (modulos && modulos.length > 0) {
        await rolModel.syncModulos(id, modulos);
      }

      return res.status(201).json({ msg: "Rol creado exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear rol: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear rol" });
    }
  }

  async updateRol(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion, modulos } = req.body;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      const { userId } = req.user || {};
      const rolModel = new RolModel();
      await rolModel.update(id, { nombre, descripcion, usuario_actualizacion: userId });

      // Sync modules for this role
      await rolModel.syncModulos(id, modulos || []);

      return res.status(200).json({ msg: "Rol actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar rol: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar rol" });
    }
  }

  async deleteRol(req, res) {
    try {
      const { userId } = req.user || {};
      const { id } = req.params;
      const rolModel = new RolModel();
      await rolModel.delete(id, userId);
      return res.status(200).json({ msg: "Rol eliminado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar rol: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar rol" });
    }
  }

  // ==================== USUARIOS ====================
  async getUsuarios(req, res) {
    try {
      const usuarioModel = new UsuarioModel();
      const usuarios = await usuarioModel.getAll();
      return res.status(200).json({ data: usuarios });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener usuarios: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener usuarios" });
    }
  }

  async getUsuarioById(req, res) {
    try {
      const { id } = req.params;
      const usuarioModel = new UsuarioModel();
      const usuario = await usuarioModel.getById(id);

      if (!usuario) {
        return res.status(404).json({ msg: "Usuario no encontrado" });
      }

      delete usuario.password;
      return res.status(200).json({ data: usuario });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener usuario: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener usuario" });
    }
  }

  async createUsuario(req, res) {
    try {
      const { id_rol, username, password, id_sucursal, id_padre } = req.body;
      const { idEmpresa } = req.user || {};

      if (!username || !password || !id_rol) {
        return res.status(400).json({ msg: "Username, password y rol son requeridos" });
      }

      const usuarioModel = new UsuarioModel();

      const exists = await usuarioModel.existsUsername(username);
      if (exists) {
        return res.status(400).json({ msg: "El username ya existe" });
      }

      const { userId } = req.user || {};
      const id = await usuarioModel.create({
        id_rol,
        username,
        password,
        id_sucursal,
        id_padre,
        id_empresa: idEmpresa,
        usuario_registro: userId
      });

      return res.status(201).json({ msg: "Usuario creado exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear usuario: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear usuario" });
    }
  }

  async updateUsuario(req, res) {
    try {
      const { id } = req.params;
      const { id_rol, username, password, id_sucursal, id_padre } = req.body;
      const { idEmpresa } = req.user || {};

      if (!username || !id_rol) {
        return res.status(400).json({ msg: "Username y rol son requeridos" });
      }

      const usuarioModel = new UsuarioModel();

      const exists = await usuarioModel.existsUsername(username, id);
      if (exists) {
        return res.status(400).json({ msg: "El username ya existe" });
      }

      const { userId } = req.user || {};
      await usuarioModel.update(id, {
        id_rol,
        username,
        password,
        id_sucursal,
        id_padre,
        id_empresa: idEmpresa,
        usuario_actualizacion: userId
      });

      return res.status(200).json({ msg: "Usuario actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar usuario: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar usuario" });
    }
  }

  async deleteUsuario(req, res) {
    try {
      const { userId } = req.user || {};
      const { id } = req.params;
      const usuarioModel = new UsuarioModel();
      await usuarioModel.delete(id, userId);
      return res.status(200).json({ msg: "Usuario eliminado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar usuario: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar usuario" });
    }
  }

  async getUsuariosByRol(req, res) {
    try {
      const { idRol } = req.params;
      const usuarioModel = new UsuarioModel();
      const usuarios = await usuarioModel.getByRol(idRol);
      return res.status(200).json({ data: usuarios });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener usuarios por rol: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener usuarios por rol" });
    }
  }

  async changePassword(req, res) {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ msg: "La contraseña actual y nueva son requeridas" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ msg: "La nueva contraseña debe tener al menos 6 caracteres" });
      }

      const usuarioModel = new UsuarioModel();

      // Verificar contraseña actual
      const isValid = await usuarioModel.verifyPassword(id, currentPassword);
      if (!isValid) {
        return res.status(400).json({ msg: "La contraseña actual es incorrecta" });
      }

      // Actualizar contraseña
      await usuarioModel.updatePassword(id, newPassword);

      return res.status(200).json({ msg: "Contraseña actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al cambiar contraseña: ${error.message}`);
      return res.status(500).json({ msg: "Error al cambiar la contraseña" });
    }
  }

  // ==================== MÓDULOS ====================
  async getModulos(req, res) {
    try {
      const moduloModel = new ModuloModel();
      const modulos = await moduloModel.getAll();
      return res.status(200).json({ data: modulos });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener módulos: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener módulos" });
    }
  }

  async getModuloById(req, res) {
    try {
      const { id } = req.params;
      const moduloModel = new ModuloModel();
      const modulo = await moduloModel.getById(id);

      if (!modulo) {
        return res.status(404).json({ msg: "Módulo no encontrado" });
      }

      return res.status(200).json({ data: modulo });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener módulo: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener módulo" });
    }
  }

  async createModulo(req, res) {
    try {
      const { nombre, ruta } = req.body;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      const { userId } = req.user || {};
      const moduloModel = new ModuloModel();
      const id = await moduloModel.create({ nombre, ruta, usuario_registro: userId });

      return res.status(201).json({ msg: "Módulo creado exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear módulo: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear módulo" });
    }
  }

  async updateModulo(req, res) {
    try {
      const { id } = req.params;
      const { nombre, ruta } = req.body;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      const { userId } = req.user || {};
      const moduloModel = new ModuloModel();
      await moduloModel.update(id, { nombre, ruta, usuario_actualizacion: userId });

      return res.status(200).json({ msg: "Módulo actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar módulo: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar módulo" });
    }
  }

  async deleteModulo(req, res) {
    try {
      const { userId } = req.user || {};
      const { id } = req.params;
      const moduloModel = new ModuloModel();
      await moduloModel.delete(id, userId);
      return res.status(200).json({ msg: "Módulo eliminado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar módulo: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar módulo" });
    }
  }

  // ==================== SUCURSALES ====================
  async getSucursales(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const sucursalModel = new SucursalModel();
      const sucursales = await sucursalModel.getAll(idEmpresa);
      return res.status(200).json({ data: sucursales });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener sucursales: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener sucursales" });
    }
  }

  async getSucursalById(req, res) {
    try {
      const { id } = req.params;
      const sucursalModel = new SucursalModel();
      const sucursal = await sucursalModel.getById(id);

      if (!sucursal) {
        return res.status(404).json({ msg: "Sucursal no encontrada" });
      }

      return res.status(200).json({ data: sucursal });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener sucursal: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener sucursal" });
    }
  }

  async createSucursal(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { nombre, direccion, telefono, email } = req.body;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      const { userId } = req.user || {};
      const sucursalModel = new SucursalModel();
      const id = await sucursalModel.create({ nombre, direccion, telefono, email, id_empresa: idEmpresa, usuario_registro: userId });

      return res.status(201).json({ msg: "Sucursal creada exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear sucursal: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear sucursal" });
    }
  }

  async updateSucursal(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { id } = req.params;
      const { nombre, direccion, telefono, email } = req.body;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      const { userId } = req.user || {};
      const sucursalModel = new SucursalModel();
      await sucursalModel.update(id, { nombre, direccion, telefono, email, id_empresa: idEmpresa, usuario_actualizacion: userId });

      return res.status(200).json({ msg: "Sucursal actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar sucursal: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar sucursal" });
    }
  }

  async deleteSucursal(req, res) {
    try {
      const { idEmpresa, userId } = req.user || {};
      const { id } = req.params;
      const sucursalModel = new SucursalModel();
      await sucursalModel.delete(id, idEmpresa, userId);
      return res.status(200).json({ msg: "Sucursal eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar sucursal: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar sucursal" });
    }
  }

  // ==================== CATÁLOGO ====================
  async getCatalogo(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const planModel = new PlanesTarifariosModel();
      const planes = await planModel.getAll(idEmpresa);
      return res.status(200).json({ data: planes });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener catálogo: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener catálogo" });
    }
  }

  async getCatalogoById(req, res) {
    try {
      const { id } = req.params;
      const planModel = new PlanesTarifariosModel();
      const plan = await planModel.getById(id);

      if (!plan) {
        return res.status(404).json({ msg: "Item no encontrado" });
      }

      return res.status(200).json({ data: plan });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener item del catálogo: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener item del catálogo" });
    }
  }

  async createCatalogo(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { nombre, descripcion } = req.body;

      // Convertir tipos de FormData (llegan como strings)
      const precio_regular = req.body.precio_regular ? parseFloat(req.body.precio_regular) : null;
      const precio_promocional = req.body.precio_promocional ? parseFloat(req.body.precio_promocional) : null;
      const principal = req.body.principal === '1' || req.body.principal === 1 ? 1 : 0;

      // Manejar imagen subida
      let imagen_url = req.body.imagen_url || null;
      if (req.file) {
        imagen_url = `/uploads/catalogo/${req.file.filename}`;
      }

      if (!nombre || !precio_regular) {
        return res.status(400).json({ msg: "El nombre y precio regular son requeridos" });
      }

      const { userId } = req.user || {};
      const planModel = new PlanesTarifariosModel();
      const id = await planModel.create({
        nombre,
        precio_regular,
        precio_promocional,
        descripcion,
        principal,
        imagen_url,
        estado_registro: 1,
        id_empresa: idEmpresa,
        usuario_registro: userId
      });

      return res.status(201).json({ msg: "Item creado exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear item del catálogo: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear item del catálogo" });
    }
  }

  async updateCatalogo(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion } = req.body;

      // Convertir tipos de FormData (llegan como strings)
      const precio_regular = req.body.precio_regular ? parseFloat(req.body.precio_regular) : null;
      const precio_promocional = req.body.precio_promocional ? parseFloat(req.body.precio_promocional) : null;
      const principal = req.body.principal === '1' || req.body.principal === 1 ? 1 : 0;

      // Manejar imagen subida
      let imagen_url = req.body.imagen_url || null;
      if (req.file) {
        imagen_url = `/uploads/catalogo/${req.file.filename}`;
      }

      if (!nombre || !precio_regular) {
        return res.status(400).json({ msg: "El nombre y precio regular son requeridos" });
      }

      const { userId } = req.user || {};
      const planModel = new PlanesTarifariosModel();
      await planModel.update(id, {
        nombre,
        precio_regular,
        precio_promocional,
        descripcion,
        principal,
        imagen_url,
        usuario_actualizacion: userId
      });

      return res.status(200).json({ msg: "Item actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar item del catálogo: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar item del catálogo" });
    }
  }

  async deleteCatalogo(req, res) {
    try {
      const { userId } = req.user || {};
      const { id } = req.params;
      const planModel = new PlanesTarifariosModel();
      await planModel.softDelete(id, userId);
      return res.status(200).json({ msg: "Item eliminado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar item del catálogo: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar item del catálogo" });
    }
  }

  // ==================== PREGUNTAS FRECUENTES ====================
  async getFaqs(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const faqModel = new FaqModel();
      const faqs = await faqModel.getAll(idEmpresa);
      return res.status(200).json({ data: faqs });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener FAQs: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener preguntas frecuentes" });
    }
  }

  async getFaqById(req, res) {
    try {
      const { id } = req.params;
      const faqModel = new FaqModel();
      const faq = await faqModel.getById(id);

      if (!faq) {
        return res.status(404).json({ msg: "Pregunta frecuente no encontrada" });
      }

      return res.status(200).json({ data: faq });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener FAQ: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener pregunta frecuente" });
    }
  }

  async createFaq(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { numero, pregunta, proceso, respuesta, activo } = req.body;

      if (!pregunta || !respuesta || !proceso) {
        return res.status(400).json({ msg: "La pregunta, respuesta y proceso son requeridos" });
      }

      const { userId } = req.user || {};
      const faqModel = new FaqModel();
      const id = await faqModel.create({ numero, pregunta, proceso, respuesta, activo, id_empresa: idEmpresa, usuario_registro: userId });

      return res.status(201).json({ msg: "Pregunta frecuente creada exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear FAQ: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear pregunta frecuente" });
    }
  }

  async updateFaq(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { id } = req.params;
      const { numero, pregunta, proceso, respuesta, activo } = req.body;

      if (!pregunta || !respuesta || !proceso) {
        return res.status(400).json({ msg: "La pregunta, respuesta y proceso son requeridos" });
      }

      const { userId } = req.user || {};
      const faqModel = new FaqModel();
      await faqModel.update(id, { numero, pregunta, proceso, respuesta, activo, id_empresa: idEmpresa, usuario_actualizacion: userId });

      return res.status(200).json({ msg: "Pregunta frecuente actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar FAQ: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar pregunta frecuente" });
    }
  }

  async deleteFaq(req, res) {
    try {
      const { idEmpresa, userId } = req.user || {};
      const { id } = req.params;
      const faqModel = new FaqModel();
      await faqModel.delete(id, idEmpresa, userId);
      return res.status(200).json({ msg: "Pregunta frecuente eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar FAQ: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar pregunta frecuente" });
    }
  }

  // ==================== TIPIFICACIONES ====================
  async getTipificaciones(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const tipificacionModel = new TipificacionModel();
      const tipificaciones = await tipificacionModel.getAll(idEmpresa);
      return res.status(200).json({ data: tipificaciones });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener tipificaciones: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipificaciones" });
    }
  }

  async getTipificacionById(req, res) {
    try {
      const { id } = req.params;
      const tipificacionModel = new TipificacionModel();
      const tipificacion = await tipificacionModel.getById(id);

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
      const { nombre, definicion, orden, color, flag_asesor, flag_bot, id_padre } = req.body;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      const { userId } = req.user || {};
      const tipificacionModel = new TipificacionModel();
      const id = await tipificacionModel.create({ nombre, definicion, orden, color, flag_asesor, flag_bot, id_empresa: idEmpresa, id_padre, usuario_registro: userId });

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
      const { nombre, definicion, orden, color, flag_asesor, flag_bot, id_padre } = req.body;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      const { userId } = req.user || {};
      const tipificacionModel = new TipificacionModel();
      await tipificacionModel.update(id, { nombre, definicion, orden, color, flag_asesor, flag_bot, id_empresa: idEmpresa, id_padre, usuario_actualizacion: userId });

      return res.status(200).json({ msg: "Tipificación actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar tipificación: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar tipificación" });
    }
  }

  async deleteTipificacion(req, res) {
    try {
      const { idEmpresa, userId } = req.user || {};
      const { id } = req.params;
      const tipificacionModel = new TipificacionModel();
      await tipificacionModel.delete(id, idEmpresa, userId);
      return res.status(200).json({ msg: "Tipificación eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar tipificación: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar tipificación" });
    }
  }

  // ==================== ESTADOS ====================
  async getEstados(req, res) {
    try {
      const estadoModel = new EstadoModel();
      const estados = await estadoModel.getAll();
      return res.status(200).json({ data: estados });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener estados: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener estados" });
    }
  }

  async getEstadoById(req, res) {
    try {
      const { id } = req.params;
      const estadoModel = new EstadoModel();
      const estado = await estadoModel.getById(id);

      if (!estado) {
        return res.status(404).json({ msg: "Estado no encontrado" });
      }

      return res.status(200).json({ data: estado });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener estado: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener estado" });
    }
  }

  async updateEstadoColor(req, res) {
    try {
      const { id } = req.params;
      const { color } = req.body;

      const estadoModel = new EstadoModel();

      const estado = await estadoModel.getById(id);
      if (!estado) {
        return res.status(404).json({ msg: "Estado no encontrado" });
      }

      await estadoModel.updateColor(id, color);

      return res.status(200).json({ msg: "Color del estado actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar color del estado: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar color del estado" });
    }
  }

  // ==================== PREGUNTAS DE PERFILAMIENTO ====================
  async getPreguntasPerfilamiento(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const preguntaModel = new PreguntaPerfilamientoModel();
      const preguntas = await preguntaModel.getAll(idEmpresa);
      return res.status(200).json({ data: preguntas });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener preguntas de perfilamiento: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener preguntas de perfilamiento" });
    }
  }

  async getPreguntaPerfilamientoById(req, res) {
    try {
      const { id } = req.params;
      const preguntaModel = new PreguntaPerfilamientoModel();
      const pregunta = await preguntaModel.getById(id);

      if (!pregunta) {
        return res.status(404).json({ msg: "Pregunta de perfilamiento no encontrada" });
      }

      return res.status(200).json({ data: pregunta });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener pregunta de perfilamiento: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener pregunta de perfilamiento" });
    }
  }

  async createPreguntaPerfilamiento(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { pregunta, orden } = req.body;

      if (!pregunta) {
        return res.status(400).json({ msg: "La pregunta es requerida" });
      }

      const { userId } = req.user || {};
      const preguntaModel = new PreguntaPerfilamientoModel();
      const id = await preguntaModel.create({ pregunta, orden, id_empresa: idEmpresa, usuario_registro: userId });

      return res.status(201).json({ msg: "Pregunta de perfilamiento creada exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear pregunta de perfilamiento: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear pregunta de perfilamiento" });
    }
  }

  async updatePreguntaPerfilamiento(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { id } = req.params;
      const { pregunta, orden } = req.body;

      if (!pregunta) {
        return res.status(400).json({ msg: "La pregunta es requerida" });
      }

      const { userId } = req.user || {};
      const preguntaModel = new PreguntaPerfilamientoModel();
      await preguntaModel.update(id, { pregunta, orden, id_empresa: idEmpresa, usuario_actualizacion: userId });

      return res.status(200).json({ msg: "Pregunta de perfilamiento actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar pregunta de perfilamiento: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar pregunta de perfilamiento" });
    }
  }

  async deletePreguntaPerfilamiento(req, res) {
    try {
      const { idEmpresa, userId } = req.user || {};
      const { id } = req.params;
      const preguntaModel = new PreguntaPerfilamientoModel();
      await preguntaModel.delete(id, idEmpresa, userId);
      return res.status(200).json({ msg: "Pregunta de perfilamiento eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar pregunta de perfilamiento: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar pregunta de perfilamiento" });
    }
  }

  // ==================== ARGUMENTOS DE VENTA ====================
  async getArgumentosVenta(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const argumentoModel = new ArgumentoVentaModel();
      const argumentos = await argumentoModel.getAll(idEmpresa);
      return res.status(200).json({ data: argumentos });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener argumentos de venta: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener argumentos de venta" });
    }
  }

  async getArgumentoVentaById(req, res) {
    try {
      const { id } = req.params;
      const argumentoModel = new ArgumentoVentaModel();
      const argumento = await argumentoModel.getById(id);

      if (!argumento) {
        return res.status(404).json({ msg: "Argumento de venta no encontrado" });
      }

      return res.status(200).json({ data: argumento });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener argumento de venta: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener argumento de venta" });
    }
  }

  async createArgumentoVenta(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { titulo, argumento } = req.body;

      if (!titulo || !argumento) {
        return res.status(400).json({ msg: "El título y argumento son requeridos" });
      }

      const { userId } = req.user || {};
      const argumentoModel = new ArgumentoVentaModel();
      const id = await argumentoModel.create({ titulo, argumento, id_empresa: idEmpresa, usuario_registro: userId });

      return res.status(201).json({ msg: "Argumento de venta creado exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear argumento de venta: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear argumento de venta" });
    }
  }

  async updateArgumentoVenta(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { id } = req.params;
      const { titulo, argumento } = req.body;

      if (!titulo || !argumento) {
        return res.status(400).json({ msg: "El título y argumento son requeridos" });
      }

      const { userId } = req.user || {};
      const argumentoModel = new ArgumentoVentaModel();
      await argumentoModel.update(id, { titulo, argumento, id_empresa: idEmpresa, usuario_actualizacion: userId });

      return res.status(200).json({ msg: "Argumento de venta actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar argumento de venta: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar argumento de venta" });
    }
  }

  async deleteArgumentoVenta(req, res) {
    try {
      const { idEmpresa, userId } = req.user || {};
      const { id } = req.params;
      const argumentoModel = new ArgumentoVentaModel();
      await argumentoModel.delete(id, idEmpresa, userId);
      return res.status(200).json({ msg: "Argumento de venta eliminado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar argumento de venta: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar argumento de venta" });
    }
  }

  // ==================== PERIODICIDAD DE RECORDATORIOS ====================
  async getPeriodicidadesRecordatorio(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const periodicidadModel = new PeriodicidadRecordatorioModel();
      const periodicidades = await periodicidadModel.getAll(idEmpresa);
      return res.status(200).json({ data: periodicidades });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener periodicidades de recordatorio: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener periodicidades de recordatorio" });
    }
  }

  async getPeriodicidadRecordatorioById(req, res) {
    try {
      const { id } = req.params;
      const periodicidadModel = new PeriodicidadRecordatorioModel();
      const periodicidad = await periodicidadModel.getById(id);

      if (!periodicidad) {
        return res.status(404).json({ msg: "Periodicidad de recordatorio no encontrada" });
      }

      return res.status(200).json({ data: periodicidad });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener periodicidad de recordatorio: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener periodicidad de recordatorio" });
    }
  }

  async createPeriodicidadRecordatorio(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { nombre, cada_horas } = req.body;

      if (!nombre || !cada_horas) {
        return res.status(400).json({ msg: "El nombre y cada_horas son requeridos" });
      }

      const { userId } = req.user || {};
      const periodicidadModel = new PeriodicidadRecordatorioModel();
      const id = await periodicidadModel.create({ nombre, cada_horas, id_empresa: idEmpresa, usuario_registro: userId });

      return res.status(201).json({ msg: "Periodicidad de recordatorio creada exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear periodicidad de recordatorio: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear periodicidad de recordatorio" });
    }
  }

  async updatePeriodicidadRecordatorio(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { id } = req.params;
      const { nombre, cada_horas } = req.body;

      if (!nombre || !cada_horas) {
        return res.status(400).json({ msg: "El nombre y cada_horas son requeridos" });
      }

      const { userId } = req.user || {};
      const periodicidadModel = new PeriodicidadRecordatorioModel();
      await periodicidadModel.update(id, { nombre, cada_horas, id_empresa: idEmpresa, usuario_actualizacion: userId });

      return res.status(200).json({ msg: "Periodicidad de recordatorio actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar periodicidad de recordatorio: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar periodicidad de recordatorio" });
    }
  }

  async deletePeriodicidadRecordatorio(req, res) {
    try {
      const { idEmpresa, userId } = req.user || {};
      const { id } = req.params;
      const periodicidadModel = new PeriodicidadRecordatorioModel();
      await periodicidadModel.delete(id, idEmpresa, userId);
      return res.status(200).json({ msg: "Periodicidad de recordatorio eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar periodicidad de recordatorio: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar periodicidad de recordatorio" });
    }
  }

  // ==================== FORMATOS ====================
  async getFormatos(req, res) {
    try {
      const id_empresa = req.user?.idEmpresa || null;
      const formatoModel = new FormatoModel();
      const formatos = await formatoModel.getAll(id_empresa);
      return res.status(200).json({ data: formatos });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener formatos: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener formatos" });
    }
  }

  async getFormatoById(req, res) {
    try {
      const { id } = req.params;
      const formatoModel = new FormatoModel();
      const formato = await formatoModel.getByIdWithCampos(id);

      if (!formato) {
        return res.status(404).json({ msg: "Formato no encontrado" });
      }

      return res.status(200).json({ data: formato });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener formato: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener formato" });
    }
  }

  async createFormato(req, res) {
    try {
      const { nombre, descripcion } = req.body;
      const usuario_registro = req.user?.userId || null;
      const id_empresa = req.user?.idEmpresa;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      const formatoModel = new FormatoModel();
      const id = await formatoModel.create({ id_empresa, nombre, descripcion, usuario_registro });

      return res.status(201).json({ msg: "Formato creado exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear formato: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear formato" });
    }
  }

  async updateFormato(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion } = req.body;
      const usuario_actualizacion = req.user?.userId || null;
      const id_empresa = req.user?.idEmpresa || null;

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      const formatoModel = new FormatoModel();
      await formatoModel.update(id, { nombre, descripcion, usuario_actualizacion, id_empresa });

      return res.status(200).json({ msg: "Formato actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar formato: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar formato" });
    }
  }

  async deleteFormato(req, res) {
    try {
      const { id } = req.params;
      const id_empresa = req.user?.idEmpresa || null;
      const usuario_actualizacion = req.user?.userId || null;
      const formatoModel = new FormatoModel();
      await formatoModel.delete(id, id_empresa, usuario_actualizacion);
      return res.status(200).json({ msg: "Formato eliminado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar formato: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar formato" });
    }
  }

  // ==================== FORMATO CAMPOS ====================
  async getCamposByFormato(req, res) {
    try {
      const { idFormato } = req.params;
      const formatoCampoModel = new FormatoCampoModel();
      const campos = await formatoCampoModel.getAllByFormato(idFormato);
      return res.status(200).json({ data: campos });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener campos del formato: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener campos del formato" });
    }
  }

  async getCampoById(req, res) {
    try {
      const { id } = req.params;
      const formatoCampoModel = new FormatoCampoModel();
      const campo = await formatoCampoModel.getById(id);

      if (!campo) {
        return res.status(404).json({ msg: "Campo no encontrado" });
      }

      return res.status(200).json({ data: campo });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener campo: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener campo" });
    }
  }

  async createCampo(req, res) {
    try {
      const { id_formato, nombre_campo, etiqueta, tipo_dato, longitud, requerido, unico, orden, placeholder, reglas_json } = req.body;
      const usuario_registro = req.user?.userId || null;

      if (!id_formato || !nombre_campo || !tipo_dato) {
        return res.status(400).json({ msg: "El formato, nombre del campo y tipo de dato son requeridos" });
      }

      const formatoCampoModel = new FormatoCampoModel();
      const id = await formatoCampoModel.create({
        id_formato,
        nombre_campo,
        etiqueta,
        tipo_dato,
        longitud,
        requerido,
        unico,
        orden,
        placeholder,
        reglas_json,
        usuario_registro
      });

      return res.status(201).json({ msg: "Campo creado exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear campo: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear campo" });
    }
  }

  async updateCampo(req, res) {
    try {
      const { id } = req.params;
      const { nombre_campo, etiqueta, tipo_dato, longitud, requerido, unico, orden, placeholder, reglas_json } = req.body;
      const usuario_actualizacion = req.user?.userId || null;

      if (!nombre_campo || !tipo_dato) {
        return res.status(400).json({ msg: "El nombre del campo y tipo de dato son requeridos" });
      }

      const formatoCampoModel = new FormatoCampoModel();
      await formatoCampoModel.update(id, {
        nombre_campo,
        etiqueta,
        tipo_dato,
        longitud,
        requerido,
        unico,
        orden,
        placeholder,
        reglas_json,
        usuario_actualizacion
      });

      return res.status(200).json({ msg: "Campo actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar campo: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar campo" });
    }
  }

  async deleteCampo(req, res) {
    try {
      const { id } = req.params;
      const usuario_actualizacion = req.user?.userId || null;
      const formatoCampoModel = new FormatoCampoModel();
      await formatoCampoModel.delete(id, usuario_actualizacion);
      return res.status(200).json({ msg: "Campo eliminado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar campo: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar campo" });
    }
  }

  async updateOrdenCampos(req, res) {
    try {
      const { campos } = req.body;

      if (!campos || !Array.isArray(campos)) {
        return res.status(400).json({ msg: "Se requiere un array de campos con orden" });
      }

      const formatoCampoModel = new FormatoCampoModel();
      await formatoCampoModel.updateOrden(campos);

      return res.status(200).json({ msg: "Orden de campos actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar orden de campos: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar orden de campos" });
    }
  }

  // ==================== BASE DE NUMEROS ====================
  async getBasesNumeros(req, res) {
    try {
      const id_empresa = req.user?.idEmpresa || null;
      const baseNumeroModel = new BaseNumeroModel();
      const bases = await baseNumeroModel.getAll(id_empresa);
      return res.status(200).json({ data: bases });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener bases de numeros: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener bases de numeros" });
    }
  }

  async getBaseNumeroById(req, res) {
    try {
      const { id } = req.params;
      const baseNumeroModel = new BaseNumeroModel();
      const base = await baseNumeroModel.getById(id);

      if (!base) {
        return res.status(404).json({ msg: "Base de numeros no encontrada" });
      }

      return res.status(200).json({ data: base });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener base de numeros: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener base de numeros" });
    }
  }

  async createBaseNumero(req, res) {
    try {
      const { id_formato, nombre, descripcion } = req.body;
      const id_empresa = req.user?.idEmpresa || null;
      const usuario_registro = req.user?.userId || null;

      if (!id_empresa || !id_formato || !nombre) {
        return res.status(400).json({ msg: "El formato y nombre son requeridos" });
      }

      const baseNumeroModel = new BaseNumeroModel();
      const id = await baseNumeroModel.create({ id_empresa, id_formato, nombre, descripcion, usuario_registro });

      return res.status(201).json({ msg: "Base de numeros creada exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear base de numeros: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear base de numeros" });
    }
  }

  async updateBaseNumero(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion, id_formato } = req.body;
      const usuario_actualizacion = req.user?.userId || null;
      const id_empresa = req.user?.idEmpresa || null;

      if (!nombre || !id_formato) {
        return res.status(400).json({ msg: "El nombre y formato son requeridos" });
      }

      const baseNumeroModel = new BaseNumeroModel();
      await baseNumeroModel.update(id, { nombre, descripcion, id_formato, usuario_actualizacion, id_empresa });

      return res.status(200).json({ msg: "Base de numeros actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar base de numeros: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar base de numeros" });
    }
  }

  async deleteBaseNumero(req, res) {
    try {
      const { id } = req.params;
      const id_empresa = req.user?.idEmpresa || null;
      const usuario_actualizacion = req.user?.userId || null;
      const baseNumeroModel = new BaseNumeroModel();
      await baseNumeroModel.delete(id, id_empresa, usuario_actualizacion);
      return res.status(200).json({ msg: "Base de numeros eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar base de numeros: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar base de numeros" });
    }
  }

  // ==================== DETALLE BASE DE NUMEROS ====================
  async getDetallesByBaseNumero(req, res) {
    try {
      const { idBase } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const detalleModel = new BaseNumeroDetalleModel();
      const result = await detalleModel.getByBaseNumero(idBase, parseInt(page), parseInt(limit));

      return res.status(200).json(result);
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener detalles: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener detalles de la base" });
    }
  }

  async createDetalle(req, res) {
    try {
      const { id_base_numero, telefono, nombre, correo, tipo_documento, numero_documento, json_adicional } = req.body;
      const usuario_registro = req.user?.userId || null;

      if (!id_base_numero || !telefono) {
        return res.status(400).json({ msg: "La base y telefono son requeridos" });
      }

      const detalleModel = new BaseNumeroDetalleModel();
      const id = await detalleModel.create({
        id_base_numero,
        telefono,
        nombre,
        correo,
        tipo_documento,
        numero_documento,
        json_adicional,
        usuario_registro
      });

      return res.status(201).json({ msg: "Registro agregado exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear detalle: ${error.message}`);
      return res.status(500).json({ msg: "Error al agregar registro" });
    }
  }

  async deleteDetalle(req, res) {
    try {
      const { id } = req.params;
      const usuario_actualizacion = req.user?.userId || null;
      const detalleModel = new BaseNumeroDetalleModel();
      await detalleModel.delete(id, usuario_actualizacion);
      return res.status(200).json({ msg: "Registro eliminado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar detalle: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar registro" });
    }
  }

  // ==================== CARGA MASIVA ====================
  async uploadBaseNumero(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ msg: "No se ha proporcionado un archivo" });
      }

      const { id_base_numero } = req.body;
      const usuario_registro = req.user?.userId || null;

      if (!id_base_numero) {
        return res.status(400).json({ msg: "El ID de la base es requerido" });
      }

      // Obtener la base y su formato
      const baseNumeroModel = new BaseNumeroModel();
      const base = await baseNumeroModel.getById(id_base_numero);

      if (!base) {
        return res.status(404).json({ msg: "Base de numeros no encontrada" });
      }

      // Obtener campos del formato
      const formatoModel = new FormatoModel();
      const formato = await formatoModel.getByIdWithCampos(base.id_formato);

      if (!formato) {
        return res.status(404).json({ msg: "Formato no encontrado" });
      }

      // Leer el archivo Excel/CSV
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

      if (jsonData.length === 0) {
        return res.status(400).json({ msg: "El archivo esta vacio" });
      }

      // Campos fijos de base_numero_detalle
      const camposFijos = ['telefono', 'nombre', 'correo', 'tipo_documento', 'numero_documento', 'tipo_persona'];
      const camposFormato = formato.campos || [];

      // ========== VALIDAR ESTRUCTURA DEL ARCHIVO ==========
      // Obtener las columnas del archivo
      const columnasArchivo = Object.keys(jsonData[0]).map(col => col.toLowerCase().trim());

      // Construir lista de columnas esperadas segun el formato
      const columnasEsperadas = [];

      // telefono siempre es requerido
      columnasEsperadas.push({ nombre: 'telefono', requerido: true, tipo: 'fijo' });

      // Agregar campos opcionales fijos
      camposFijos.filter(c => c !== 'telefono').forEach(campo => {
        columnasEsperadas.push({ nombre: campo, requerido: false, tipo: 'fijo' });
      });

      // Agregar campos del formato
      camposFormato.forEach(campo => {
        columnasEsperadas.push({
          nombre: campo.nombre_campo.toLowerCase(),
          etiqueta: campo.etiqueta ? campo.etiqueta.toLowerCase() : null,
          requerido: campo.requerido === 1,
          tipo: 'formato'
        });
      });

      // Validar que existan las columnas requeridas
      const columnasRequeridas = columnasEsperadas.filter(c => c.requerido);
      const columnasFaltantes = [];

      for (const colReq of columnasRequeridas) {
        const existe = columnasArchivo.some(colArch =>
          colArch === colReq.nombre || colArch === colReq.etiqueta
        );
        if (!existe) {
          columnasFaltantes.push(colReq.etiqueta || colReq.nombre);
        }
      }

      // Identificar columnas del archivo que no estan en el formato
      const columnasValidas = columnasEsperadas.map(c => [c.nombre, c.etiqueta]).flat().filter(Boolean);
      const columnasSobrantes = columnasArchivo.filter(col => !columnasValidas.includes(col));

      // Validar estructura: columnas faltantes o sobrantes
      if (columnasFaltantes.length > 0 || columnasSobrantes.length > 0) {
        let mensaje = "El archivo no tiene la estructura correcta";
        if (columnasFaltantes.length > 0 && columnasSobrantes.length > 0) {
          mensaje = "El archivo tiene columnas faltantes y columnas no reconocidas";
        } else if (columnasFaltantes.length > 0) {
          mensaje = "El archivo tiene columnas requeridas faltantes";
        } else {
          mensaje = "El archivo tiene columnas que no estan definidas en el formato";
        }

        return res.status(400).json({
          msg: mensaje,
          error: "estructura_invalida",
          columnasFaltantes: columnasFaltantes.length > 0 ? columnasFaltantes : undefined,
          columnasSobrantes: columnasSobrantes.length > 0 ? columnasSobrantes : undefined,
          columnasEsperadas: columnasEsperadas.map(c => ({
            nombre: c.etiqueta || c.nombre,
            requerido: c.requerido
          })),
          columnasArchivo: Object.keys(jsonData[0])
        });
      }

      // ========== PROCESAR LOS DATOS ==========
      const registros = [];
      const erroresValidacion = [];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const registro = {
          telefono: null,
          nombre: null,
          correo: null,
          tipo_documento: null,
          numero_documento: null,
          id_tipo_persona: null,
          json_adicional: {}
        };
        let tieneError = false;
        const erroresFila = [];

        // Procesar cada columna del archivo
        const headerKeys = Object.keys(row);

        for (const headerKey of headerKeys) {
          const headerLower = headerKey.toLowerCase().trim();
          const valor = row[headerKey];

          // Verificar si es un campo fijo
          if (camposFijos.includes(headerLower)) {
            if (headerLower === 'tipo_persona') {
              // Mapear tipo_persona del Excel a id_tipo_persona
              const valorLower = String(valor).toLowerCase().trim();
              if (valorLower === 'cliente' || valorLower === '2') {
                registro.id_tipo_persona = 2;
              } else if (valorLower === 'prospecto' || valorLower === '1') {
                registro.id_tipo_persona = 1;
              } else if (valor !== '' && valor !== null && valor !== undefined) {
                const parsed = parseInt(valor);
                registro.id_tipo_persona = isNaN(parsed) ? null : parsed;
              }
            } else {
              registro[headerLower] = valor !== '' ? String(valor) : null;
            }
          } else {
            // Buscar en los campos del formato
            const campoFormato = camposFormato.find(c =>
              c.nombre_campo.toLowerCase() === headerLower ||
              (c.etiqueta && c.etiqueta.toLowerCase() === headerLower)
            );

            if (campoFormato) {
              // Validar segun tipo de dato
              let valorValidado = valor;
              let errorCampo = null;

              if (campoFormato.requerido && (valor === '' || valor === null || valor === undefined)) {
                errorCampo = `Campo "${campoFormato.etiqueta || campoFormato.nombre_campo}" es requerido`;
              } else if (valor !== '' && valor !== null) {
                switch (campoFormato.tipo_dato) {
                  case 'integer':
                    if (isNaN(parseInt(valor))) {
                      errorCampo = `Campo "${campoFormato.etiqueta || campoFormato.nombre_campo}" debe ser un numero entero`;
                    } else {
                      valorValidado = parseInt(valor);
                    }
                    break;
                  case 'decimal':
                    if (isNaN(parseFloat(valor))) {
                      errorCampo = `Campo "${campoFormato.etiqueta || campoFormato.nombre_campo}" debe ser un numero decimal`;
                    } else {
                      valorValidado = parseFloat(valor);
                    }
                    break;
                  case 'email':
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(valor)) {
                      errorCampo = `Campo "${campoFormato.etiqueta || campoFormato.nombre_campo}" debe ser un email valido`;
                    }
                    break;
                  case 'phone':
                    const phoneClean = String(valor).replace(/\D/g, '');
                    if (phoneClean.length < 9) {
                      errorCampo = `Campo "${campoFormato.etiqueta || campoFormato.nombre_campo}" debe ser un telefono valido`;
                    }
                    valorValidado = phoneClean;
                    break;
                  case 'boolean':
                    valorValidado = ['1', 'true', 'si', 'yes'].includes(String(valor).toLowerCase()) ? 1 : 0;
                    break;
                  case 'date':
                  case 'datetime':
                    // Intentar parsear la fecha
                    if (typeof valor === 'number') {
                      // Es un serial de Excel
                      const date = xlsx.SSF.parse_date_code(valor);
                      valorValidado = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
                    } else {
                      valorValidado = valor;
                    }
                    break;
                }

                // Validar longitud
                if (!errorCampo && campoFormato.longitud && String(valorValidado).length > campoFormato.longitud) {
                  errorCampo = `Campo "${campoFormato.etiqueta || campoFormato.nombre_campo}" excede la longitud maxima de ${campoFormato.longitud}`;
                }
              }

              if (errorCampo) {
                erroresFila.push(errorCampo);
                tieneError = true;
              } else {
                registro.json_adicional[campoFormato.nombre_campo] = valorValidado !== '' ? valorValidado : null;
              }
            }
          }
        }

        // Validar telefono requerido
        if (!registro.telefono) {
          erroresFila.push('El telefono es requerido');
          tieneError = true;
        }

        if (tieneError) {
          erroresValidacion.push({
            fila: i + 2, // +2 porque la fila 1 es el header y el array empieza en 0
            errores: erroresFila
          });
        } else {
          registros.push(registro);
        }
      }

      // Insertar registros validos
      const detalleModel = new BaseNumeroDetalleModel();
      const resultado = await detalleModel.bulkCreate(id_base_numero, registros, usuario_registro);

      return res.status(200).json({
        msg: "Carga completada",
        data: {
          totalProcesados: jsonData.length,
          insertados: resultado.total,
          erroresValidacion: erroresValidacion.length,
          erroresDuplicados: resultado.errores.length,
          detalleErroresValidacion: erroresValidacion.slice(0, 10), // Primeros 10 errores
          detalleErroresDuplicados: resultado.errores.slice(0, 10)
        }
      });

    } catch (error) {
      logger.error(`[configuracion.controller.js] Error en carga masiva: ${error.message}`);
      return res.status(500).json({ msg: "Error al procesar el archivo" });
    }
  }

  // ==================== PLANTILLAS ====================
  async getPlantillas(req, res) {
    try {
      const idEmpresa = req.user?.idEmpresa || null;
      const plantillaModel = new PlantillaModel();
      const plantillas = await plantillaModel.getAll(idEmpresa);
      return res.status(200).json({ data: plantillas });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener plantillas: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener plantillas" });
    }
  }

  async getPlantillaById(req, res) {
    try {
      const { id } = req.params;
      const plantillaModel = new PlantillaModel();
      const plantilla = await plantillaModel.getById(id);

      if (!plantilla) {
        return res.status(404).json({ msg: "Plantilla no encontrada" });
      }

      return res.status(200).json({ data: plantilla });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener plantilla: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener plantilla" });
    }
  }

  async getPlantillasByFormato(req, res) {
    try {
      const { idFormato } = req.params;
      const plantillaModel = new PlantillaModel();
      const plantillas = await plantillaModel.getByFormato(idFormato);
      return res.status(200).json({ data: plantillas });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener plantillas por formato: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener plantillas por formato" });
    }
  }

  async createPlantilla(req, res) {
    try {
      const { id_formato, nombre, descripcion, prompt_sistema, prompt_inicio, prompt_flujo, prompt_cierre, prompt_resultado } = req.body;
      const id_empresa = req.user?.idEmpresa;
      const usuario_registro = req.user?.userId || null;

      if (!id_formato || !nombre || !prompt_sistema || !prompt_inicio || !prompt_flujo) {
        return res.status(400).json({ msg: "El formato, nombre, prompt sistema, prompt inicio y prompt flujo son requeridos" });
      }

      const plantillaModel = new PlantillaModel();
      const id = await plantillaModel.create({
        id_empresa,
        id_formato,
        nombre,
        descripcion,
        prompt_sistema,
        prompt_inicio,
        prompt_flujo,
        prompt_cierre,
        prompt_resultado,
        usuario_registro
      });

      return res.status(201).json({ msg: "Plantilla creada exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear plantilla: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear plantilla" });
    }
  }

  async updatePlantilla(req, res) {
    try {
      const { id } = req.params;
      const { id_formato, nombre, descripcion, prompt_sistema, prompt_inicio, prompt_flujo, prompt_cierre, prompt_resultado } = req.body;
      const idEmpresa = req.user?.idEmpresa || null;
      const usuario_actualizacion = req.user?.userId || null;

      if (!id_formato || !nombre || !prompt_sistema || !prompt_inicio || !prompt_flujo) {
        return res.status(400).json({ msg: "El formato, nombre, prompt sistema, prompt inicio y prompt flujo son requeridos" });
      }

      const plantillaModel = new PlantillaModel();
      const updated = await plantillaModel.update(id, {
        id_formato,
        nombre,
        descripcion,
        prompt_sistema,
        prompt_inicio,
        prompt_flujo,
        prompt_cierre,
        prompt_resultado,
        usuario_actualizacion,
        id_empresa: idEmpresa
      });

      if (!updated) {
        return res.status(404).json({ msg: "Plantilla no encontrada" });
      }

      return res.status(200).json({ msg: "Plantilla actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar plantilla: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar plantilla" });
    }
  }

  async deletePlantilla(req, res) {
    try {
      const { id } = req.params;
      const idEmpresa = req.user?.idEmpresa || null;
      const usuario_actualizacion = req.user?.userId || null;
      const plantillaModel = new PlantillaModel();
      const deleted = await plantillaModel.delete(id, idEmpresa, usuario_actualizacion);

      if (!deleted) {
        return res.status(404).json({ msg: "Plantilla no encontrada" });
      }

      return res.status(200).json({ msg: "Plantilla eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar plantilla: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar plantilla" });
    }
  }

  // ==================== CAMPANIAS ====================
  async getCampanias(req, res) {
    try {
      const id_empresa  = req.user.idEmpresa;
      const campaniaModel = new CampaniaModel();
      const campanias = await campaniaModel.getAll(id_empresa);
      return res.status(200).json({ data: campanias });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener campanias: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener campanias" });
    }
  }

  async getCampaniaById(req, res) {
    try {
      const { id } = req.params;
      const campaniaModel = new CampaniaModel();
      const campania = await campaniaModel.getByIdWithBases(id);

      if (!campania) {
        return res.status(404).json({ msg: "Campania no encontrada" });
      }

      return res.status(200).json({ data: campania });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener campania: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener campania" });
    }
  }

  async createCampania(req, res) {
    try {
      const { nombre, descripcion, id_tipo_campania, id_formato, id_plantilla } = req.body;
      const id_empresa = req.user?.idEmpresa;
      const usuario_registro = req.user?.userId || null;

      logger.info(`[createCampania] req.body completo: ${JSON.stringify(req.body)}`);
      logger.info(`[createCampania] Datos recibidos: nombre=${nombre}, id_tipo_campania=${id_tipo_campania}, id_formato=${id_formato}, id_plantilla=${id_plantilla}, tipo de id_plantilla=${typeof id_plantilla}`);

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      if (!id_tipo_campania) {
        return res.status(400).json({ msg: "El tipo de campania es requerido" });
      }

      if (!id_formato) {
        return res.status(400).json({ msg: "El formato es requerido" });
      }

      const campaniaModel = new CampaniaModel();
      const id = await campaniaModel.create({
        id_empresa,
        nombre,
        descripcion,
        id_tipo_campania,
        id_formato,
        id_plantilla,
        usuario_registro
      });

      return res.status(201).json({ msg: "Campania creada exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear campania: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear campania" });
    }
  }

  async updateCampania(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion, id_tipo_campania, id_formato, id_plantilla } = req.body;
      const usuario_actualizacion = req.user?.userId || null;

      logger.info(`[updateCampania] req.body completo: ${JSON.stringify(req.body)}`);
      logger.info(`[updateCampania] id=${id}, id_plantilla=${id_plantilla}, tipo=${typeof id_plantilla}`);

      if (!nombre) {
        return res.status(400).json({ msg: "El nombre es requerido" });
      }

      if (!id_tipo_campania) {
        return res.status(400).json({ msg: "El tipo de campania es requerido" });
      }

      if (!id_formato) {
        return res.status(400).json({ msg: "El formato es requerido" });
      }

      const campaniaModel = new CampaniaModel();
      const updated = await campaniaModel.update(id, {
        nombre,
        descripcion,
        id_tipo_campania,
        id_formato,
        id_plantilla,
        usuario_actualizacion
      });

      if (!updated) {
        return res.status(404).json({ msg: "Campania no encontrada" });
      }

      // Eliminar bases que no coincidan con el nuevo formato
      const campaniaBaseModel = new CampaniaBaseNumeroModel();
      const basesEliminadas = await campaniaBaseModel.removeByFormatoMismatch(id, id_formato);

      return res.status(200).json({ msg: "Campania actualizada exitosamente", data: { bases_eliminadas: basesEliminadas } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar campania: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar campania" });
    }
  }

  async deleteCampania(req, res) {
    try {
      const { id } = req.params;
      const usuario_actualizacion = req.user?.userId || null;
      const campaniaModel = new CampaniaModel();
      const deleted = await campaniaModel.delete(id, usuario_actualizacion);

      if (!deleted) {
        return res.status(404).json({ msg: "Campania no encontrada" });
      }

      return res.status(200).json({ msg: "Campania eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar campania: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar campania" });
    }
  }

  // ==================== CAMPANIA BASE NUMERO ====================
  async getBasesByCampania(req, res) {
    try {
      const { idCampania } = req.params;
      const campaniaBaseModel = new CampaniaBaseNumeroModel();
      const bases = await campaniaBaseModel.getByCampania(idCampania);
      return res.status(200).json({ data: bases });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener bases de campania: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener bases de campania" });
    }
  }

  async addBaseToCampania(req, res) {
    try {
      const { id_campania, id_base_numero } = req.body;
      const id_empresa = req.user?.idEmpresa;
      const usuario_registro = req.user?.userId || null;

      if (!id_campania || !id_base_numero) {
        return res.status(400).json({ msg: "La campania y base son requeridas" });
      }

      const campaniaBaseModel = new CampaniaBaseNumeroModel();
      const id = await campaniaBaseModel.add({
        id_empresa,
        id_campania,
        id_base_numero,
        usuario_registro
      });

      return res.status(201).json({ msg: "Base agregada a campania exitosamente", data: { id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al agregar base a campania: ${error.message}`);
      return res.status(500).json({ msg: "Error al agregar base a campania" });
    }
  }

  async removeBaseFromCampania(req, res) {
    try {
      const { id } = req.params;
      const usuario_actualizacion = req.user?.userId || null;
      const campaniaBaseModel = new CampaniaBaseNumeroModel();
      const removed = await campaniaBaseModel.remove(id, usuario_actualizacion);

      if (!removed) {
        return res.status(404).json({ msg: "Relacion no encontrada" });
      }

      return res.status(200).json({ msg: "Base eliminada de campania exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar base de campania: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar base de campania" });
    }
  }

  // ==================== CAMPANIA EJECUCION ====================
  async getEjecucionesByCampania(req, res) {
    try {
      const { idCampania } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const ejecucionModel = new CampaniaEjecucionModel();
      const result = await ejecucionModel.getByCampania(idCampania, parseInt(page), parseInt(limit));

      return res.status(200).json(result);
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener ejecuciones: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener ejecuciones" });
    }
  }

  async ejecutarCampania(req, res) {
    try {
      const { id_campania, ids_base_numero } = req.body;
      const id_empresa = req.user?.idEmpresa;
      const usuario_registro = req.user?.userId || null;

      if (!id_campania || !ids_base_numero?.length) {
        return res.status(400).json({ msg: "La campania e ids_base_numero son requeridos" });
      }

      // Crear ejecucion
      const ejecucionModel = new CampaniaEjecucionModel();
      const idEjecucion = await ejecucionModel.create({
        id_empresa,
        id_campania,
        id_base_numero: ids_base_numero[0],
        fecha_programada: new Date(),
        usuario_registro
      });

      // Obtener tipificaciones
      const [tipificaciones] = await pool.execute(
        `SELECT * FROM tipificacion_llamada WHERE id_empresa = ?`,
        [id_empresa]
      );

      // Responder inmediatamente
      res.status(202).json({
        msg: "Ejecucion iniciada en segundo plano",
        data: { id_ejecucion: idEjecucion, ids_base_numero }
      });

      // Procesar llamadas en background
      llamadaService.procesarLlamadasAsync({
        idEjecucion,
        idCampania: id_campania,
        idsBaseNumero: ids_base_numero,
        idEmpresa: id_empresa,
        tipificaciones
      });

    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al ejecutar campania: ${error.message}`);
      return res.status(500).json({ msg: "Error al ejecutar campania" });
    }
  }

  async getEjecucionById(req, res) {
    try {
      const { id } = req.params;
      const ejecucionModel = new CampaniaEjecucionModel();
      const ejecucion = await ejecucionModel.getById(id);

      if (!ejecucion) {
        return res.status(404).json({ msg: "Ejecucion no encontrada" });
      }

      return res.status(200).json({ data: ejecucion });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener ejecucion: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener ejecucion" });
    }
  }

  async updateEstadoEjecucion(req, res) {
    try {
      const { id } = req.params;
      const { estado_ejecucion, resultado, mensaje_error } = req.body;
      const usuario_actualizacion = req.user?.userId || null;

      if (!estado_ejecucion) {
        return res.status(400).json({ msg: "El estado es requerido" });
      }

      const ejecucionModel = new CampaniaEjecucionModel();
      const updateData = {
        estado_ejecucion,
        usuario_actualizacion
      };

      if (estado_ejecucion === 'en_proceso') {
        updateData.fecha_inicio = new Date();
      }

      if (['ejecutado', 'fallido', 'cancelado'].includes(estado_ejecucion)) {
        updateData.fecha_fin = new Date();
        updateData.resultado = resultado;
        updateData.mensaje_error = mensaje_error;
      }

      const updated = await ejecucionModel.updateEstado(id, updateData);

      if (!updated) {
        return res.status(404).json({ msg: "Ejecucion no encontrada" });
      }

      return res.status(200).json({ msg: "Estado de ejecucion actualizado" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar ejecucion: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar estado de ejecucion" });
    }
  }

  async getEstadisticasCampania(req, res) {
    try {
      const { idCampania } = req.params;
      const ejecucionModel = new CampaniaEjecucionModel();
      const estadisticas = await ejecucionModel.getEstadisticas(idCampania);
      return res.status(200).json({ data: estadisticas });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener estadisticas: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener estadisticas" });
    }
  }

  async cancelarEjecucion(req, res) {
    try {
      const { id } = req.params;
      const { mensaje_error } = req.body;
      const usuario_actualizacion = req.user?.userId || null;

      const ejecucionModel = new CampaniaEjecucionModel();
      const cancelled = await ejecucionModel.cancelarEjecucion(id, {
        mensaje_error: mensaje_error || 'Cancelado por el usuario',
        usuario_actualizacion
      });

      if (!cancelled) {
        return res.status(404).json({ msg: "Ejecucion no encontrada" });
      }

      return res.status(200).json({ msg: "Ejecucion cancelada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al cancelar ejecucion: ${error.message}`);
      return res.status(500).json({ msg: "Error al cancelar ejecucion" });
    }
  }

  // ==================== PROMPT ASISTENTE ====================
  async getPromptAsistente(req, res) {
    try {
      const idEmpresa = req.user?.idEmpresa || null;

      if (!idEmpresa) {
        return res.status(400).json({ msg: "ID de empresa requerido" });
      }

      const promptModel = new PromptAsistenteModel();
      const prompt = await promptModel.getByEmpresa(idEmpresa);

      return res.status(200).json({ data: prompt });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener prompt asistente: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener prompt asistente" });
    }
  }

  async savePromptAsistente(req, res) {
    try {
      const { prompt_sistema } = req.body;
      const idEmpresa = req.user?.idEmpresa || null;
      const usuario_registro = req.user?.userId || null;

      if (!idEmpresa) {
        return res.status(400).json({ msg: "ID de empresa requerido" });
      }

      if (!prompt_sistema || prompt_sistema.trim() === '') {
        return res.status(400).json({ msg: "El prompt del sistema es requerido" });
      }

      const promptModel = new PromptAsistenteModel();
      const result = await promptModel.upsert({
        id_empresa: idEmpresa,
        prompt_sistema,
        usuario_registro
      });

      const mensaje = result.updated
        ? "Prompt actualizado exitosamente"
        : "Prompt creado exitosamente";

      return res.status(200).json({ msg: mensaje, data: { id: result.id } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al guardar prompt asistente: ${error.message}`);
      return res.status(500).json({ msg: "Error al guardar prompt asistente" });
    }
  }
  // ==================== PROYECTOS ====================
  async getProyectos(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const params = [];
      let query = 'SELECT * FROM proyecto WHERE estado_registro = 1';
      if (idEmpresa) { query += ' AND id_empresa = ?'; params.push(idEmpresa); }
      query += ' ORDER BY fecha_registro DESC';
      const [rows] = await pool.execute(query, params);
      return res.status(200).json({ data: rows });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener proyectos: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener proyectos" });
    }
  }

  async createProyecto(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { nombre, descripcion, ubicacion } = req.body;
      if (!nombre) return res.status(400).json({ msg: "El nombre es requerido" });
      const [result] = await pool.execute(
        'INSERT INTO proyecto (nombre, descripcion, ubicacion, id_empresa, estado_registro) VALUES (?, ?, ?, ?, 1)',
        [nombre, descripcion || null, ubicacion || null, idEmpresa]
      );
      return res.status(201).json({ msg: "Proyecto creado exitosamente", data: { id: result.insertId } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear proyecto: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear proyecto" });
    }
  }

  async updateProyecto(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion, ubicacion } = req.body;
      if (!nombre) return res.status(400).json({ msg: "El nombre es requerido" });
      await pool.execute('UPDATE proyecto SET nombre = ?, descripcion = ?, ubicacion = ? WHERE id = ?', [nombre, descripcion || null, ubicacion || null, id]);
      return res.status(200).json({ msg: "Proyecto actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar proyecto: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar proyecto" });
    }
  }

  async deleteProyecto(req, res) {
    try {
      const { id } = req.params;
      await pool.execute('UPDATE proyecto SET estado_registro = 0 WHERE id = ?', [id]);
      return res.status(200).json({ msg: "Proyecto eliminado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar proyecto: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar proyecto" });
    }
  }

  async syncProyectosSperant(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      logger.info(`[configuracion.controller.js] Sync proyectos Sperant - empresa ${idEmpresa}`);
      return res.status(200).json({ msg: "Sincronización de proyectos completada", data: { synced: 0 } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error sync proyectos Sperant: ${error.message}`);
      return res.status(500).json({ msg: "Error al sincronizar proyectos" });
    }
  }

  // ==================== UNIDADES ====================
  async getUnidades(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { id_proyecto } = req.query;
      const params = [];
      let query = 'SELECT * FROM unidad WHERE estado_registro = 1';
      if (id_proyecto) { query += ' AND id_proyecto = ?'; params.push(id_proyecto); }
      if (idEmpresa) { query += ' AND id_empresa = ?'; params.push(idEmpresa); }
      query += ' ORDER BY fecha_registro DESC';
      const [rows] = await pool.execute(query, params);
      return res.status(200).json({ data: rows });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener unidades: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener unidades" });
    }
  }

  async createUnidad(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { id_proyecto, nombre, id_tipologia, area, precio, estado } = req.body;
      if (!id_proyecto || !nombre) return res.status(400).json({ msg: "Proyecto y nombre son requeridos" });
      const [result] = await pool.execute(
        'INSERT INTO unidad (id_proyecto, nombre, id_tipologia, area, precio, estado, id_empresa, estado_registro) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        [id_proyecto, nombre, id_tipologia || null, area || null, precio || null, estado || null, idEmpresa]
      );
      return res.status(201).json({ msg: "Unidad creada exitosamente", data: { id: result.insertId } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear unidad: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear unidad" });
    }
  }

  async updateUnidad(req, res) {
    try {
      const { id } = req.params;
      const { nombre, id_tipologia, area, precio, estado } = req.body;
      if (!nombre) return res.status(400).json({ msg: "El nombre es requerido" });
      await pool.execute('UPDATE unidad SET nombre = ?, id_tipologia = ?, area = ?, precio = ?, estado = ? WHERE id = ?', [nombre, id_tipologia || null, area || null, precio || null, estado || null, id]);
      return res.status(200).json({ msg: "Unidad actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar unidad: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar unidad" });
    }
  }

  async deleteUnidad(req, res) {
    try {
      const { id } = req.params;
      await pool.execute('UPDATE unidad SET estado_registro = 0 WHERE id = ?', [id]);
      return res.status(200).json({ msg: "Unidad eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar unidad: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar unidad" });
    }
  }

  async syncUnidadesSperant(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      logger.info(`[configuracion.controller.js] Sync unidades Sperant - empresa ${idEmpresa}`);
      return res.status(200).json({ msg: "Sincronización de unidades completada", data: { synced: 0 } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error sync unidades Sperant: ${error.message}`);
      return res.status(500).json({ msg: "Error al sincronizar unidades" });
    }
  }

  // ==================== TIPOLOGIAS ====================
  async getTipologias(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const params = [];
      let query = 'SELECT * FROM tipologia WHERE estado_registro = 1';
      if (idEmpresa) { query += ' AND id_empresa = ?'; params.push(idEmpresa); }
      query += ' ORDER BY nombre ASC';
      const [rows] = await pool.execute(query, params);
      return res.status(200).json({ data: rows });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener tipologías: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipologías" });
    }
  }

  async createTipologia(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { nombre, descripcion, id_proyecto } = req.body;
      if (!nombre) return res.status(400).json({ msg: "El nombre es requerido" });
      const [result] = await pool.execute(
        'INSERT INTO tipologia (nombre, descripcion, id_proyecto, id_empresa, estado_registro) VALUES (?, ?, ?, ?, 1)',
        [nombre, descripcion || null, id_proyecto || null, idEmpresa]
      );
      return res.status(201).json({ msg: "Tipología creada exitosamente", data: { id: result.insertId } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear tipología: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear tipología" });
    }
  }

  async updateTipologia(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion, id_proyecto } = req.body;
      if (!nombre) return res.status(400).json({ msg: "El nombre es requerido" });
      await pool.execute('UPDATE tipologia SET nombre = ?, descripcion = ?, id_proyecto = ? WHERE id = ?', [nombre, descripcion || null, id_proyecto || null, id]);
      return res.status(200).json({ msg: "Tipología actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar tipología: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar tipología" });
    }
  }

  async deleteTipologia(req, res) {
    try {
      const { id } = req.params;
      await pool.execute('UPDATE tipologia SET estado_registro = 0 WHERE id = ?', [id]);
      return res.status(200).json({ msg: "Tipología eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar tipología: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar tipología" });
    }
  }

  // ==================== TIPO PLANTILLAS ====================
  async getTipoPlantillas(req, res) {
    try {
      const id_empresa = req.user?.idEmpresa || null;
      const formatoModel = new FormatoModel();
      const formatos = await formatoModel.getAll(id_empresa);
      return res.status(200).json({ data: formatos });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener tipo plantillas: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipo plantillas" });
    }
  }

  async getTipoPlantillaById(req, res) {
    try {
      const { id } = req.params;
      const formatoModel = new FormatoModel();
      const formato = await formatoModel.getByIdWithCampos(id);
      if (!formato) return res.status(404).json({ msg: "Tipo plantilla no encontrado" });
      return res.status(200).json({ data: formato });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener tipo plantilla: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipo plantilla" });
    }
  }

  // ==================== TIPO RECURSOS ====================
  async getTipoRecursos(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const params = [];
      let query = 'SELECT * FROM tipo_recurso WHERE estado_registro = 1';
      if (idEmpresa) { query += ' AND id_empresa = ?'; params.push(idEmpresa); }
      const [rows] = await pool.execute(query, params);
      return res.status(200).json({ data: rows });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener tipo recursos: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipo recursos" });
    }
  }

  // ==================== RECURSOS ====================
  async getRecursos(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const params = [];
      let query = 'SELECT * FROM recurso WHERE estado_registro = 1';
      if (idEmpresa) { query += ' AND id_empresa = ?'; params.push(idEmpresa); }
      query += ' ORDER BY fecha_registro DESC';
      const [rows] = await pool.execute(query, params);
      return res.status(200).json({ data: rows });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener recursos: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener recursos" });
    }
  }

  async createRecurso(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { nombre, descripcion, id_tipo_recurso, id_proyecto, id_tipologia, url } = req.body;
      if (!nombre) return res.status(400).json({ msg: "El nombre es requerido" });
      const [result] = await pool.execute(
        'INSERT INTO recurso (nombre, descripcion, id_tipo_recurso, id_proyecto, id_tipologia, url, id_empresa, estado_registro) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        [nombre, descripcion || null, id_tipo_recurso || null, id_proyecto || null, id_tipologia || null, url || null, idEmpresa]
      );
      return res.status(201).json({ msg: "Recurso creado exitosamente", data: { id: result.insertId } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear recurso: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear recurso" });
    }
  }

  async updateRecurso(req, res) {
    try {
      const { id } = req.params;
      const { nombre, descripcion, id_tipo_recurso, id_proyecto, id_tipologia, url } = req.body;
      if (!nombre) return res.status(400).json({ msg: "El nombre es requerido" });
      await pool.execute('UPDATE recurso SET nombre = ?, descripcion = ?, id_tipo_recurso = ?, id_proyecto = ?, id_tipologia = ?, url = ? WHERE id = ?', [nombre, descripcion || null, id_tipo_recurso || null, id_proyecto || null, id_tipologia || null, url || null, id]);
      return res.status(200).json({ msg: "Recurso actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar recurso: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar recurso" });
    }
  }

  async deleteRecurso(req, res) {
    try {
      const { id } = req.params;
      await pool.execute('UPDATE recurso SET estado_registro = 0 WHERE id = ?', [id]);
      return res.status(200).json({ msg: "Recurso eliminado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar recurso: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar recurso" });
    }
  }

  // ==================== ESTADOS CAMPANIA ====================
  async getEstadosCampania(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const params = [];
      let query = 'SELECT * FROM estado_campania WHERE estado_registro = 1';
      if (idEmpresa) { query += ' AND id_empresa = ?'; params.push(idEmpresa); }
      query += ' ORDER BY orden ASC';
      const [rows] = await pool.execute(query, params);
      return res.status(200).json({ data: rows });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener estados campaña: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener estados de campaña" });
    }
  }

  async createEstadoCampania(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { nombre, color, orden } = req.body;
      if (!nombre) return res.status(400).json({ msg: "El nombre es requerido" });
      const [result] = await pool.execute(
        'INSERT INTO estado_campania (nombre, color, orden, id_empresa, estado_registro) VALUES (?, ?, ?, ?, 1)',
        [nombre, color || null, orden || 0, idEmpresa]
      );
      return res.status(201).json({ msg: "Estado de campaña creado exitosamente", data: { id: result.insertId } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear estado campaña: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear estado de campaña" });
    }
  }

  async updateEstadoCampania(req, res) {
    try {
      const { id } = req.params;
      const { nombre, color, orden } = req.body;
      if (!nombre) return res.status(400).json({ msg: "El nombre es requerido" });
      await pool.execute('UPDATE estado_campania SET nombre = ?, color = ?, orden = ? WHERE id = ?', [nombre, color || null, orden || 0, id]);
      return res.status(200).json({ msg: "Estado de campaña actualizado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar estado campaña: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar estado de campaña" });
    }
  }

  async deleteEstadoCampania(req, res) {
    try {
      const { id } = req.params;
      await pool.execute('UPDATE estado_campania SET estado_registro = 0 WHERE id = ?', [id]);
      return res.status(200).json({ msg: "Estado de campaña eliminado exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar estado campaña: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar estado de campaña" });
    }
  }

  // ==================== TIPOS CAMPANIA ====================
  // Nota: tipo_campania ya no tiene id_empresa, solo existen id 1 (Llamadas) y 2 (WhatsApp)
  async getTiposCampania(req, res) {
    try {
      const query = 'SELECT * FROM tipo_campania WHERE estado_registro = 1 ORDER BY id ASC';
      const [rows] = await pool.execute(query);
      return res.status(200).json({ data: rows });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener tipos campaña: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipos de campaña" });
    }
  }

  // CRUD deshabilitado - tipos de campaña son fijos (1=Llamadas, 2=WhatsApp)
  async createTipoCampania(req, res) {
    return res.status(400).json({ msg: "Los tipos de campaña son fijos y no se pueden crear nuevos" });
  }

  async updateTipoCampania(req, res) {
    return res.status(400).json({ msg: "Los tipos de campaña son fijos y no se pueden modificar" });
  }

  async deleteTipoCampania(req, res) {
    return res.status(400).json({ msg: "Los tipos de campaña son fijos y no se pueden eliminar" });
  }

  // ==================== CONFIGURACION CAMPANIA LLAMADA ====================
  async getConfiguracionCampaniaLlamada(req, res) {
    try {
      const { id_campania } = req.params;
      const model = new ConfiguracionCampaniaLlamadaModel();
      const config = await model.getByCampaniaId(id_campania);

      if (!config) {
        // Retornar valores por defecto si no existe configuración
        return res.status(200).json({
          data: {
            id_campania: parseInt(id_campania),
            dias_llamada: 'lun,mar,mie,jue,vie',
            hora_inicio: '09:00:00',
            hora_fin: '18:00:00',
            max_intentos: 3,
            intervalo_reintento: 60,
            is_default: true
          }
        });
      }

      return res.status(200).json({ data: config });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener config campaña llamada: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener configuración de llamadas" });
    }
  }

  async saveConfiguracionCampaniaLlamada(req, res) {
    try {
      const { id_campania } = req.params;
      const { dias_llamada, hora_inicio, hora_fin, max_intentos, intervalo_reintento, horarios_por_dia } = req.body;
      const usuario = req.user?.username || null;

      if (!dias_llamada && !horarios_por_dia) {
        return res.status(400).json({ msg: "Debe seleccionar al menos un día" });
      }

      const model = new ConfiguracionCampaniaLlamadaModel();
      const result = await model.upsert({
        id_campania: parseInt(id_campania),
        dias_llamada,
        hora_inicio,
        hora_fin,
        max_intentos: max_intentos || 3,
        intervalo_reintento: intervalo_reintento || 60,
        horarios_por_dia,
        usuario
      });

      return res.status(200).json({
        msg: result.updated ? "Configuración actualizada exitosamente" : "Configuración creada exitosamente",
        data: result
      });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al guardar config campaña llamada: ${error.message}`);
      return res.status(500).json({ msg: "Error al guardar configuración de llamadas" });
    }
  }

  // ==================== PERSONAS (listing) ====================
  async getPersonas(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { page = 1, limit = 50, search = '', tipo = '' } = req.query;
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 50;
      const offset = (pageNum - 1) * limitNum;

      const params = [];
      const countParams = [];
      let baseWhere = 'WHERE p.estado_registro = 1';

      if (idEmpresa) {
        baseWhere += ' AND p.id_empresa = ?';
        params.push(idEmpresa);
        countParams.push(idEmpresa);
      }

      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        baseWhere += ' AND (p.nombre_completo LIKE ? OR p.celular LIKE ? OR p.dni LIKE ?)';
        params.push(searchTerm, searchTerm, searchTerm);
        countParams.push(searchTerm, searchTerm, searchTerm);
      }

      if (tipo && (tipo === '1' || tipo === '2')) {
        baseWhere += ' AND p.id_tipo_persona = ?';
        params.push(parseInt(tipo));
        countParams.push(parseInt(tipo));
      }

      // Query para contar total
      const countQuery = `SELECT COUNT(*) as total FROM persona p ${baseWhere}`;
      const [[{ total }]] = await pool.execute(countQuery, countParams);

      // Query para datos paginados
      let query = `SELECT p.id, p.celular, p.nombre_completo, p.dni, p.id_tipo_persona, tp.nombre AS tipo_persona_nombre
                   FROM persona p LEFT JOIN tipo_persona tp ON p.id_tipo_persona = tp.id
                   ${baseWhere}
                   ORDER BY p.nombre_completo ASC
                   LIMIT ? OFFSET ?`;
      params.push(limitNum, offset);

      const [rows] = await pool.execute(query, params);

      return res.status(200).json({
        data: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener personas: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener personas" });
    }
  }

  // ==================== CONVERSACIONES ====================
  async getConversaciones(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { limit } = req.query;
      const params = [];
      let query = `SELECT c.*, p.celular, p.nombre_completo FROM chat c LEFT JOIN persona p ON p.id = c.id_persona WHERE c.estado_registro = 1`;
      if (idEmpresa) { query += ' AND c.id_empresa = ?'; params.push(idEmpresa); }
      query += ' ORDER BY c.fecha_actualizacion DESC';
      if (limit) { query += ' LIMIT ?'; params.push(parseInt(limit)); }
      const [rows] = await pool.execute(query, params);
      return res.status(200).json({ data: rows });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener conversaciones: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener conversaciones" });
    }
  }

  // ==================== PLANTILLAS WHATSAPP (via /crm/ path) ====================
  async getPlantillasWhatsapp(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const params = [];
      let query = 'SELECT * FROM plantilla_whatsapp WHERE estado_registro = 1';
      if (idEmpresa) { query += ' AND id_empresa = ?'; params.push(idEmpresa); }
      const [rows] = await pool.execute(query, params);
      return res.status(200).json({ data: rows });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener plantillas WhatsApp: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener plantillas WhatsApp" });
    }
  }

  async createPlantillaWhatsapp(req, res) {
    try {
      const { idEmpresa } = req.user || {};
      const { nombre, contenido, tipo, idioma } = req.body;
      if (!nombre) return res.status(400).json({ msg: "El nombre es requerido" });
      const [result] = await pool.execute(
        'INSERT INTO plantilla_whatsapp (nombre, contenido, tipo, idioma, id_empresa, estado_registro) VALUES (?, ?, ?, ?, ?, 1)',
        [nombre, contenido || null, tipo || null, idioma || 'es', idEmpresa]
      );
      return res.status(201).json({ msg: "Plantilla creada exitosamente", data: { id: result.insertId } });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al crear plantilla WhatsApp: ${error.message}`);
      return res.status(500).json({ msg: "Error al crear plantilla WhatsApp" });
    }
  }

  async updatePlantillaWhatsapp(req, res) {
    try {
      const { id } = req.params;
      const { nombre, contenido, tipo, idioma } = req.body;
      if (!nombre) return res.status(400).json({ msg: "El nombre es requerido" });
      await pool.execute('UPDATE plantilla_whatsapp SET nombre = ?, contenido = ?, tipo = ?, idioma = ? WHERE id = ?', [nombre, contenido || null, tipo || null, idioma || 'es', id]);
      return res.status(200).json({ msg: "Plantilla actualizada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al actualizar plantilla WhatsApp: ${error.message}`);
      return res.status(500).json({ msg: "Error al actualizar plantilla WhatsApp" });
    }
  }

  async deletePlantillaWhatsapp(req, res) {
    try {
      const { id } = req.params;
      await pool.execute('UPDATE plantilla_whatsapp SET estado_registro = 0 WHERE id = ?', [id]);
      return res.status(200).json({ msg: "Plantilla eliminada exitosamente" });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al eliminar plantilla WhatsApp: ${error.message}`);
      return res.status(500).json({ msg: "Error al eliminar plantilla WhatsApp" });
    }
  }

  async getTiposPersona(req, res) {
    try {
      const model = new TipoPersonaModel();
      const tipos = await model.getAll();
      return res.status(200).json({ data: tipos });
    } catch (error) {
      logger.error(`[configuracion.controller.js] Error al obtener tipos de persona: ${error.message}`);
      return res.status(500).json({ msg: "Error al obtener tipos de persona" });
    }
  }
}

module.exports = new ConfiguracionController();
