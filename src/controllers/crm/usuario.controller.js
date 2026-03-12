const UsuarioModel = require("../../models/usuario.model.js");
const ModuloModel = require("../../models/modulo.model.js");
const logger = require('../../config/logger/loggerClient.js');
const JWTService = require('../../services/crm/jwt.service');

class UsuarioController {

  async forgotPassword(req, res) {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ message: "El usuario o correo es requerido" });
      }

      logger.info(`[usuario.controller.js] Solicitud de recuperación de contraseña para: ${username}`);

      // Por seguridad, siempre responder con éxito independientemente de si existe el usuario
      return res.status(200).json({ message: "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña." });
    } catch (error) {
      logger.error(`[usuario.controller.js] Error en forgot-password: ${error.message}`);
      return res.status(500).json({ message: "Error al procesar la solicitud" });
    }
  }

  async loginUsuario(req, res) {
    try {
      const { username, password } = req.body;

      const usuarioModel = new UsuarioModel();
      const usuario = await usuarioModel.getByUserAndPass(username, password);

      if (usuario) {

        const token = JWTService.generate({
          userId: usuario.id,
          username: usuario.username,
          rolId: usuario.id_rol,
          rolNombre: usuario.rol_nombre,
          idEmpresa: usuario.id_empresa
        });

        // Obtener módulos del rol del usuario
        const moduloModel = new ModuloModel();
        const modulos = await moduloModel.getByRolId(usuario.id_rol);

        usuario.password = "";

        return res.status(200).json({ user: usuario, token, modulos });
      }
      else {
        return res.status(404).json({ msg: "El usuario o contraseña no coincide. Por favor vuelva a intentar" });
      }
    }
    catch (error) {
      logger.error(`[usuario.controller.js] Error al procesar usuario: ${error.message}`);
      return res.status(500).json({ msg: "Error al verificar usuario" });
    }
  }
}

module.exports = new UsuarioController();