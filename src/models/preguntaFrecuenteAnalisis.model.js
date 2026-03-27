const { pool } = require("../config/dbConnection.js");

class PreguntaFrecuenteAnalisisModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByLlamada(id_llamada) {
        const [rows] = await this.connection.execute(
            `SELECT * FROM pregunta_frecuente_analisis WHERE id_llamada = ? AND estado_registro = 1 ORDER BY frecuencia DESC`,
            [id_llamada]
        );
        return rows;
    }

    async getByChat(id_chat) {
        const [rows] = await this.connection.execute(
            `SELECT * FROM pregunta_frecuente_analisis WHERE id_chat = ? AND estado_registro = 1 ORDER BY frecuencia DESC`,
            [id_chat]
        );
        return rows;
    }

    async createBulk(items) {
        if (!items || items.length === 0) return;

        for (const item of items) {
            await this.connection.execute(
                `INSERT INTO pregunta_frecuente_analisis
                (id_llamada, id_chat, tipo, contenido, frecuencia, id_empresa, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
                [item.id_llamada || null, item.id_chat || null, item.tipo, item.contenido, item.frecuencia || 1, item.id_empresa, item.usuario_registro || null]
            );
        }
    }

    async getDashboard(id_empresa, tipo, limit = 10) {
        const [rows] = await this.connection.execute(
            `SELECT contenido, SUM(frecuencia) as total
            FROM pregunta_frecuente_analisis
            WHERE id_empresa = ? AND tipo = ? AND estado_registro = 1
            GROUP BY contenido
            ORDER BY total DESC
            LIMIT ?`,
            [id_empresa, tipo, limit]
        );
        return rows;
    }

    async deleteByLlamada(id_llamada) {
        const [result] = await this.connection.execute(
            `UPDATE pregunta_frecuente_analisis SET estado_registro = 0 WHERE id_llamada = ?`,
            [id_llamada]
        );
        return result.affectedRows;
    }

    async deleteByChat(id_chat) {
        const [result] = await this.connection.execute(
            `UPDATE pregunta_frecuente_analisis SET estado_registro = 0 WHERE id_chat = ?`,
            [id_chat]
        );
        return result.affectedRows;
    }
}

module.exports = PreguntaFrecuenteAnalisisModel;
