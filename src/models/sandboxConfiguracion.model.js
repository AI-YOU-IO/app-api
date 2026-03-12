const { pool } = require("../config/dbConnection.js");

class SandboxConfiguracionModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll() {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM sandbox_configuracion`
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener configuraciones sandbox: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM sandbox_configuracion WHERE id = ?`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener configuración sandbox por ID: ${error.message}`);
        }
    }

    async getByCanal(canal) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM sandbox_configuracion WHERE canal = ?`,
                [canal]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener configuración por canal: ${error.message}`);
        }
    }

    async create({ url_bot_service, canal }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO sandbox_configuracion (url_bot_service, canal) VALUES (?, ?)`,
                [url_bot_service, canal]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear configuración sandbox: ${error.message}`);
        }
    }

    async update(id, { url_bot_service, canal }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE sandbox_configuracion SET url_bot_service = ?, canal = ? WHERE id = ?`,
                [url_bot_service, canal, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar configuración sandbox: ${error.message}`);
        }
    }
}

module.exports = SandboxConfiguracionModel;
