const { pool } = require("../config/dbConnection.js");

class EmpresaModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll() {
    try {
      const [rows] = await this.connection.execute(
<<<<<<< Updated upstream
        `SELECT e.id, e.razon_social as nombre, e.nombre_comercial, e.ruc, e.email, e.telefono, e.direccion, e.logo_url, e.estado_registro, e.fecha_registro, e.id_tool, e.canal, t.nombre as tool_nombre
         FROM empresa e
         LEFT JOIN tool t ON e.id_tool = t.id
=======
        `SELECT e.id, e.razon_social as nombre, e.nombre_comercial, e.ruc, e.email, e.telefono, e.direccion, e.canal, e.logo_url, e.estado_registro, e.fecha_registro, e.id_tool, t.nombre as tool_nombre
         FROM empresa e
         LEFT JOIN tool t ON t.id = e.id_tool
>>>>>>> Stashed changes
         ORDER BY e.razon_social`
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener empresas: ${error.message}`);
    }
  }

  async updateEstado(id, estado, usuario_actualizacion = null) {
    try {
      const [result] = await this.connection.execute(
        `UPDATE empresa SET estado_registro = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
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
<<<<<<< Updated upstream
        `SELECT e.id, e.razon_social as nombre, e.nombre_comercial, e.ruc, e.email, e.telefono, e.direccion, e.logo_url, e.estado_registro, e.fecha_registro, e.id_tool, e.canal, t.nombre as tool_nombre
         FROM empresa e
         LEFT JOIN tool t ON e.id_tool = t.id
         WHERE e.id = ?`,
=======
        `SELECT id, razon_social as nombre, nombre_comercial, ruc, email, telefono, direccion, canal, logo_url, estado_registro, fecha_registro, id_tool
         FROM empresa WHERE id = ?`,
>>>>>>> Stashed changes
        [id]
      );
      return rows[0];
    } catch (error) {
      throw new Error(`Error al obtener empresa: ${error.message}`);
    }
  }

  async create({ nombre, ruc, direccion, telefono, email, canal, id_tool, usuario_registro = null }) {
    try {
      const [result] = await this.connection.execute(
        `INSERT INTO empresa (razon_social, ruc, direccion, telefono, email, canal, id_tool, estado_registro, fecha_registro, usuario_registro)
<<<<<<< Updated upstream
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)`,
        [nombre, ruc || null, direccion || null, telefono || null, email || null, canal || null, id_tool || null, usuario_registro]
=======
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), ?)`,
        [nombre, ruc || null, direccion || null, telefono || null, email || null, canal ?? null, id_tool || null, usuario_registro]
>>>>>>> Stashed changes
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error al crear empresa: ${error.message}`);
    }
  }

  async update(id, { nombre, ruc, direccion, telefono, email, canal, id_tool, usuario_actualizacion = null }) {
    try {
      const [result] = await this.connection.execute(
<<<<<<< Updated upstream
        `UPDATE empresa SET razon_social = ?, ruc = ?, direccion = ?, telefono = ?, email = ?, canal = ?, id_tool = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nombre, ruc || null, direccion || null, telefono || null, email || null, canal || null, id_tool || null, usuario_actualizacion, id]
=======
        `UPDATE empresa SET razon_social = ?, ruc = ?, direccion = ?, telefono = ?, email = ?, canal = ?, id_tool = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW()
         WHERE id = ?`,
        [nombre, ruc || null, direccion || null, telefono || null, email || null, canal ?? null, id_tool || null, usuario_actualizacion, id]
>>>>>>> Stashed changes
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al actualizar empresa: ${error.message}`);
    }
  }

  async delete(id, usuario_actualizacion = null) {
    try {
      const [result] = await this.connection.execute(
        `UPDATE empresa SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
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
        `SELECT COUNT(*)::integer as total FROM empresa WHERE estado_registro = 1`
      );
      return rows[0].total;
    } catch (error) {
      throw new Error(`Error al contar empresas: ${error.message}`);
    }
  }
}

module.exports = EmpresaModel;
