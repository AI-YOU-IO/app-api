const { pool } = require("../config/dbConnection.js");

class PeriodicidadRecordatorioModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll(empresa_id = null) {
    let query = `SELECT id, nombre, cada_horas, empresa_id, estado_registro, fecha_registro, fecha_actualizacion
       FROM periodicidad_recordatorio WHERE estado_registro = 1`;
    const params = [];

    if (empresa_id) {
      query += ' AND empresa_id = ?';
      params.push(empresa_id);
    }

    query += ' ORDER BY cada_horas ASC';

    const [rows] = await this.connection.execute(query, params);
    return rows;
  }

  async getById(id) {
    const [rows] = await this.connection.execute(
      `SELECT id, nombre, cada_horas, estado_registro, fecha_registro, fecha_actualizacion
       FROM periodicidad_recordatorio WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async create(data) {
    const { nombre, cada_horas, empresa_id = null, id_empresa = null, usuario_registro = null } = data;
    const [result] = await this.connection.execute(
      `INSERT INTO periodicidad_recordatorio (nombre, cada_horas, empresa_id, usuario_registro) VALUES (?, ?, ?, ?)`,
      [nombre, cada_horas, empresa_id || id_empresa, usuario_registro]
    );
    return result.insertId;
  }

  async update(id, data) {
    const { nombre, cada_horas, empresa_id = null, id_empresa = null, usuario_actualizacion = null } = data;
    const empresaId = empresa_id || id_empresa;

    let query = `UPDATE periodicidad_recordatorio SET nombre = ?, cada_horas = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
    const params = [nombre, cada_horas, usuario_actualizacion, id];

    if (empresaId) {
      query = `UPDATE periodicidad_recordatorio SET nombre = ?, cada_horas = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND empresa_id = ?`;
      params.push(empresa_id);
    }

    await this.connection.execute(query, params);
    return true;
  }

  async delete(id, empresa_id = null, usuario_actualizacion = null) {
    let query = `UPDATE periodicidad_recordatorio SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
    const params = [usuario_actualizacion, id];

    if (empresa_id) {
      query = `UPDATE periodicidad_recordatorio SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND id_empresa = ?`;
      params.push(empresa_id);
    }

    await this.connection.execute(query, params);
    return true;
  }
}

module.exports = PeriodicidadRecordatorioModel;
