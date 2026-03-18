const { pool } = require("../config/dbConnection.js");

class CampaniaEjecucionModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByCampania(id_campania, page = 1, limit = 20) {
        try {
            const pageNum = parseInt(page, 10) || 1;
            const limitNum = parseInt(limit, 10) || 20;
            const offset = (pageNum - 1) * limitNum;

            const [countRows] = await this.connection.execute(
                `SELECT COUNT(*) as total FROM campania_ejecucion WHERE id_campania = ? AND estado_registro = 1`,
                [id_campania]
            );

            const [rows] = await this.connection.query(
                `SELECT ce.*, bn.nombre as base_nombre, c.nombre as campania_nombre
                FROM campania_ejecucion ce
                INNER JOIN base_numero bn ON ce.id_base_numero = bn.id
                INNER JOIN campania c ON ce.id_campania = c.id
                WHERE ce.id_campania = ? AND ce.estado_registro = 1
                ORDER BY ce.fecha_registro DESC
                LIMIT ? OFFSET ?`,
                [id_campania, limitNum, offset]
            );

            return {
                data: rows,
                total: countRows[0].total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(countRows[0].total / limitNum)
            };
        } catch (error) {
            throw new Error(`Error al obtener ejecuciones: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT ce.*, bn.nombre as base_nombre, c.nombre as campania_nombre
                FROM campania_ejecucion ce
                INNER JOIN base_numero bn ON ce.id_base_numero = bn.id
                INNER JOIN campania c ON ce.id_campania = c.id
                WHERE ce.id = ? AND ce.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener ejecucion por ID: ${error.message}`);
        }
    }

    async create({ id_empresa, id_campania, id_base_numero, fecha_programada, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO campania_ejecucion
                (id_empresa, id_campania, id_base_numero, fecha_programada, estado_ejecucion, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, 'pendiente', 1, ?)`,
                [
                    id_empresa,
                    id_campania,
                    id_base_numero,
                    fecha_programada || null,
                    usuario_registro || null
                ]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear ejecucion: ${error.message}`);
        }
    }

    async updateEstado(id, { estado_ejecucion, fecha_inicio, fecha_fin, resultado, mensaje_error, usuario_actualizacion }) {
        try {
            let query = `UPDATE campania_ejecucion SET estado_ejecucion = ?`;
            const params = [estado_ejecucion];

            if (fecha_inicio !== undefined) {
                query += `, fecha_inicio = ?`;
                params.push(fecha_inicio);
            }

            if (fecha_fin !== undefined) {
                query += `, fecha_fin = ?`;
                params.push(fecha_fin);
            }

            if (resultado !== undefined) {
                query += `, resultado = ?`;
                params.push(resultado);
            }

            if (mensaje_error !== undefined) {
                query += `, mensaje_error = ?`;
                params.push(mensaje_error);
            }

            query += `, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
            params.push(usuario_actualizacion || null, id);

            const [result] = await this.connection.execute(query, params);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar estado de ejecucion: ${error.message}`);
        }
    }

    async iniciarEjecucion(id, usuario_actualizacion) {
        return this.updateEstado(id, {
            estado_ejecucion: 'en_proceso',
            fecha_inicio: new Date(),
            usuario_actualizacion
        });
    }

    async finalizarEjecucion(id, { resultado, mensaje_error, usuario_actualizacion }) {
        return this.updateEstado(id, {
            estado_ejecucion: 'ejecutado',
            fecha_fin: new Date(),
            resultado,
            mensaje_error,
            usuario_actualizacion
        });
    }

    async cancelarEjecucion(id, { mensaje_error, usuario_actualizacion }) {
        return this.updateEstado(id, {
            estado_ejecucion: 'cancelado',
            fecha_fin: new Date(),
            mensaje_error,
            usuario_actualizacion
        });
    }

    async getEstadisticas(id_campania) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT
                    estado_ejecucion,
                    COUNT(*) as cantidad
                FROM campania_ejecucion
                WHERE id_campania = ? AND estado_registro = 1
                GROUP BY estado_ejecucion`,
                [id_campania]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener estadisticas: ${error.message}`);
        }
    }

    async delete(id) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE campania_ejecucion SET estado_registro = 0, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
                [id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar ejecucion: ${error.message}`);
        }
    }
}

module.exports = CampaniaEjecucionModel;
