const { pool } = require("../config/dbConnection.js");

class MensajeModel {

    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async create({ id_chat, direccion, tipo_mensaje, wid_mensaje, contenido, contenido_archivo, fecha_hora, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO mensaje (id_chat, direccion, tipo_mensaje, wid_mensaje, contenido, contenido_archivo, fecha_hora, estado_registro, usuario_registro)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [id_chat, direccion, tipo_mensaje, wid_mensaje, contenido, contenido_archivo || null, fecha_hora, usuario_registro]
            );

            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear mensaje: ${error.message}`);
        }
    }

    async findByChatId(chatId) {
        try {
            const [rows] = await this.connection.execute(
                "SELECT * FROM mensaje WHERE id_chat = ? AND estado_registro = 1",
                [chatId]
            );

            return rows;
        } catch (error) {
            throw new Error(`Error al buscar mensajes por chat: ${error.message}`);
        }
    }

    async updateEstadoEntrega(wid_mensaje, estado_entrega) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE mensaje SET estado_entrega = ? WHERE wid_mensaje = ? AND estado_registro = 1`,
                [estado_entrega, wid_mensaje]
            );

            return result.affectedRows;
        } catch (error) {
            throw new Error(`Error al actualizar estado_entrega: ${error.message}`);
        }
    }
}

module.exports = new MensajeModel();
