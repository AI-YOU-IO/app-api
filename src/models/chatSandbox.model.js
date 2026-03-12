const { pool } = require("../config/dbConnection.js");

class ChatSandboxModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByChannel(canal) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM chat_sandbox WHERE channel = ? ORDER BY fecha_hora DESC`,
                [canal]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener chats sandbox: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM chat_sandbox WHERE id = ?`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener chat sandbox por ID: ${error.message}`);
        }
    }

    async create({ channel }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO chat_sandbox (channel, fecha_hora) VALUES (?, NOW())`,
                [channel]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear chat sandbox: ${error.message}`);
        }
    }

    async delete(id) {
        try {
            // Eliminar mensajes asociados primero
            await this.connection.execute(
                `DELETE FROM message_sandbox WHERE id_chat_sandbox = ?`,
                [id]
            );
            const [result] = await this.connection.execute(
                `DELETE FROM chat_sandbox WHERE id = ?`,
                [id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar chat sandbox: ${error.message}`);
        }
    }
}

module.exports = ChatSandboxModel;
