const { pool } = require("../config/dbConnection.js");

class EmpresaModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll() {
    try {
      const [rows] = await this.connection.execute(
        `SELECT e.id, e.razon_social as nombre, e.nombre_comercial, e.ruc, e.email, e.telefono, e.direccion, e.logo_url, e.estado_registro, e.fecha_registro, e.id_tool, e.id_tool_chatbot, e.canal, e.id_troncal, t.nombre as tool_nombre, tc.nombre as tool_chatbot_nombre, tr.codigo as troncal_codigo, tr.nombre as troncal_nombre
         FROM empresa e
         LEFT JOIN tool t ON e.id_tool = t.id
         LEFT JOIN tool tc ON e.id_tool_chatbot = tc.id
         LEFT JOIN troncal tr ON e.id_troncal = tr.id
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
        `SELECT e.id, e.razon_social as nombre, e.nombre_comercial, e.ruc, e.email, e.telefono, e.direccion, e.logo_url, e.estado_registro, e.fecha_registro, e.id_tool, e.id_tool_chatbot, e.canal, e.id_troncal, t.nombre as tool_nombre, tc.nombre as tool_chatbot_nombre, tr.codigo as troncal_codigo, tr.nombre as troncal_nombre
         FROM empresa e
         LEFT JOIN tool t ON e.id_tool = t.id
         LEFT JOIN tool tc ON e.id_tool_chatbot = tc.id
         LEFT JOIN troncal tr ON e.id_troncal = tr.id
         WHERE e.id = ?`,
        [id]
      );
      return rows[0];
    } catch (error) {
      throw new Error(`Error al obtener empresa: ${error.message}`);
    }
  }

  async create({ nombre, ruc, direccion, telefono, email, canal, id_tool, id_tool_chatbot, id_troncal, usuario_registro = null }) {
    try {
      const [result] = await this.connection.execute(
        `INSERT INTO empresa (razon_social, ruc, direccion, telefono, email, canal, id_tool, id_tool_chatbot, id_troncal, estado_registro, fecha_registro, usuario_registro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)`,
        [nombre, ruc || null, direccion || null, telefono || null, email || null, canal || null, id_tool || null, id_tool_chatbot || null, id_troncal || null, usuario_registro]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error al crear empresa: ${error.message}`);
    }
  }

  async update(id, { nombre, ruc, direccion, telefono, email, canal, id_tool, id_tool_chatbot, id_troncal, usuario_actualizacion = null }) {
    try {
      const [result] = await this.connection.execute(
        `UPDATE empresa SET razon_social = ?, ruc = ?, direccion = ?, telefono = ?, email = ?, canal = ?, id_tool = ?, id_tool_chatbot = ?, id_troncal = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nombre, ruc || null, direccion || null, telefono || null, email || null, canal || null, id_tool || null, id_tool_chatbot || null, id_troncal || null, usuario_actualizacion, id]
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

  async getTroncal(id_empresa) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT tr.id, tr.nombre, tr.codigo, tr.pais
         FROM empresa e
         INNER JOIN troncal tr ON e.id_troncal = tr.id
         WHERE e.id = ? AND tr.estado_registro = 1`,
        [id_empresa]
      );
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Error al obtener troncal de empresa: ${error.message}`);
    }
  }

  async updateTroncal(id_empresa, id_troncal, usuario_actualizacion = null) {
    try {
      const [result] = await this.connection.execute(
        `UPDATE empresa SET id_troncal = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
        [id_troncal, usuario_actualizacion, id_empresa]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al actualizar troncal de empresa: ${error.message}`);
    }
  }
}

module.exports = EmpresaModel;
