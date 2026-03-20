const { pool } = require('../config/dbConnection.js');
const logger = require('../config/logger/loggerClient.js');

class PlantillaWhatsappRepository {
    async findAll(id_empresa = null) {
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

            const [rows] = await pool.execute(query, params);
            return rows;
        } catch (error) {
            logger.error(`[PlantillaWhatsappRepository] Error findAll: ${error.message}`);
            throw error;
        }
    }

    async findById(id) {
        try {
            const [rows] = await pool.execute(
                `SELECT * FROM plantilla_whatsapp WHERE id = ? AND estado_registro = 1`,
                [id]
            );
            return rows[0] || null;
        } catch (error) {
            logger.error(`[PlantillaWhatsappRepository] Error findById: ${error.message}`);
            throw error;
        }
    }

    async findByName(name, id_empresa = null) {
        try {
            let query = `SELECT * FROM plantilla_whatsapp WHERE name = ? AND estado_registro = 1`;
            const params = [name];

            if (id_empresa) {
                query += ` AND id_empresa = ?`;
                params.push(id_empresa);
            }

            const [rows] = await pool.execute(query, params);
            return rows[0] || null;
        } catch (error) {
            logger.error(`[PlantillaWhatsappRepository] Error findByName: ${error.message}`);
            throw error;
        }
    }

    async create(data) {
        try {
            const [, result] = await pool.execute(
                `INSERT INTO plantilla_whatsapp
                (id_empresa, name, status, category, "language", header_type, header_text, body, footer, buttons, url_imagen, meta_template_id, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [
                    data.id_empresa,
                    data.name,
                    data.status || 'PENDING',
                    data.category || 'MARKETING',
                    data.language || 'es',
                    data.header_type || null,
                    data.header_text || null,
                    data.body || null,
                    data.footer || null,
                    data.buttons ? JSON.stringify(data.buttons) : null,
                    data.url_imagen || null,
                    data.meta_template_id || null,
                    data.usuario_registro || null
                ]
            );
            return { id: result.insertId };
        } catch (error) {
            logger.error(`[PlantillaWhatsappRepository] Error create: ${error.message}`);
            throw error;
        }
    }

    async update(id, data) {
        try {
            const [, result] = await pool.execute(
                `UPDATE plantilla_whatsapp
                SET name = ?, status = ?, category = ?, "language" = ?,
                    header_type = ?, header_text = ?, body = ?, footer = ?,
                    buttons = ?, url_imagen = ?, meta_template_id = ?,
                    usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ? AND estado_registro = 1`,
                [
                    data.name,
                    data.status || null,
                    data.category || null,
                    data.language || null,
                    data.header_type || null,
                    data.header_text || null,
                    data.body || null,
                    data.footer || null,
                    data.buttons ? JSON.stringify(data.buttons) : null,
                    data.url_imagen || null,
                    data.meta_template_id || null,
                    data.usuario_actualizacion || null,
                    id
                ]
            );
            return [result.affectedRows > 0];
        } catch (error) {
            logger.error(`[PlantillaWhatsappRepository] Error update: ${error.message}`);
            throw error;
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [, result] = await pool.execute(
                `UPDATE plantilla_whatsapp SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
                [usuario_actualizacion, id]
            );
            return [result.affectedRows > 0];
        } catch (error) {
            logger.error(`[PlantillaWhatsappRepository] Error delete: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new PlantillaWhatsappRepository();
