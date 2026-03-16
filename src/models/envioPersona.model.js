const { pool } = require("../config/dbConnection.js");

class EnvioPersonaModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll(id_envio_masivo = null) {
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

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener envíos persona: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT ep.*, p.nombre_completo as persona_nombre, p.celular as persona_celular
                FROM envio_persona ep
                LEFT JOIN persona p ON ep.id_persona = p.id
                WHERE ep.id = ? AND ep.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener envío persona por ID: ${error.message}`);
        }
    }

    async getByEnvioMasivo(id_envio_masivo) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT ep.*, p.nombre_completo as persona_nombre, p.celular as persona_celular
                FROM envio_persona ep
                LEFT JOIN persona p ON ep.id_persona = p.id
                WHERE ep.id_envio_masivo = ? AND ep.estado_registro = 1
                ORDER BY ep.fecha_registro DESC`,
                [id_envio_masivo]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener envíos por envío masivo: ${error.message}`);
        }
    }

    async create({
        id_envio_masivo,
        id_persona,
        estado,
        fecha_envio,
        id_campania_ejecucion,
        usuario_registro
    }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO envio_persona
                (id_envio_masivo, id_persona, estado, fecha_envio, id_campania_ejecucion, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, 1, ?)`,
                [
                    id_envio_masivo,
                    id_persona || null,
                    estado || 'pendiente',
                    fecha_envio || null,
                    id_campania_ejecucion || null,
                    usuario_registro || null
                ]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear envío persona: ${error.message}`);
        }
    }

    async bulkCreate(id_envio_masivo, personas, usuario_registro) {
        const conn = await this.connection.getConnection();
        try {
            await conn.beginTransaction();

            const BATCH_SIZE = 100;
            let totalInsertados = 0;
            const errores = [];

            for (let i = 0; i < personas.length; i += BATCH_SIZE) {
                const batch = personas.slice(i, i + BATCH_SIZE);

                const values = [];
                const params = [];

                for (const persona of batch) {
                    values.push('(?, ?, ?, ?, ?, 1, ?)');
                    params.push(
                        id_envio_masivo,
                        persona.id_persona || null,
                        persona.estado || 'pendiente',
                        persona.fecha_envio || null,
                        persona.id_campania_ejecucion || null,
                        usuario_registro || null
                    );
                }

                const sql = `INSERT INTO envio_persona
                    (id_envio_masivo, id_persona, estado, fecha_envio, id_campania_ejecucion, estado_registro, usuario_registro)
                    VALUES ${values.join(', ')}`;

                try {
                    const [result] = await conn.query(sql, params);
                    totalInsertados += result.affectedRows;
                } catch (err) {
                    errores.push({ batch: Math.floor(i / BATCH_SIZE) + 1, error: err.message });
                }
            }

            await conn.commit();
            return { total: totalInsertados, errores };
        } catch (error) {
            await conn.rollback();
            throw new Error(`Error en carga masiva de envío persona: ${error.message}`);
        } finally {
            conn.release();
        }
    }

    async update(id, {
        estado,
        fecha_envio,
        error_mensaje,
        id_campania_ejecucion,
        usuario_actualizacion
    }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE envio_persona
                SET estado = ?, fecha_envio = ?, error_mensaje = ?,
                    id_campania_ejecucion = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW()
                WHERE id = ? AND estado_registro = 1`,
                [
                    estado || null,
                    fecha_envio || null,
                    error_mensaje || null,
                    id_campania_ejecucion || null,
                    usuario_actualizacion || null,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar envío persona: ${error.message}`);
        }
    }

    async updateEstado(id, estado, error_mensaje = null, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE envio_persona SET estado = ?, error_mensaje = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ? AND estado_registro = 1`,
                [estado, error_mensaje, usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar estado de envío persona: ${error.message}`);
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE envio_persona SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ?`,
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar envío persona: ${error.message}`);
        }
    }
}

module.exports = new EnvioPersonaModel();
