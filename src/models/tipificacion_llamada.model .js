const { pool } = require("../config/dbConnection.js");

class TipificacionModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll(id_empresa) {
    let query = `SELECT * FROM tipificacion_llamada WHERE id_empresa = ?`;
    const params = [id_empresa];

    const [rows] = await this.connection.execute(query, params);
    return rows;
  }

  async getById(id) {
    const [rows] = await this.connection.execute(
      `SELECT id, nombre, descripcion
       FROM tipificacion_llamada WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async create(data) {
    const { nombre, descripcion, orden, color, id_empresa } = data;
    const [result] = await this.connection.execute(
      `INSERT INTO tipificacion_llamada (nombre, descripcion, orden, color, id_empresa) VALUES (?, ?, ?, ?, ?)`,
      [nombre, descripcion || null, orden || 0, color || null, id_empresa]
    );
    return result.insertId;
  }

  async update(id, data, id_empresa) {
    const { nombre, descripcion, orden, color } = data;
    const ordenValue = orden !== undefined && orden !== null ? orden : 0;

    let query = `UPDATE tipificacion_llamada SET nombre = ?, descripcion = ?, orden = ?, color = ? WHERE id = ? AND id_empresa = ?`;
    const params = [nombre, descripcion || null, ordenValue, color || null, id, id_empresa];

    const [result] = await this.connection.execute(query, params);
    return result.affectedRows > 0;
  }

  async delete(id, id_empresa) {
    let query = `DELETE FROM tipificacion_llamada WHERE id = ? AND id_empresa = ?`;
    const params = [id, id_empresa];

    const [result] = await this.connection.execute(query, params);
    return result.affectedRows > 0;
  }
}

module.exports = new TipificacionModel();
