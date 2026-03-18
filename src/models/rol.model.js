const { pool } = require("../config/dbConnection.js");

class RolModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll() {
    try {
      const [rows] = await this.connection.execute(
        "SELECT id, nombre, proposito as descripcion, estado_registro FROM rol WHERE estado_registro = 1 ORDER BY nombre"
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener roles: ${error.message}`);
    }
  }

  async getById(id) {
    try {
      const [rows] = await this.connection.execute(
        "SELECT id, nombre, proposito as descripcion, estado_registro FROM rol WHERE id = ?",
        [id]
      );
      return rows[0];
    } catch (error) {
      throw new Error(`Error al obtener rol: ${error.message}`);
    }
  }

  async create({ nombre, descripcion, usuario_registro = null }) {
    try {
      const [result] = await this.connection.execute(
        "INSERT INTO rol (nombre, proposito, fecha_registro, usuario_registro, fecha_actualizacion, usuario_actualizacion, estado_registro) VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?, 1)",
        [nombre, descripcion, usuario_registro, usuario_registro]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error al crear rol: ${error.message}`);
    }
  }

  async update(id, { nombre, descripcion, usuario_actualizacion = null }) {
    try {
      const [result] = await this.connection.execute(
        "UPDATE rol SET nombre = ?, proposito = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?",
        [nombre, descripcion, usuario_actualizacion, id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al actualizar rol: ${error.message}`);
    }
  }

  async delete(id, usuario_actualizacion = null) {
    try {
      const [result] = await this.connection.execute(
        "UPDATE rol SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?",
        [usuario_actualizacion, id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al eliminar rol: ${error.message}`);
    }
  }

  async getModulosByRolId(rolId) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT m.id, m.nombre, m.ruta
         FROM modulo m
         INNER JOIN rol_modulo rm ON m.id = rm.modulo_id
         WHERE rm.rol_id = ? AND rm.estado_registro = 1 AND m.estado_registro = 1
         ORDER BY m.nombre`,
        [rolId]
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener módulos del rol: ${error.message}`);
    }
  }

  async syncModulos(rolId, moduloIds) {
    try {
      // Soft delete existing relationships
      await this.connection.execute(
        "UPDATE rol_modulo SET estado_registro = 0, fecha_actualizacion = CURRENT_TIMESTAMP WHERE rol_id = ? AND estado_registro = 1",
        [rolId]
      );

      // Insert new relationships
      if (moduloIds && moduloIds.length > 0) {
        const values = moduloIds.map(moduloId => [rolId, moduloId]);
        const placeholders = values.map(() => '(?, ?)').join(', ');
        const flatValues = values.flat();

        await this.connection.execute(
          `INSERT INTO rol_modulo (rol_id, modulo_id) VALUES ${placeholders}`,
          flatValues
        );
      }

      return true;
    } catch (error) {
      throw new Error(`Error al sincronizar módulos del rol: ${error.message}`);
    }
  }
}

module.exports = RolModel;
