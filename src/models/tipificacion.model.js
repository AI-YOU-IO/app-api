const { pool } = require("../config/dbConnection.js");

class TipificacionModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll(id_empresa = null) {
    try {
      let query = `SELECT * FROM tipificacion_whasap WHERE estado_registro = 1`;
      const params = [];

      if (id_empresa) {
        query += ' AND id_empresa = ?';
        params.push(id_empresa);
      }

      query += ' ORDER BY COALESCE(id_padre, 0) ASC, orden ASC, nombre ASC';

      const [rows] = await this.connection.execute(query, params);
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener tipificaciones: ${error.message}`);
    }
  }

  async getAllForBot(id_empresa = null) {
    try {
      let query = `SELECT * FROM tipificacion_whasap WHERE estado_registro = 1 AND flag_bot = 1`;
      const params = [];

      if (id_empresa) {
        query += ' AND id_empresa = ?';
        params.push(id_empresa);
      }

      query += ' ORDER BY COALESCE(id_padre, 0) ASC, orden ASC, nombre ASC';

      const [rows] = await this.connection.execute(query, params);
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener tipificaciones bot: ${error.message}`);
    }
  }

  async getByIdPadre(id_padre, id_empresa = null) {
    try {
      let query = `SELECT * FROM tipificacion_whasap WHERE estado_registro = 1 AND id_padre = ?`;
      const params = [id_padre];

      if (id_empresa) {
        query += ' AND id_empresa = ?';
        params.push(id_empresa);
      }

      query += ' ORDER BY orden ASC, nombre ASC';

      const [rows] = await this.connection.execute(query, params);
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener tipificaciones por padre: ${error.message}`);
    }
  }

  async getPadres(id_empresa = null) {
    try {
      let query = `SELECT * FROM tipificacion_whasap WHERE estado_registro = 1 AND id_padre IS NULL`;
      const params = [];

      if (id_empresa) {
        query += ' AND id_empresa = ?';
        params.push(id_empresa);
      }

      query += ' ORDER BY orden ASC, nombre ASC';

      const [rows] = await this.connection.execute(query, params);
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener tipificaciones padre: ${error.message}`);
    }
  }

  async getById(id) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT id, id_padre, nombre, definicion, orden, color, flag_asesor, flag_bot, fecha_registro, fecha_actualizacion
         FROM tipificacion_whasap WHERE id = ? AND estado_registro = 1`,
        [id]
      );
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Error al obtener tipificacion: ${error.message}`);
    }
  }

  async create(data) {
    try {
      const { nombre, definicion, orden, color, flag_asesor, flag_bot, id_empresa = null, id_padre = null, usuario_registro = null } = data;
      const [result] = await this.connection.execute(
        `INSERT INTO tipificacion (nombre, definicion, orden, color, flag_asesor, flag_bot, id_empresa, id_padre, usuario_registro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, definicion || null, orden || 0, color || null, flag_asesor, flag_bot, id_empresa, id_padre, usuario_registro]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error al crear tipificacion: ${error.message}`);
    }
  }

  async update(id, data) {
    try {
      const { nombre, definicion, orden, color, flag_asesor, flag_bot, id_empresa = null, id_padre = null, usuario_actualizacion = null } = data;
      const ordenValue = orden !== undefined && orden !== null ? orden : 0;

      let query = `UPDATE tipificacion SET nombre = ?, definicion = ?, orden = ?, color = ?, flag_asesor = ?, flag_bot = ?, id_padre = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
      const params = [nombre, definicion || null, ordenValue, color || null, flag_asesor, flag_bot, id_padre, usuario_actualizacion, id];

      if (id_empresa) {
        query = `UPDATE tipificacion SET nombre = ?, definicion = ?, orden = ?, color = ?, flag_asesor = ?, flag_bot = ?, id_padre = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND id_empresa = ?`;
        params.push(id_empresa);
      }

      await this.connection.execute(query, params);
      return true;
    } catch (error) {
      throw new Error(`Error al actualizar tipificacion: ${error.message}`);
    }
  }

  async delete(id, id_empresa = null, usuario_actualizacion = null) {
    try {
      let query = `UPDATE tipificacion SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
      const params = [usuario_actualizacion, id];

      if (id_empresa) {
        query = `UPDATE tipificacion SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND id_empresa = ?`;
        params.push(id_empresa);
      }

      const [result] = await this.connection.execute(query, params);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al eliminar tipificacion: ${error.message}`);
    }
  }
}

module.exports = TipificacionModel;
