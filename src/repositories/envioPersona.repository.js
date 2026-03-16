const { pool } = require('../config/dbConnection.js');
const logger = require('../config/logger/loggerClient.js');

class EnvioPersonaRepository {
    async findAll(id_envio_masivo = null) {
        try {
            let query = `
                SELECT ep.*, p.nombre_completo as persona_nombre, p.celular as persona_celular
                FROM envio_persona ep
                LEFT JOIN persona p ON ep.id_persona = p.id
                WHERE ep.estado_registro = 1
            `;
            const params = [];

            if (id_envio_masivo) {
                query += ` AND ep.id_envio_masivo = ?`;
                params.push(id_envio_masivo);
            }

            query += ` ORDER BY ep.fecha_registro DESC`;

            const [rows] = await pool.execute(query, params);
            return rows;
        } catch (error) {
            logger.error(`[EnvioPersonaRepository] Error findAll: ${error.message}`);
            throw error;
        }
    }

    async findById(id) {
        try {
            const [rows] = await pool.execute(
                `SELECT ep.*, p.nombre_completo as persona_nombre, p.celular as persona_celular
                FROM envio_persona ep
                LEFT JOIN persona p ON ep.id_persona = p.id
                WHERE ep.id = ? AND ep.estado_registro = 1`,
                [id]
            );
            return rows[0] || null;
        } catch (error) {
            logger.error(`[EnvioPersonaRepository] Error findById: ${error.message}`);
            throw error;
        }
    }

    async findByEnvioMasivo(id_envio_masivo) {
        try {
            const [rows] = await pool.execute(
                `SELECT ep.*, p.nombre_completo as persona_nombre, p.celular as persona_celular
                FROM envio_persona ep
                LEFT JOIN persona p ON ep.id_persona = p.id
                WHERE ep.id_envio_masivo = ? AND ep.estado_registro = 1
                ORDER BY ep.fecha_registro DESC`,
                [id_envio_masivo]
            );
            return rows;
        } catch (error) {
            logger.error(`[EnvioPersonaRepository] Error findByEnvioMasivo: ${error.message}`);
            throw error;
        }
    }

    async create(data) {
        try {
            const [result] = await pool.execute(
                `INSERT INTO envio_persona
                (id_envio_masivo, id_persona, estado, fecha_envio, id_campania_ejecucion, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, 1, ?)`,
                [
                    data.id_envio_masivo,
                    data.id_persona || null,
                    data.estado || 'pendiente',
                    data.fecha_envio || null,
                    data.id_campania_ejecucion || null,
                    data.usuario_registro || null
                ]
            );
            return result.insertId;
        } catch (error) {
            logger.error(`[EnvioPersonaRepository] Error create: ${error.message}`);
            throw error;
        }
    }

    async update(id, data) {
        try {
            const [result] = await pool.execute(
                `UPDATE envio_persona
                SET estado = ?, fecha_envio = ?, error_mensaje = ?,
                    id_campania_ejecucion = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW()
                WHERE id = ? AND estado_registro = 1`,
                [
                    data.estado || null,
                    data.fecha_envio || null,
                    data.error_mensaje || null,
                    data.id_campania_ejecucion || null,
                    data.usuario_actualizacion || null,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            logger.error(`[EnvioPersonaRepository] Error update: ${error.message}`);
            throw error;
        }
    }

    async softDelete(id, usuario_actualizacion = null) {
        try {
            const [result] = await pool.execute(
                `UPDATE envio_persona SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ?`,
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            logger.error(`[EnvioPersonaRepository] Error softDelete: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new EnvioPersonaRepository();
