const { pool } = require("../config/dbConnection.js");

class EmpresaModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll() {
    try {
      const [rows] = await this.connection.execute(
        `SELECT id, razon_social as nombre, nombre_comercial, ruc, email, telefono, direccion, logo_url, estado_registro, fecha_registro
         FROM empresa ORDER BY razon_social`
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener empresas: ${error.message}`);
    }
  }

  async updateEstado(id, estado, usuario_actualizacion = null) {
    try {
      const [result] = await this.connection.execute(
        `UPDATE empresa SET estado_registro = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ?`,
        [estado, usuario_actualizacion, id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al actualizar estado de empresa: ${error.message}`);
    }
  }

  async getById(id) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT id, razon_social as nombre, nombre_comercial, ruc, email, telefono, direccion, logo_url, estado_registro, fecha_registro
         FROM empresa WHERE id = ?`,
        [id]
      );
      return rows[0];
    } catch (error) {
      throw new Error(`Error al obtener empresa: ${error.message}`);
    }
  }

  async create({ nombre, ruc, direccion, telefono, email, usuario_registro = null }) {
    try {
      const [result] = await this.connection.execute(
        `INSERT INTO empresa (razon_social, ruc, direccion, telefono, email, estado_registro, fecha_registro, usuario_registro)
         VALUES (?, ?, ?, ?, ?, 1, NOW(), ?)`,
        [nombre, ruc || null, direccion || null, telefono || null, email || null, usuario_registro]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error al crear empresa: ${error.message}`);
    }
  }

  async update(id, { nombre, ruc, direccion, telefono, email, usuario_actualizacion = null }) {
    try {
      const [result] = await this.connection.execute(
        `UPDATE empresa SET razon_social = ?, ruc = ?, direccion = ?, telefono = ?, email = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW()
         WHERE id = ?`,
        [nombre, ruc || null, direccion || null, telefono || null, email || null, usuario_actualizacion, id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al actualizar empresa: ${error.message}`);
    }
  }

  async delete(id, usuario_actualizacion = null) {
    try {
      const [result] = await this.connection.execute(
        `UPDATE empresa SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ?`,
        [usuario_actualizacion, id]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al eliminar empresa: ${error.message}`);
    }
  }

  async getCount() {
    try {
      const [rows] = await this.connection.execute(
        `SELECT COUNT(*) as total FROM empresa WHERE estado_registro = 1`
      );
      return rows[0].total;
    } catch (error) {
      throw new Error(`Error al contar empresas: ${error.message}`);
    }
  }
}

module.exports = EmpresaModel;
