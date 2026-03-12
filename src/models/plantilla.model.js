const { pool } = require("../config/dbConnection.js");

class PlantillaModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll(id_empresa = null) {
        try {
            let query = `
                SELECT p.*, f.nombre as formato_nombre
                FROM plantilla p
                LEFT JOIN formato f ON p.id_formato = f.id
                WHERE p.estado_registro = 1
            `;
            const params = [];

            if (id_empresa) {
                query += ` AND p.id_empresa = ?`;
                params.push(id_empresa);
            }

            query += ` ORDER BY p.fecha_registro DESC`;

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener plantillas: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT p.*, f.nombre as formato_nombre
                FROM plantilla p
                LEFT JOIN formato f ON p.id_formato = f.id
                WHERE p.id = ? AND p.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener plantilla por ID: ${error.message}`);
        }
    }

    async getByFormato(id_formato) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM plantilla WHERE id_formato = ? AND estado_registro = 1 ORDER BY nombre`,
                [id_formato]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener plantillas por formato: ${error.message}`);
        }
    }

    async create({ id_empresa, id_formato, nombre, descripcion, prompt_sistema, prompt_inicio, prompt_flujo, prompt_cierre, prompt_resultado, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO plantilla
                (id_empresa, id_formato, nombre, descripcion, prompt_sistema, prompt_inicio, prompt_flujo, prompt_cierre, prompt_resultado, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [
                    id_empresa,
                    id_formato,
                    nombre,
                    descripcion || null,
                    prompt_sistema,
                    prompt_inicio,
                    prompt_flujo,
                    prompt_cierre || null,
                    prompt_resultado || null,
                    usuario_registro || null
                ]
            );
            return result.insertId;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Ya existe una plantilla con ese nombre');
            }
            throw new Error(`Error al crear plantilla: ${error.message}`);
        }
    }

    async update(id, { id_formato, nombre, descripcion, prompt_sistema, prompt_inicio, prompt_flujo, prompt_cierre, prompt_resultado, usuario_actualizacion, id_empresa = null }) {
        try {
            let query = `UPDATE plantilla
                SET id_formato = ?, nombre = ?, descripcion = ?,
                    prompt_sistema = ?, prompt_inicio = ?, prompt_flujo = ?, prompt_cierre = ?, prompt_resultado = ?,
                    usuario_actualizacion = ?, fecha_actualizacion = NOW()
                WHERE id = ?`;
            const params = [
                id_formato,
                nombre,
                descripcion || null,
                prompt_sistema,
                prompt_inicio,
                prompt_flujo,
                prompt_cierre || null,
                prompt_resultado || null,
                usuario_actualizacion || null,
                id
            ];

            if (id_empresa) {
                query = `UPDATE plantilla
                SET id_formato = ?, nombre = ?, descripcion = ?,
                    prompt_sistema = ?, prompt_inicio = ?, prompt_flujo = ?, prompt_cierre = ?, prompt_resultado = ?,
                    usuario_actualizacion = ?, fecha_actualizacion = NOW()
                WHERE id = ? AND id_empresa = ?`;
                params.push(id_empresa);
            }

            const [result] = await this.connection.execute(query, params);
            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Ya existe una plantilla con ese nombre');
            }
            throw new Error(`Error al actualizar plantilla: ${error.message}`);
        }
    }

    async delete(id, id_empresa = null, usuario_actualizacion = null) {
        try {
            let query = 'UPDATE plantilla SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ?';
            const params = [usuario_actualizacion, id];

            if (id_empresa) {
                query = 'UPDATE plantilla SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ? AND id_empresa = ?';
                params.push(id_empresa);
            }

            const [result] = await this.connection.execute(query, params);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar plantilla: ${error.message}`);
        }
    }
}

module.exports = PlantillaModel;
