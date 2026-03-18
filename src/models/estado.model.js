const { pool } = require("../config/dbConnection.js");

class EstadoModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll() {
    const [rows] = await this.connection.execute(
      `SELECT id, nombre, color, fecha_registro, fecha_actualizacion
       FROM estado ORDER BY nombre`
    );
    return rows;
  }

  async getById(id) {
    const [rows] = await this.connection.execute(
      `SELECT id, nombre, color, fecha_registro, fecha_actualizacion
       FROM estado WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async updateColor(id, color) {
    await this.connection.execute(
      `UPDATE estado SET color = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
      [color || null, id]
    );
    return true;
  }
}

module.exports = EstadoModel;
