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

    async getByIdWithTools(id) {
        try {
            const plantilla = await this.getById(id);
            if (!plantilla) return null;

            const [tools] = await this.connection.execute(
                `SELECT t.*, pt.orden
                FROM plantilla_tool pt
                INNER JOIN tool t ON t.id = pt.id_tool
                WHERE pt.id_plantilla = ? AND pt.estado_registro = 1 AND t.estado_registro = 1
                ORDER BY pt.orden`,
                [id]
            );

            plantilla.tools = tools;
            return plantilla;
        } catch (error) {
            throw new Error(`Error al obtener plantilla con tools: ${error.message}`);
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

    async create({
        id_empresa,
        id_formato,
        nombre,
        descripcion,
        prompt,
        usuario_registro
    }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO plantilla
                (id_empresa, id_formato, nombre, descripcion, prompt, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, 1, ?)`,
                [
                    id_empresa,
                    id_formato || null,
                    nombre,
                    descripcion || null,
                    prompt || null,
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

    async update(id, {
        id_formato,
        nombre,
        descripcion,
        prompt,
        usuario_actualizacion,
        id_empresa = null
    }) {
        try {
            let query = `UPDATE plantilla
                SET id_formato = ?, nombre = ?, descripcion = ?, prompt = ?,
                    usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ?`;
            const params = [
                id_formato || null,
                nombre,
                descripcion || null,
                prompt || null,
                usuario_actualizacion || null,
                id
            ];

            if (id_empresa) {
                query = `UPDATE plantilla
                SET id_formato = ?, nombre = ?, descripcion = ?, prompt = ?,
                    usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
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
            let query = 'UPDATE plantilla SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?';
            const params = [usuario_actualizacion, id];

            if (id_empresa) {
                query = 'UPDATE plantilla SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND id_empresa = ?';
                params.push(id_empresa);
            }

            const [result] = await this.connection.execute(query, params);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar plantilla: ${error.message}`);
        }
    }

    // ========================================
    // Métodos para gestionar tools asociados
    // ========================================

    async getTools(id_plantilla) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT t.*, pt.orden
                FROM plantilla_tool pt
                INNER JOIN tool t ON t.id = pt.id_tool
                WHERE pt.id_plantilla = ? AND pt.estado_registro = 1 AND t.estado_registro = 1
                ORDER BY pt.orden`,
                [id_plantilla]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener tools de plantilla: ${error.message}`);
        }
    }

    async updateTools(id_plantilla, tools_ids) {
        const conn = await this.connection.getConnection();
        try {
            await conn.beginTransaction();

            // Desactivar tools existentes
            await conn.execute(
                `UPDATE plantilla_tool SET estado_registro = 0 WHERE id_plantilla = ?`,
                [id_plantilla]
            );

            // Insertar nuevos tools
            if (tools_ids && tools_ids.length > 0) {
                for (let i = 0; i < tools_ids.length; i++) {
                    await conn.execute(
                        `INSERT INTO plantilla_tool (id_plantilla, id_tool, orden, estado_registro)
                         VALUES (?, ?, ?, 1)
                         ON CONFLICT (id_plantilla, id_tool) DO UPDATE SET estado_registro = 1, orden = EXCLUDED.orden`,
                        [id_plantilla, tools_ids[i], i + 1]
                    );
                }
            }

            await conn.commit();
            return true;
        } catch (error) {
            await conn.rollback();
            throw new Error(`Error al actualizar tools: ${error.message}`);
        } finally {
            conn.release();
        }
    }

    async addTool(id_plantilla, id_tool, orden = 0) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO plantilla_tool (id_plantilla, id_tool, orden, estado_registro)
                 VALUES (?, ?, ?, 1)
                 ON CONFLICT (id_plantilla, id_tool) DO UPDATE SET estado_registro = 1, orden = EXCLUDED.orden`,
                [id_plantilla, id_tool, orden]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al agregar tool: ${error.message}`);
        }
    }

    async removeTool(id_plantilla, id_tool) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE plantilla_tool SET estado_registro = 0 WHERE id_plantilla = ? AND id_tool = ?`,
                [id_plantilla, id_tool]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al remover tool: ${error.message}`);
        }
    }
}

module.exports = PlantillaModel;
