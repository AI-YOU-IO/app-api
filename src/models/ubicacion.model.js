const { pool } = require("../config/dbConnection.js");

class UbicacionModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  // Obtener todos los estados (nivel 1)
  async getEstados() {
    const [rows] = await this.connection.execute(
      `SELECT id, nombre, codigo
       FROM ubicacion
       WHERE nivel = 1 AND estado_registro = 1
       ORDER BY nombre`
    );
    return rows;
  }

  // Obtener provincias por estado (nivel 2)
  async getProvinciasByEstado(idEstado) {
    const [rows] = await this.connection.execute(
      `SELECT id, nombre, codigo
       FROM ubicacion
       WHERE nivel = 2 AND id_padre = ? AND estado_registro = 1
       ORDER BY nombre`,
      [idEstado]
    );
    return rows;
  }

  // Obtener ciudades por provincia (nivel 3)
  async getCiudadesByProvincia(idProvincia) {
    const [rows] = await this.connection.execute(
      `SELECT id, nombre, codigo
       FROM ubicacion
       WHERE nivel = 3 AND id_padre = ? AND estado_registro = 1
       ORDER BY nombre`,
      [idProvincia]
    );
    return rows;
  }

  // Obtener ubicación por ID con su jerarquía completa
  async getById(id) {
    const [rows] = await this.connection.execute(
      `SELECT u.id, u.nombre, u.nivel, u.codigo, u.id_padre,
              p.nombre AS nombre_padre, p.id AS id_padre_real,
              a.nombre AS nombre_abuelo, a.id AS id_abuelo
       FROM ubicacion u
       LEFT JOIN ubicacion p ON u.id_padre = p.id
       LEFT JOIN ubicacion a ON p.id_padre = a.id
       WHERE u.id = ? AND u.estado_registro = 1`,
      [id]
    );
    return rows[0] || null;
  }

  // Obtener jerarquía completa de una ciudad (para mostrar "Estado > Provincia > Ciudad")
  async getJerarquiaCompleta(idCiudad) {
    const [rows] = await this.connection.execute(
      `SELECT
         c.id AS ciudad_id, c.nombre AS ciudad_nombre,
         p.id AS provincia_id, p.nombre AS provincia_nombre,
         e.id AS estado_id, e.nombre AS estado_nombre
       FROM ubicacion c
       JOIN ubicacion p ON c.id_padre = p.id
       JOIN ubicacion e ON p.id_padre = e.id
       WHERE c.id = ? AND c.nivel = 3`,
      [idCiudad]
    );
    return rows[0] || null;
  }

  // Crear nueva ubicación
  async create({ nombre, nivel, id_padre, codigo = null }) {
    const [result] = await this.connection.execute(
      `INSERT INTO ubicacion (nombre, nivel, id_padre, codigo, estado_registro)
       VALUES (?, ?, ?, ?, 1)`,
      [nombre, nivel, id_padre, codigo]
    );
    return result.insertId;
  }

  // Actualizar ubicación
  async update(id, { nombre, codigo }) {
    const [result] = await this.connection.execute(
      `UPDATE ubicacion
       SET nombre = ?, codigo = ?, fecha_actualizacion = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nombre, codigo, id]
    );
    return result.affectedRows > 0;
  }

  // Eliminar ubicación (soft delete)
  async delete(id) {
    const [result] = await this.connection.execute(
      `UPDATE ubicacion SET estado_registro = 0, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }
}

module.exports = UbicacionModel;
