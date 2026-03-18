const { pool } = require('../config/dbConnection.js');
const logger = require('../config/logger/loggerClient.js');

class EnvioMasivoWhatsappRepository {
    async findAll(id_empresa = null) {
        try {
            let query = `
                SELECT emw.*, pw.nombre as plantilla_nombre
                FROM envio_masivo_whatsapp emw
                LEFT JOIN plantilla_whatsapp pw ON emw.id_plantilla = pw.id
                WHERE emw.estado_registro = 1
            `;
            const params = [];

            if (id_empresa) {
                query += ` AND emw.id_empresa = ?`;
                params.push(id_empresa);
            }

            query += ` ORDER BY emw.fecha_registro DESC`;

            const [rows] = await pool.execute(query, params);
            return rows;
        } catch (error) {
            logger.error(`[EnvioMasivoWhatsappRepository] Error findAll: ${error.message}`);
            throw error;
        }
    }

    async findById(id) {
        try {
            const [rows] = await pool.execute(
                'SELECT * FROM envio_masivo_whatsapp WHERE id = ? AND estado_registro = 1',
                [id]
            );
            return rows[0] || null;
        } catch (error) {
            logger.error(`[EnvioMasivoWhatsappRepository] Error findById: ${error.message}`);
            throw error;
        }
    }

    async create(data) {
        try {
            const [result] = await pool.execute(
                `INSERT INTO envio_masivo_whatsapp
                (id_empresa, id_plantilla, titulo, descripcion, cantidad, fecha_envio, estado_envio, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [
                    data.id_empresa,
                    data.id_plantilla,
                    data.titulo || null,
                    data.descripcion || null,
                    data.cantidad || null,
                    data.fecha_envio || null,
                    data.estado_envio || 'pendiente',
                    data.usuario_registro || null
                ]
            );
            return result.insertId;
        } catch (error) {
            logger.error(`[EnvioMasivoWhatsappRepository] Error create: ${error.message}`);
            throw error;
        }
    }

    async update(id, data) {
        try {
            const [result] = await pool.execute(
                `UPDATE envio_masivo_whatsapp
                SET id_plantilla = ?, titulo = ?, descripcion = ?, cantidad = ?,
                    cantidad_exitosos = ?, cantidad_fallidos = ?, fecha_envio = ?,
                    estado_envio = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ? AND estado_registro = 1`,
                [
                    data.id_plantilla,
                    data.titulo || null,
                    data.descripcion || null,
                    data.cantidad || null,
                    data.cantidad_exitosos || null,
                    data.cantidad_fallidos || null,
                    data.fecha_envio || null,
                    data.estado_envio || null,
                    data.usuario_actualizacion || null,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            logger.error(`[EnvioMasivoWhatsappRepository] Error update: ${error.message}`);
            throw error;
        }
    }

    async softDelete(id, usuario_actualizacion = null) {
        try {
            const [result] = await pool.execute(
                `UPDATE envio_masivo_whatsapp SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            logger.error(`[EnvioMasivoWhatsappRepository] Error softDelete: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new EnvioMasivoWhatsappRepository();
