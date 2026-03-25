const { pool } = require("../config/dbConnection.js");

class EnvioBaseModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll(id_envio_masivo = null) {
        try {
            let query = `
                SELECT eb.*, bn.nombre as base_nombre, bn.descripcion as base_descripcion, bn.total_registros as base_total_registros
                FROM envio_base eb
                LEFT JOIN base_numero bn ON eb.id_base = bn.id
                WHERE eb.estado_registro = 1
            `;
            const params = [];

            if (id_envio_masivo) {
                query += ` AND eb.id_envio_masivo = ?`;
                params.push(id_envio_masivo);
            }

            query += ` ORDER BY eb.fecha_registro DESC`;

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener envíos base: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM envio_base WHERE id = ? AND estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener envío base por ID: ${error.message}`);
        }
    }

    async getByEnvioMasivo(id_envio_masivo) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT eb.*, bn.nombre as base_nombre, bn.descripcion as base_descripcion, bn.total_registros as base_total_registros
                FROM envio_base eb
                LEFT JOIN base_numero bn ON eb.id_base = bn.id
                WHERE eb.id_envio_masivo = ? AND eb.estado_registro = 1
                ORDER BY eb.fecha_registro DESC`,
                [id_envio_masivo]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener envíos por envío masivo: ${error.message}`);
        }
    }

    async create({
        id_base,
        id_envio_masivo,
        estado,
        fecha_envio,
        usuario_registro
    }) {
        try {
            const [, result] = await this.connection.execute(
                `INSERT INTO envio_base
                (id_base, id_envio_masivo, estado, fecha_envio, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, 1, ?)`,
                [
                    id_base || null,
                    id_envio_masivo,
                    estado || 'pendiente',
                    fecha_envio || null,
                    usuario_registro || null
                ]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear envío base: ${error.message}`);
        }
    }

    async bulkCreate(id_envio_masivo, bases, usuario_registro) {
        const client = await this.connection.connect();
        try {
            await client.query('BEGIN');

            const BATCH_SIZE = 100;
            let totalInsertados = 0;
            const errores = [];

            for (let i = 0; i < bases.length; i += BATCH_SIZE) {
                const batch = bases.slice(i, i + BATCH_SIZE);

                const values = [];
                const params = [];
                let paramIndex = 0;

                for (const base of batch) {
                    const placeholders = [];
                    for (let j = 0; j < 6; j++) {
                        placeholders.push(`$${++paramIndex}`);
                    }
                    values.push(`(${placeholders.join(', ')})`);
                    params.push(
                        base.id_base || null,
                        id_envio_masivo,
                        base.estado || 'pendiente',
                        base.fecha_envio || null,
                        1,
                        usuario_registro || null
                    );
                }

                const sql = `INSERT INTO envio_base
                    (id_base, id_envio_masivo, estado, fecha_envio, estado_registro, usuario_registro)
                    VALUES ${values.join(', ')}`;

                try {
                    const result = await client.query(sql, params);
                    totalInsertados += result.rowCount;
                } catch (err) {
                    errores.push({ batch: Math.floor(i / BATCH_SIZE) + 1, error: err.message });
                }
            }

            await client.query('COMMIT');
            return { total: totalInsertados, errores };
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Error en carga masiva de envío base: ${error.message}`);
        } finally {
            client.release();
        }
    }

    async update(id, {
        estado,
        fecha_envio,
        error_mensaje,
        usuario_actualizacion
    }) {
        try {
            const [, result] = await this.connection.execute(
                `UPDATE envio_base
                SET estado = ?, fecha_envio = ?, error_mensaje = ?,
                    usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ? AND estado_registro = 1`,
                [
                    estado || null,
                    fecha_envio || null,
                    error_mensaje || null,
                    usuario_actualizacion || null,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar envío base: ${error.message}`);
        }
    }

    async updateEstado(id, estado, error_mensaje = null, usuario_actualizacion = null) {
        try {
            const [, result] = await this.connection.execute(
                `UPDATE envio_base SET estado = ?, error_mensaje = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND estado_registro = 1`,
                [estado, error_mensaje, usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar estado de envío base: ${error.message}`);
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [, result] = await this.connection.execute(
                `UPDATE envio_base SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar envío base: ${error.message}`);
        }
    }
}

module.exports = new EnvioBaseModel();
