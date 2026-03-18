const { pool } = require("../config/dbConnection.js");

class EstadoLlamadaAsteriskModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByCodigo(codigo) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM estado_llamada_asterisk
                WHERE codigo = ? AND estado_registro = 1`,
                [codigo]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener estado por código: ${error.message}`);
        }
    }

    async getAll() {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM estado_llamada_asterisk
                WHERE estado_registro = 1
                ORDER BY id`
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener estados: ${error.message}`);
        }
    }
}

module.exports = EstadoLlamadaAsteriskModel;
