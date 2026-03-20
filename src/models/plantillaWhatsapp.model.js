const { pool } = require("../config/dbConnection.js");

class PlantillaWhatsappModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll(id_empresa = null) {
        try {
            let query = `
                SELECT pw.*, e.nombre_comercial as empresa_nombre
                FROM plantilla_whatsapp pw
                LEFT JOIN empresa e ON pw.id_empresa = e.id
                WHERE pw.estado_registro = 1
            `;
            const params = [];

            if (id_empresa) {
                query += ` AND pw.id_empresa = ?`;
                params.push(id_empresa);
            }

            query += ` ORDER BY pw.fecha_registro DESC`;

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener plantillas whatsapp: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT pw.*, e.nombre_comercial as empresa_nombre
                FROM plantilla_whatsapp pw
                LEFT JOIN empresa e ON pw.id_empresa = e.id
                WHERE pw.id = ? AND pw.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener plantilla whatsapp por ID: ${error.message}`);
        }
    }

    async getByName(name, id_empresa = null) {
        try {
            let query = `SELECT * FROM plantilla_whatsapp WHERE name = ? AND estado_registro = 1`;
            const params = [name];

            if (id_empresa) {
                query += ` AND id_empresa = ?`;
                params.push(id_empresa);
            }

            const [rows] = await this.connection.execute(query, params);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener plantilla whatsapp por nombre: ${error.message}`);
        }
    }

    async create({
        id_empresa,
        name,
        status,
        category,
        language,
        header_type,
        header_text,
        body,
        footer,
        buttons,
        url_imagen,
        meta_template_id,
        usuario_registro
    }) {
        try {
            const [, result] = await this.connection.execute(
                `INSERT INTO plantilla_whatsapp
                (id_empresa, name, status, category, "language", header_type, header_text, body, footer, buttons, url_imagen, meta_template_id, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [
                    id_empresa,
                    name,
                    status || 'PENDING',
                    category || 'MARKETING',
                    language || 'es',
                    header_type || null,
                    header_text || null,
                    body || null,
                    footer || null,
                    buttons ? JSON.stringify(buttons) : null,
                    url_imagen || null,
                    meta_template_id || null,
                    usuario_registro || null
                ]
            );
            return { id: result.insertId };
        } catch (error) {
            throw new Error(`Error al crear plantilla whatsapp: ${error.message}`);
        }
    }

    async update(id, {
        name,
        status,
        category,
        language,
        header_type,
        header_text,
        body,
        footer,
        buttons,
        url_imagen,
        meta_template_id,
        usuario_actualizacion
    }) {
        try {
            const [, result] = await this.connection.execute(
                `UPDATE plantilla_whatsapp
                SET name = ?, status = ?, category = ?, "language" = ?,
                    header_type = ?, header_text = ?, body = ?, footer = ?,
                    buttons = ?, url_imagen = ?, meta_template_id = ?,
                    usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ? AND estado_registro = 1`,
                [
                    name,
                    status || null,
                    category || null,
                    language || null,
                    header_type || null,
                    header_text || null,
                    body || null,
                    footer || null,
                    buttons ? JSON.stringify(buttons) : null,
                    url_imagen || null,
                    meta_template_id || null,
                    usuario_actualizacion || null,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar plantilla whatsapp: ${error.message}`);
        }
    }

    async updateStatus(id, status, usuario_actualizacion = null) {
        try {
            const [, result] = await this.connection.execute(
                `UPDATE plantilla_whatsapp SET status = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND estado_registro = 1`,
                [status, usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar status de plantilla whatsapp: ${error.message}`);
        }
    }

    async updateStats(id, { stats_enviados, stats_entregados, stats_leidos }) {
        try {
            const [, result] = await this.connection.execute(
                `UPDATE plantilla_whatsapp SET stats_enviados = ?, stats_entregados = ?, stats_leidos = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND estado_registro = 1`,
                [stats_enviados || 0, stats_entregados || 0, stats_leidos || 0, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar stats de plantilla whatsapp: ${error.message}`);
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [, result] = await this.connection.execute(
                `UPDATE plantilla_whatsapp SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar plantilla whatsapp: ${error.message}`);
        }
    }
}

module.exports = new PlantillaWhatsappModel();
