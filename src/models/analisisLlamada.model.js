const { pool } = require("../config/dbConnection.js");

class AnalisisLlamadaModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByLlamada(id_llamada) {
        const [rows] = await this.connection.execute(
            `SELECT * FROM analisis_llamada WHERE id_llamada = ? AND estado_registro = 1`,
            [id_llamada]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    async getByChat(id_chat) {
        const [rows] = await this.connection.execute(
            `SELECT * FROM analisis_llamada WHERE id_chat = ? AND estado_registro = 1`,
            [id_chat]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    async create({ id_llamada = null, id_chat = null, total_tokens, total_palabras, tiempo_habla_seg, tiempo_silencio_seg, cumplimiento_protocolo, fcr, resumen, id_empresa, usuario_registro = null }) {
        const [result] = await this.connection.execute(
            `INSERT INTO analisis_llamada
            (id_llamada, id_chat, total_tokens, total_palabras, tiempo_habla_seg, tiempo_silencio_seg, cumplimiento_protocolo, fcr, resumen, id_empresa, estado_registro, usuario_registro)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [id_llamada, id_chat, total_tokens, total_palabras, tiempo_habla_seg, tiempo_silencio_seg, cumplimiento_protocolo, fcr ? 1 : 0, resumen, id_empresa, usuario_registro]
        );
        return result.insertId;
    }

    async deleteByLlamada(id_llamada) {
        const [result] = await this.connection.execute(
            `UPDATE analisis_llamada SET estado_registro = 0 WHERE id_llamada = ?`,
            [id_llamada]
        );
        return result.affectedRows;
    }

    async deleteByChat(id_chat) {
        const [result] = await this.connection.execute(
            `UPDATE analisis_llamada SET estado_registro = 0 WHERE id_chat = ?`,
            [id_chat]
        );
        return result.affectedRows;
    }
}

module.exports = AnalisisLlamadaModel;
