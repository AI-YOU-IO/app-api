const { pool } = require("../config/dbConnection.js");

class BaseNumeroModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll(id_empresa = null) {
        try {
            let query = `SELECT bn.*,
                f.nombre as formato_nombre,
                (SELECT COUNT(*)::integer FROM base_numero_detalle bnd WHERE bnd.id_base_numero = bn.id AND bnd.estado_registro = 1) as total_registros
            FROM base_numero bn
            LEFT JOIN formato f ON bn.id_formato = f.id
            WHERE bn.estado_registro = 1`;

            const params = [];
            if (id_empresa) {
                query += ` AND bn.id_empresa = ?`;
                params.push(id_empresa);
            }

            query += ` ORDER BY bn.fecha_registro DESC`;

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener bases de numeros: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT bn.*, f.nombre as formato_nombre
                FROM base_numero bn
                LEFT JOIN formato f ON bn.id_formato = f.id
                WHERE bn.id = ? AND bn.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener base de numeros por ID: ${error.message}`);
        }
    }

    async create({ id_empresa, id_formato, nombre, descripcion, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO base_numero (id_empresa, id_formato, nombre, descripcion, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, 1, ?)`,
                [id_empresa, id_formato, nombre, descripcion || null, usuario_registro || null]
            );
            return result.insertId;
        } catch (error) {
            if (error.code === '23505') {
                throw new Error('Ya existe una base con ese nombre para esta empresa');
            }
            throw new Error(`Error al crear base de numeros: ${error.message}`);
        }
    }

    async update(id, { nombre, descripcion, id_formato, usuario_actualizacion, id_empresa = null }) {
        try {
            let query = `UPDATE base_numero
                SET nombre = ?, descripcion = ?, id_formato = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ?`;
            const params = [nombre, descripcion || null, id_formato, usuario_actualizacion || null, id];

            if (id_empresa) {
                query = `UPDATE base_numero
                SET nombre = ?, descripcion = ?, id_formato = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ? AND id_empresa = ?`;
                params.push(id_empresa);
            }

            const [result] = await this.connection.execute(query, params);
            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === '23505') {
                throw new Error('Ya existe una base con ese nombre para esta empresa');
            }
            throw new Error(`Error al actualizar base de numeros: ${error.message}`);
        }
    }

    async delete(id, id_empresa = null, usuario_actualizacion = null) {
        try {
            let query = 'UPDATE base_numero SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?';
            const params = [usuario_actualizacion, id];

            if (id_empresa) {
                query = 'UPDATE base_numero SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND id_empresa = ?';
                params.push(id_empresa);
            }

            const [result] = await this.connection.execute(query, params);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar base de numeros: ${error.message}`);
        }
    }

    async getStats(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT
                    COUNT(*)::integer as total,
                    SUM(CASE WHEN estado_registro = 1 THEN 1 ELSE 0 END)::integer as activos
                FROM base_numero_detalle
                WHERE id_base_numero = ?`,
                [id]
            );
            return rows[0];
        } catch (error) {
            throw new Error(`Error al obtener estadisticas: ${error.message}`);
        }
    }
}

module.exports = BaseNumeroModel;
