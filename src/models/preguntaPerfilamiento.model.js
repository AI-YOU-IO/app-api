const { pool } = require("../config/dbConnection.js");

class PreguntaPerfilamientoModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll(id_empresa = null) {
    let query = `SELECT id, pregunta, orden FROM pregunta_perfilamiento WHERE estado_registro = 1`;
    const params = [];

    if (id_empresa) {
      query += ' AND id_empresa = ?';
      params.push(id_empresa);
    }

    query += ' ORDER BY orden ASC';

    const [rows] = await this.connection.execute(query, params);
    return rows;
  }

  async getById(id) {
    const [rows] = await this.connection.execute(
      `SELECT id, pregunta, orden, estado_registro, fecha_registro, fecha_actualizacion
       FROM pregunta_perfilamiento WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async create(data) {
    const { pregunta, orden, id_empresa = null, usuario_registro = null } = data;
    const [result] = await this.connection.execute(
      `INSERT INTO pregunta_perfilamiento (pregunta, orden, id_empresa, usuario_registro) VALUES (?, ?, ?, ?)`,
      [pregunta, orden || 0, id_empresa, usuario_registro]
    );
    return result.insertId;
  }

  async update(id, data) {
    const { pregunta, orden, id_empresa = null, usuario_actualizacion = null } = data;

    let query = `UPDATE pregunta_perfilamiento SET pregunta = ?, orden = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
    const params = [pregunta, orden || 0, usuario_actualizacion, id];

    if (id_empresa) {
      query = `UPDATE pregunta_perfilamiento SET pregunta = ?, orden = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND id_empresa = ?`;
      params.push(id_empresa);
    }

    await this.connection.execute(query, params);
    return true;
  }

  async delete(id, id_empresa = null, usuario_actualizacion = null) {
    let query = `UPDATE pregunta_perfilamiento SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
    const params = [usuario_actualizacion, id];

    if (id_empresa) {
      query = `UPDATE pregunta_perfilamiento SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND id_empresa = ?`;
      params.push(id_empresa);
    }

    await this.connection.execute(query, params);
    return true;
  }
}

module.exports = PreguntaPerfilamientoModel;
