const { pool } = require("../config/dbConnection.js");

class TipificacionModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll(id_empresa) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT * FROM tipificacion_llamada WHERE estado_registro = 1 AND id_empresa = ?`,
        [id_empresa]
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener tipificaciones de llamada: ${error.message}`);
    }
  }

  async getById(id) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT id, nombre, descripcion FROM tipificacion_llamada WHERE estado_registro = 1 AND id = ?`,
        [id]
      );
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Error al obtener tipificacion de llamada: ${error.message}`);
    }
  }

  async create(data) {
    try {
      const { nombre, descripcion, orden, color, id_empresa, usuario_registro = null } = data;
      const [result] = await this.connection.execute(
        `INSERT INTO tipificacion_llamada (nombre, descripcion, orden, color, id_empresa, usuario_registro) VALUES (?, ?, ?, ?, ?, ?)`,
        [nombre, descripcion || null, orden || 0, color || null, id_empresa, usuario_registro]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error al crear tipificacion de llamada: ${error.message}`);
    }
  }

  async update(id, data, id_empresa) {
    try {
      const { nombre, descripcion, orden, color, usuario_actualizacion = null } = data;
      const ordenValue = orden !== undefined && orden !== null ? orden : 0;
      const [result] = await this.connection.execute(
        `UPDATE tipificacion_llamada SET nombre = ?, descripcion = ?, orden = ?, color = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ? AND id_empresa = ?`,
        [nombre, descripcion || null, ordenValue, color || null, usuario_actualizacion, id, id_empresa]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al actualizar tipificacion de llamada: ${error.message}`);
    }
  }

  async delete(id, id_empresa, usuario_actualizacion = null) {
    try {
      const [result] = await this.connection.execute(
        `UPDATE tipificacion_llamada SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ? AND id_empresa = ?`,
        [usuario_actualizacion, id, id_empresa]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al eliminar tipificacion de llamada: ${error.message}`);
    }
  }
}

module.exports = new TipificacionModel();
