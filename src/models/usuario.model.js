const { pool } = require("../config/dbConnection.js");
const bcrypt = require("bcrypt");
const SALT_ROUNDS = 10;

class UsuarioModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
    this.SALT_ROUNDS = 10;
  }
  async updatePhoto(id, foto) {
    try {
    
      const [result] = await this.connection.execute(
        `UPDATE usuario SET foto = ? WHERE id = ?`,
        [foto, id]
      );
    
      return result.affectedRows > 0;
    
    } catch (error) {
      throw new Error(`Error al actualizar foto: ${error.message}`);
    }
  }
  async getAll() {
    try {
      const [rows] = await this.connection.execute(
        `SELECT u.id, u.username, u.id_rol, u.id_sucursal, u.id_padre, u.id_empresa, u.estado_registro, u.fecha_registro,
                r.nombre as rol_nombre,
                s.nombre as sucursal_nombre,
                p.username as padre_username,
                e.razon_social as empresa_nombre
         FROM usuario u
         LEFT JOIN rol r ON u.id_rol = r.id
         LEFT JOIN sucursal s ON u.id_sucursal = s.id
         LEFT JOIN usuario p ON u.id_padre = p.id
         LEFT JOIN empresa e ON u.id_empresa = e.id
         WHERE u.estado_registro = 1
         ORDER BY u.username`
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener usuarios: ${error.message}`);
    }
  }

  async getAdministradores() {
    try {
      const [rows] = await this.connection.execute(
        `SELECT u.id, u.username, u.id_rol, u.id_sucursal, u.id_padre, u.id_empresa, u.estado_registro, u.fecha_registro,
                r.nombre as rol_nombre,
                s.nombre as sucursal_nombre,
                p.username as padre_username,
                e.razon_social as empresa_nombre
         FROM usuario u
         LEFT JOIN rol r ON u.id_rol = r.id
         LEFT JOIN sucursal s ON u.id_sucursal = s.id
         LEFT JOIN usuario p ON u.id_padre = p.id
         LEFT JOIN empresa e ON u.id_empresa = e.id
         WHERE u.id_rol = 1
           AND (u.id_empresa IS NULL OR u.id_empresa != 0)
           AND (u.estado_registro = 1)
         ORDER BY u.username`
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener administradores: ${error.message}`);
    }
  }

  async getByRol(idRol) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT u.id, u.username, u.id_padre, u.id_sucursal,
                s.nombre as sucursal_nombre,
                p.username as padre_username
         FROM usuario u
         LEFT JOIN sucursal s ON u.id_sucursal = s.id
         LEFT JOIN usuario p ON u.id_padre = p.id
         WHERE u.id_rol = ? AND u.estado_registro = 1
         ORDER BY u.id`,
        [idRol]
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener usuarios por rol: ${error.message}`);
    }
  }

  async getById(id) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT u.*, r.nombre as rol_nombre
         FROM usuario u
         LEFT JOIN rol r ON u.id_rol = r.id
         WHERE u.id = ? AND u.estado_registro = 1`,
        [id]
      );
      return rows[0];
    } catch (error) {
      throw new Error(`Error al obtener usuario: ${error.message}`);
    }
  }

  async getByUserAndPass(username, password) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT u.*, r.nombre as rol_nombre
         FROM usuario u
         INNER JOIN rol r ON u.id_rol = r.id
         WHERE u.username = ? AND u.estado_registro = 1`,
        [username]
      );
      if (rows.length === 0) return undefined;

      const user = rows[0];
      const match = await bcrypt.compare(password, user.password);
      return match ? user : undefined;
    } catch (error) {
      throw new Error(`Error al obtener usuario: ${error.message}`);
    }
  }

  async create({ id_rol, username, password, id_sucursal, id_padre, id_empresa, usuario_registro = null }) {
    try {
      const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);
      const [result] = await this.connection.execute(
        `INSERT INTO usuario (id_rol, username, password, id_sucursal, id_padre, id_empresa, estado_registro, fecha_registro, usuario_registro, fecha_actualizacion, usuario_actualizacion)
         VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?)`,
        [id_rol, username, hashedPassword, id_sucursal || null, id_padre || null, id_empresa || null, usuario_registro, usuario_registro]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error al crear usuario: ${error.message}`);
    }
  }

  async update(id, { id_rol, username, password, id_sucursal, id_padre, id_empresa, usuario_actualizacion = null }) {
    try {
      let query = `UPDATE usuario SET id_rol = ?, username = ?, id_sucursal = ?, id_padre = ?, id_empresa = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP`;
      let params = [id_rol, username, id_sucursal || null, id_padre || null, id_empresa || null, usuario_actualizacion];

      if (password) {
        const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);
        query += `, password = ?`;
        params.push(hashedPassword);
      }

      query += ` WHERE id = ?`;
      params.push(id);

      const [result] = await this.connection.execute(query, params);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al actualizar usuario: ${error.message}`);
    }
  }

  async delete(id, usuario_actualizacion = null) {
    try {
      const [result] = await this.connection.execute(
        'UPDATE usuario SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
        [usuario_actualizacion, id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al eliminar usuario: ${error.message}`);
    }
  }

  async existsUsername(username, excludeId = null) {
    try {
      let query = `SELECT id FROM usuario WHERE username = ? AND estado_registro = 1`;
      const params = [username];

      if (excludeId) {
        query += ` AND id != ?`;
        params.push(excludeId);
      }

      const [rows] = await this.connection.execute(query, params);
      return rows.length > 0;
    } catch (error) {
      throw new Error(`Error al verificar username: ${error.message}`);
    }
  }

  async verifyPassword(id, password) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT password FROM usuario WHERE id = ? AND estado_registro = 1`,
        [id]
      );
      if (rows.length === 0) return false;
      return bcrypt.compare(password, rows[0].password);
    } catch (error) {
      throw new Error(`Error al verificar contraseña: ${error.message}`);
    }
  }

  async updatePassword(id, newPassword) {
  try {
    const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    const [result] = await this.connection.execute(
      `UPDATE usuario SET password = ? WHERE id = ?`,
      [hashedPassword, id]
    );

    if (result.affectedRows === 0) {
      throw new Error("Usuario no encontrado");
    }

    return true;
  } catch (error) {
    throw new Error(`Error al actualizar contraseña: ${error.message}`);
  }
}
}

module.exports = UsuarioModel;
