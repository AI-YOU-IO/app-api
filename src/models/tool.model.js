const { pool } = require("../config/dbConnection.js");

class ToolModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll(id_empresa = null) {
        try {
            let query = `
                SELECT t.*
                FROM tool t
                WHERE t.estado_registro = 1
            `;
            const params = [];

            if (id_empresa) {
                query += ` AND t.id_empresa = ?`;
                params.push(id_empresa);
            }

            query += ` ORDER BY t.nombre ASC`;

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener tools: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM tool WHERE id = ? AND estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener tool por ID: ${error.message}`);
        }
    }

    async getByIdWithParametros(id) {
        try {
            const tool = await this.getById(id);
            if (!tool) return null;

            const [parametros] = await this.connection.execute(
                `SELECT * FROM tool_parametro
                 WHERE id_tool = ? AND estado_registro = 1
                 ORDER BY orden`,
                [id]
            );

            tool.parametros = parametros;
            return tool;
        } catch (error) {
            throw new Error(`Error al obtener tool con parámetros: ${error.message}`);
        }
    }

    async create({
        id_empresa,
        nombre,
        descripcion,
        tipo_tool,
        timeout,
        http_url,
        http_method,
        requiere_auth,
        auth_type,
        auth_token_key,
        builtin_params,
        usuario_registro
    }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO tool
                (id_empresa, nombre, descripcion, tipo_tool, timeout, http_url, http_method,
                 requiere_auth, auth_type, auth_token_key, builtin_params, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [
                    id_empresa,
                    nombre,
                    descripcion || null,
                    tipo_tool || 'temporary',
                    timeout || '10s',
                    http_url || null,
                    http_method || 'POST',
                    requiere_auth || 0,
                    auth_type || 'none',
                    auth_token_key || null,
                    builtin_params ? JSON.stringify(builtin_params) : null,
                    usuario_registro || null
                ]
            );
            return result.insertId;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Ya existe un tool con ese nombre para esta empresa');
            }
            throw new Error(`Error al crear tool: ${error.message}`);
        }
    }

    async update(id, {
        nombre,
        descripcion,
        tipo_tool,
        timeout,
        http_url,
        http_method,
        requiere_auth,
        auth_type,
        auth_token_key,
        builtin_params,
        usuario_actualizacion
    }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE tool
                SET nombre = ?, descripcion = ?, tipo_tool = ?, timeout = ?,
                    http_url = ?, http_method = ?, requiere_auth = ?, auth_type = ?,
                    auth_token_key = ?, builtin_params = ?,
                    usuario_actualizacion = ?, fecha_actualizacion = NOW()
                WHERE id = ?`,
                [
                    nombre,
                    descripcion || null,
                    tipo_tool || 'temporary',
                    timeout || '10s',
                    http_url || null,
                    http_method || 'POST',
                    requiere_auth || 0,
                    auth_type || 'none',
                    auth_token_key || null,
                    builtin_params ? JSON.stringify(builtin_params) : null,
                    usuario_actualizacion || null,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Ya existe un tool con ese nombre para esta empresa');
            }
            throw new Error(`Error al actualizar tool: ${error.message}`);
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE tool SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ?`,
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar tool: ${error.message}`);
        }
    }

    // ========================================
    // Métodos para parámetros
    // ========================================

    async getParametros(id_tool) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM tool_parametro WHERE id_tool = ? AND estado_registro = 1 ORDER BY orden`,
                [id_tool]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener parámetros: ${error.message}`);
        }
    }

    async addParametro({
        id_tool,
        nombre,
        tipo_dato,
        descripcion,
        ubicacion,
        requerido,
        es_estatico,
        valor_estatico,
        orden
    }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO tool_parametro
                (id_tool, nombre, tipo_dato, descripcion, ubicacion, requerido, es_estatico, valor_estatico, orden, estado_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    id_tool,
                    nombre,
                    tipo_dato || 'string',
                    descripcion || null,
                    ubicacion || 'body',
                    requerido || 0,
                    es_estatico || 0,
                    valor_estatico || null,
                    orden || 0
                ]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al agregar parámetro: ${error.message}`);
        }
    }

    async updateParametro(id, {
        nombre,
        tipo_dato,
        descripcion,
        ubicacion,
        requerido,
        es_estatico,
        valor_estatico,
        orden
    }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE tool_parametro
                SET nombre = ?, tipo_dato = ?, descripcion = ?, ubicacion = ?,
                    requerido = ?, es_estatico = ?, valor_estatico = ?, orden = ?
                WHERE id = ?`,
                [
                    nombre,
                    tipo_dato || 'string',
                    descripcion || null,
                    ubicacion || 'body',
                    requerido || 0,
                    es_estatico || 0,
                    valor_estatico || null,
                    orden || 0,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar parámetro: ${error.message}`);
        }
    }

    async deleteParametro(id) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE tool_parametro SET estado_registro = 0 WHERE id = ?`,
                [id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar parámetro: ${error.message}`);
        }
    }

    async updateParametros(id_tool, parametros) {
        const conn = await this.connection.getConnection();
        try {
            await conn.beginTransaction();

            // Desactivar parámetros existentes
            await conn.execute(
                `UPDATE tool_parametro SET estado_registro = 0 WHERE id_tool = ?`,
                [id_tool]
            );

            // Insertar nuevos parámetros
            if (parametros && parametros.length > 0) {
                for (let i = 0; i < parametros.length; i++) {
                    const p = parametros[i];
                    await conn.execute(
                        `INSERT INTO tool_parametro
                        (id_tool, nombre, tipo_dato, descripcion, ubicacion, requerido, es_estatico, valor_estatico, orden, estado_registro)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                        [
                            id_tool,
                            p.nombre,
                            p.tipo_dato || 'string',
                            p.descripcion || null,
                            p.ubicacion || 'body',
                            p.requerido || 0,
                            p.es_estatico || 0,
                            p.valor_estatico || null,
                            i + 1
                        ]
                    );
                }
            }

            await conn.commit();
            return true;
        } catch (error) {
            await conn.rollback();
            throw new Error(`Error al actualizar parámetros: ${error.message}`);
        } finally {
            conn.release();
        }
    }
}

module.exports = ToolModel;
