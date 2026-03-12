const { pool } = require("../config/dbConnection.js");

class FormatoCampoModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAllByFormato(idFormato) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM formato_campo WHERE id_formato = ? AND estado_registro = 1 ORDER BY orden ASC',
                [idFormato]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener campos del formato: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM formato_campo WHERE id = ? AND estado_registro = 1',
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener campo por ID: ${error.message}`);
        }
    }

    async create({
        id_formato,
        nombre_campo,
        etiqueta,
        tipo_dato,
        longitud,
        requerido,
        unico,
        orden,
        placeholder,
        reglas_json,
        usuario_registro
    }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO formato_campo
                (id_formato, nombre_campo, etiqueta, tipo_dato, longitud, requerido, unico, orden, placeholder, reglas_json, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [
                    id_formato,
                    nombre_campo,
                    etiqueta,
                    tipo_dato,
                    longitud || null,
                    requerido ? 1 : 0,
                    unico ? 1 : 0,
                    orden || 1,
                    placeholder,
                    reglas_json ? JSON.stringify(reglas_json) : null,
                    usuario_registro
                ]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear campo: ${error.message}`);
        }
    }

    async update(id, {
        nombre_campo,
        etiqueta,
        tipo_dato,
        longitud,
        requerido,
        unico,
        orden,
        placeholder,
        reglas_json,
        usuario_actualizacion
    }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE formato_campo
                SET nombre_campo = ?, etiqueta = ?, tipo_dato = ?, longitud = ?, requerido = ?, unico = ?, orden = ?, placeholder = ?, reglas_json = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW()
                WHERE id = ?`,
                [
                    nombre_campo,
                    etiqueta,
                    tipo_dato,
                    longitud || null,
                    requerido ? 1 : 0,
                    unico ? 1 : 0,
                    orden || 1,
                    placeholder,
                    reglas_json ? JSON.stringify(reglas_json) : null,
                    usuario_actualizacion,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar campo: ${error.message}`);
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE formato_campo SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ?',
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar campo: ${error.message}`);
        }
    }

    async updateOrden(campos) {
        try {
            for (const campo of campos) {
                await this.connection.execute(
                    'UPDATE formato_campo SET orden = ? WHERE id = ?',
                    [campo.orden, campo.id]
                );
            }
            return true;
        } catch (error) {
            throw new Error(`Error al actualizar orden de campos: ${error.message}`);
        }
    }
}

module.exports = FormatoCampoModel;
