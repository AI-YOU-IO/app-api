const { pool } = require("../config/dbConnection.js");

class AnalisisSentimientoModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByLlamada(id_llamada) {
        const [rows] = await this.connection.execute(
            `SELECT * FROM analisis_sentimiento WHERE id_llamada = ? AND estado_registro = 1`,
            [id_llamada]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    async getByChat(id_chat) {
        const [rows] = await this.connection.execute(
            `SELECT * FROM analisis_sentimiento WHERE id_chat = ? AND estado_registro = 1`,
            [id_chat]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    async create({ id_llamada = null, id_chat = null, sentimiento, score_sentimiento, emocion_principal, score_emocion, id_empresa, usuario_registro = null }) {
        const [result] = await this.connection.execute(
            `INSERT INTO analisis_sentimiento
            (id_llamada, id_chat, sentimiento, score_sentimiento, emocion_principal, score_emocion, id_empresa, estado_registro, usuario_registro)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [id_llamada, id_chat, sentimiento, score_sentimiento, emocion_principal, score_emocion, id_empresa, usuario_registro]
        );
        return result.insertId;
    }

    async getDashboard(id_empresa, fecha_inicio = null, fecha_fin = null) {
        let whereExtra = '';
        const params = [id_empresa];

        if (fecha_inicio && fecha_fin) {
            whereExtra = ' AND fecha_registro BETWEEN ? AND ?';
            params.push(fecha_inicio, fecha_fin);
        }

        const [distribucion] = await this.connection.execute(
            `SELECT sentimiento, COUNT(*) as total
            FROM analisis_sentimiento
            WHERE id_empresa = ? AND estado_registro = 1${whereExtra}
            GROUP BY sentimiento`,
            params
        );

        const [emociones] = await this.connection.execute(
            `SELECT emocion_principal, COUNT(*) as total
            FROM analisis_sentimiento
            WHERE id_empresa = ? AND estado_registro = 1${whereExtra}
            GROUP BY emocion_principal`,
            params
        );

        const [evolucion] = await this.connection.execute(
            `SELECT TO_CHAR(fecha_registro, 'YYYY-MM') as mes, sentimiento, COUNT(*) as total
            FROM analisis_sentimiento
            WHERE id_empresa = ? AND estado_registro = 1${whereExtra}
            GROUP BY mes, sentimiento
            ORDER BY mes`,
            params
        );

        return { distribucion, emociones, evolucion };
    }

    async deleteByLlamada(id_llamada) {
        const [result] = await this.connection.execute(
            `UPDATE analisis_sentimiento SET estado_registro = 0 WHERE id_llamada = ?`,
            [id_llamada]
        );
        return result.affectedRows;
    }

    async deleteByChat(id_chat) {
        const [result] = await this.connection.execute(
            `UPDATE analisis_sentimiento SET estado_registro = 0 WHERE id_chat = ?`,
            [id_chat]
        );
        return result.affectedRows;
    }
}

module.exports = AnalisisSentimientoModel;
