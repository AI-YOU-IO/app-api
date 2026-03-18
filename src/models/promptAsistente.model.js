const { pool } = require("../config/dbConnection.js");

class PromptAsistenteModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByEmpresa(id_empresa) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM prompt_asistente
                WHERE id_empresa = ? AND estado_registro = 1
                LIMIT 1`,
                [id_empresa]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener prompt del asistente: ${error.message}`);
        }
    }

    async upsert({ id_empresa, prompt_sistema, usuario_registro }) {
        try {
            // Verificar si ya existe un registro para esta empresa
            const existing = await this.getByEmpresa(id_empresa);

            if (existing) {
                // Actualizar
                const [result] = await this.connection.execute(
                    `UPDATE prompt_asistente
                    SET prompt_sistema = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                    WHERE id_empresa = ? AND estado_registro = 1`,
                    [prompt_sistema, usuario_registro, id_empresa]
                );
                return { id: existing.id, updated: true };
            } else {
                // Crear
                const [result] = await this.connection.execute(
                    `INSERT INTO prompt_asistente (id_empresa, prompt_sistema, estado_registro, usuario_registro)
                    VALUES (?, ?, 1, ?)`,
                    [id_empresa, prompt_sistema, usuario_registro]
                );
                return { id: result.insertId, updated: false };
            }
        } catch (error) {
            throw new Error(`Error al guardar prompt del asistente: ${error.message}`);
        }
    }
}

module.exports = PromptAsistenteModel;
