const { pool } = require("../config/dbConnection.js");

class FormatoModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll(id_empresa = null) {
        try {
            let query = `SELECT f.*,
                    (SELECT COUNT(*) FROM formato_campo fc WHERE fc.id_formato = f.id AND fc.estado_registro = 1) as total_campos
                FROM formato f
                WHERE f.estado_registro = 1`;

            const params = [];
            if (id_empresa) {
                query += ` AND f.id_empresa = ?`;
                params.push(id_empresa);
            }

            query += ` ORDER BY f.fecha_registro DESC`;

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener formatos: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM formato WHERE id = ? AND estado_registro = 1',
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener formato por ID: ${error.message}`);
        }
    }

    async getByIdWithCampos(id) {
        try {
            const [formatoRows] = await this.connection.execute(
                'SELECT * FROM formato WHERE id = ? AND estado_registro = 1',
                [id]
            );

            if (formatoRows.length === 0) return null;

            const formato = formatoRows[0];

            const [camposRows] = await this.connection.execute(
                'SELECT * FROM formato_campo WHERE id_formato = ? AND estado_registro = 1 ORDER BY orden ASC',
                [id]
            );

            formato.campos = camposRows;
            return formato;
        } catch (error) {
            throw new Error(`Error al obtener formato con campos: ${error.message}`);
        }
    }

    async create({ id_empresa, nombre, descripcion, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO formato (id_empresa, nombre, descripcion, estado_registro, usuario_registro)
                VALUES (?, ?, ?, 1, ?)`,
                [id_empresa, nombre, descripcion || null, usuario_registro || null]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear formato: ${error.message}`);
        }
    }

    async update(id, { nombre, descripcion, usuario_actualizacion, id_empresa = null }) {
        try {
            let query = `UPDATE formato
                SET nombre = ?, descripcion = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ?`;
            const params = [nombre, descripcion, usuario_actualizacion, id];

            if (id_empresa) {
                query = `UPDATE formato
                SET nombre = ?, descripcion = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ? AND id_empresa = ?`;
                params.push(id_empresa);
            }

            const [result] = await this.connection.execute(query, params);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar formato: ${error.message}`);
        }
    }

    async delete(id, id_empresa = null, usuario_actualizacion = null) {
        try {
            let query = 'UPDATE formato SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?';
            const params = [usuario_actualizacion, id];

            if (id_empresa) {
                query = 'UPDATE formato SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND id_empresa = ?';
                params.push(id_empresa);
            }

            const [result] = await this.connection.execute(query, params);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar formato: ${error.message}`);
        }
    }
}

module.exports = FormatoModel;
