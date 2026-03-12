const JWTService = require('../services/crm/jwt.service');
const logger = require('../config/logger/loggerClient');

/**
 * Middleware para verificar JWT token
 */
const authMiddleware = (req, res, next) => {
  try {
    // Obtener token del header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.clientError(401, 'Token no proporcionado');
    }

    // Formato: "Bearer TOKEN"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.clientError(401, 'Formato de token inválido');
    }

    const token = parts[1];

    // Verificar token
    try {
      const decoded = JWTService.verify(token);

      // Agregar datos del usuario al request
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        rolId: decoded.rolId,
        rolNombre: decoded.rolNombre,
        idEmpresa: decoded.idEmpresa
      };

      next();
    } catch (error) {
      logger.warn(`[authMiddleware] Token inválido: ${error.message}`);
      return res.clientError(401, error.message || 'Token inválido');
    }

  } catch (error) {
    logger.error(`[authMiddleware] ${error.message}`);
    return res.serverError(500, 'Error al verificar autenticación');
  }
};

module.exports = authMiddleware;
