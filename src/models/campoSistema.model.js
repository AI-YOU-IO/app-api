const { pool } = require("../config/dbConnection.js");

class CampoSistemaModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll() {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id, nombre, etiqueta, requerido, tipo_dato, estado_registro
                FROM campo_sistema
                WHERE estado_registro = 1
                ORDER BY nombre ASC`
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener campos del sistema: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id, nombre, etiqueta, requerido, tipo_dato, estado_registro
                FROM campo_sistema
                WHERE id = ? AND estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener campo del sistema por ID: ${error.message}`);
        }
    }
}

module.exports = CampoSistemaModel;
