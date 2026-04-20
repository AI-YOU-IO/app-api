const { pool } = require("../config/dbConnection.js");

class TroncalModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll() {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id, nombre, codigo, pais, descripcion, estado_registro, fecha_registro
                 FROM troncal
                 WHERE estado_registro = 1
                 ORDER BY nombre`
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener troncales: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id, nombre, codigo, pais, descripcion, estado_registro, fecha_registro
                 FROM troncal
                 WHERE id = $1`,
                [id]
            );
            return rows[0];
        } catch (error) {
            throw new Error(`Error al obtener troncal: ${error.message}`);
        }
    }

    async getByCodigo(codigo) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id, nombre, codigo, pais, descripcion, estado_registro, fecha_registro
                 FROM troncal
                 WHERE codigo = $1 AND estado_registro = 1`,
                [codigo]
            );
            return rows[0];
        } catch (error) {
            throw new Error(`Error al obtener troncal por código: ${error.message}`);
        }
    }

    async getByPais(pais) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id, nombre, codigo, pais, descripcion, estado_registro, fecha_registro
                 FROM troncal
                 WHERE pais = $1 AND estado_registro = 1`,
                [pais]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener troncales por país: ${error.message}`);
        }
    }

    async create({ nombre, codigo, pais, descripcion = null, usuario_registro = null }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO troncal (nombre, codigo, pais, descripcion, usuario_registro)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [nombre, codigo, pais, descripcion, usuario_registro]
            );
            return result[0]?.id || result.insertId;
        } catch (error) {
            throw new Error(`Error al crear troncal: ${error.message}`);
        }
    }

    async update(id, { nombre, codigo, pais, descripcion, usuario_actualizacion = null }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE troncal
                 SET nombre = $1, codigo = $2, pais = $3, descripcion = $4,
                     usuario_actualizacion = $5, fecha_actualizacion = CURRENT_TIMESTAMP
                 WHERE id = $6`,
                [nombre, codigo, pais, descripcion, usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar troncal: ${error.message}`);
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE troncal
                 SET estado_registro = 0, usuario_actualizacion = $1, fecha_actualizacion = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar troncal: ${error.message}`);
        }
    }
}

module.exports = TroncalModel;
