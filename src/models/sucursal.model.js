const { pool } = require("../config/dbConnection.js");

class SucursalModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll(id_empresa = null) {
    try {
      let query = `SELECT id, empresa_id, nombre, direccion, telefono, email,
                          estado, provincia, ciudad,
                          estado_registro, fecha_registro, usuario_registro
         FROM sucursal
         WHERE estado_registro = 1`;
      const params = [];

      if (id_empresa) {
        query += ` AND empresa_id = ?`;
        params.push(id_empresa);
      }

      query += ` ORDER BY nombre`;

      const [rows] = await this.connection.execute(query, params);
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener sucursales: ${error.message}`);
    }
  }

  async getById(id) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT id, nombre, direccion, telefono, email, estado, provincia, ciudad,
                estado_registro, fecha_registro
         FROM sucursal
         WHERE id = ?`,
        [id]
      );
      return rows[0];
    } catch (error) {
      throw new Error(`Error al obtener sucursal: ${error.message}`);
    }
  }

  async create({ nombre, direccion, telefono, email, estado, provincia, ciudad, id_empresa, usuario_registro = null }) {
    try {
      const [result] = await this.connection.execute(
        `INSERT INTO sucursal (nombre, direccion, telefono, email, estado, provincia, ciudad, estado_registro, fecha_registro, usuario_registro, empresa_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, ?)`,
        [nombre, direccion, telefono, email, estado || null, provincia || null, ciudad || null, usuario_registro, id_empresa]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error al crear sucursal: ${error.message}`);
    }
  }

  async update(id, { nombre, direccion, telefono, email, estado, provincia, ciudad, id_empresa, usuario_actualizacion = null }) {
    try {
      let query = `UPDATE sucursal SET nombre = ?, direccion = ?, telefono = ?, email = ?, estado = ?, provincia = ?, ciudad = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
      const params = [nombre, direccion, telefono, email, estado || null, provincia || null, ciudad || null, usuario_actualizacion, id];

      if (id_empresa) {
        query = `UPDATE sucursal SET nombre = ?, direccion = ?, telefono = ?, email = ?, estado = ?, provincia = ?, ciudad = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND empresa_id = ?`;
        params.push(id_empresa);
      }

      const [result] = await this.connection.execute(query, params);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al actualizar sucursal: ${error.message}`);
    }
  }

  async delete(id, id_empresa = null, usuario_actualizacion = null) {
    try {
      let query = `UPDATE sucursal SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
      const params = [usuario_actualizacion, id];

      if (id_empresa) {
        query = `UPDATE sucursal SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND empresa_id = ?`;
        params.push(id_empresa);
      }

      const [result] = await this.connection.execute(query, params);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al eliminar sucursal: ${error.message}`);
    }
  }

  async buscar(termino, id_empresa) {
    try {
      const query = `SELECT id, empresa_id, nombre, direccion, telefono, email,
                          estado, provincia, ciudad
         FROM sucursal
         WHERE estado_registro = 1
           AND empresa_id = ?
           AND (nombre LIKE ? OR direccion LIKE ? OR estado LIKE ? OR provincia LIKE ? OR ciudad LIKE ?)
         ORDER BY nombre LIMIT 10`;
      const searchTerm = `%${termino}%`;
      const params = [id_empresa, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];

      const [rows] = await this.connection.execute(query, params);
      return rows;
    } catch (error) {
      throw new Error(`Error al buscar sucursales: ${error.message}`);
    }
  }
}

module.exports = SucursalModel;
