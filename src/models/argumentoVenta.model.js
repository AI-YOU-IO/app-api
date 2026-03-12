const { pool } = require("../config/dbConnection.js");

class ArgumentoVentaModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll(id_empresa = null) {
    let query = `SELECT id, titulo, argumento, id_empresa, estado_registro, fecha_registro, fecha_actualizacion
       FROM argumento_venta WHERE estado_registro = 1`;
    const params = [];

    if (id_empresa) {
      query += ' AND id_empresa = ?';
      params.push(id_empresa);
    }

    query += ' ORDER BY id ASC';

    const [rows] = await this.connection.execute(query, params);
    return rows;
  }

  async getById(id) {
    const [rows] = await this.connection.execute(
      `SELECT id, titulo, argumento, estado_registro, fecha_registro, fecha_actualizacion
       FROM argumento_venta WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async create(data) {
    const { titulo, argumento, id_empresa = null, usuario_registro = null } = data;
    const [result] = await this.connection.execute(
      `INSERT INTO argumento_venta (titulo, argumento, id_empresa, usuario_registro) VALUES (?, ?, ?, ?)`,
      [titulo, argumento, id_empresa, usuario_registro]
    );
    return result.insertId;
  }

  async update(id, data) {
    const { titulo, argumento, id_empresa = null, usuario_actualizacion = null } = data;

    let query = `UPDATE argumento_venta SET titulo = ?, argumento = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ?`;
    const params = [titulo, argumento, usuario_actualizacion, id];

    if (id_empresa) {
      query = `UPDATE argumento_venta SET titulo = ?, argumento = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ? AND id_empresa = ?`;
      params.push(id_empresa);
    }

    await this.connection.execute(query, params);
    return true;
  }

  async delete(id, id_empresa = null, usuario_actualizacion = null) {
    let query = `UPDATE argumento_venta SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ?`;
    const params = [usuario_actualizacion, id];

    if (id_empresa) {
      query = `UPDATE argumento_venta SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ? AND id_empresa = ?`;
      params.push(id_empresa);
    }

    await this.connection.execute(query, params);
    return true;
  }
}

module.exports = ArgumentoVentaModel;
