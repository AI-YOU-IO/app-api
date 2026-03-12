const { pool } = require("../config/dbConnection.js");

class ModuloModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll() {
    try {
      const [rows] = await this.connection.execute(
        `SELECT id, nombre, ruta, estado_registro, fecha_registro
         FROM modulo
         WHERE estado_registro = 1
         ORDER BY nombre`
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener módulos: ${error.message}`);
    }
  }

  async getById(id) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT id, nombre, ruta, estado_registro, fecha_registro
         FROM modulo
         WHERE id = ?`,
        [id]
      );
      return rows[0];
    } catch (error) {
      throw new Error(`Error al obtener módulo: ${error.message}`);
    }
  }

  async create({ nombre, ruta, usuario_registro = null }) {
    try {
      const [result] = await this.connection.execute(
        `INSERT INTO modulo (nombre, ruta, fecha_registro, usuario_registro, estado_registro)
         VALUES (?, ?, NOW(), ?, 1)`,
        [nombre, ruta, usuario_registro]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error al crear módulo: ${error.message}`);
    }
  }

  async update(id, { nombre, ruta, usuario_actualizacion = null }) {
    try {
      const [result] = await this.connection.execute(
        `UPDATE modulo SET nombre = ?, ruta = ?, fecha_actualizacion = NOW(), usuario_actualizacion = ?
         WHERE id = ?`,
        [nombre, ruta, usuario_actualizacion, id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al actualizar módulo: ${error.message}`);
    }
  }

  async delete(id, usuario_actualizacion = null) {
    try {
      const [result] = await this.connection.execute(
        `UPDATE modulo SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW()
         WHERE id = ?`,
        [usuario_actualizacion, id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al eliminar módulo: ${error.message}`);
    }
  }

  async getByRolId(idRol) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT m.id, m.nombre, m.ruta
         FROM modulo m
         INNER JOIN rol_modulo rm ON m.id = rm.modulo_id
         WHERE rm.rol_id = ? AND m.estado_registro = 1
         ORDER BY m.nombre`,
        [idRol]
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener módulos por rol: ${error.message}`);
    }
  }
}

module.exports = ModuloModel;
