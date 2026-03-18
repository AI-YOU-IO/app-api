const { pool } = require("../config/dbConnection.js");

class MessageSandboxModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByChatId(idChatSandbox) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM message_sandbox WHERE id_chat_sandbox = ? ORDER BY fecha_hora ASC`,
                [idChatSandbox]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener mensajes sandbox: ${error.message}`);
        }
    }

    async create({ direction, message, type, url, id_chat_sandbox }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO message_sandbox (direction, message, type, url, id_chat_sandbox, fecha_hora)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [direction, message, type || 'text', url || null, id_chat_sandbox]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear mensaje sandbox: ${error.message}`);
        }
    }
}

module.exports = MessageSandboxModel;
