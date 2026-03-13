const { pool } = require("../config/dbConnection.js");

class VozModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll() {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM voz WHERE estado_registro = 1 ORDER BY nacionalidad, genero`
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener voces: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM voz WHERE id = ? AND estado_registro = 1',
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener voz por ID: ${error.message}`);
        }
    }

    async getByVoiceCode(voice_code) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM voz WHERE voice_code = ? AND estado_registro = 1',
                [voice_code]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener voz por voice_code: ${error.message}`);
        }
    }

    async getByNacionalidad(nacionalidad) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM voz WHERE nacionalidad = ? AND estado_registro = 1 ORDER BY genero',
                [nacionalidad]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener voces por nacionalidad: ${error.message}`);
        }
    }

    async getByGenero(genero) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM voz WHERE genero = ? AND estado_registro = 1 ORDER BY nacionalidad',
                [genero]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener voces por género: ${error.message}`);
        }
    }

    async create({ nacionalidad, genero, voice_code, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO voz (nacionalidad, genero, voice_code, estado_registro, usuario_registro)
                VALUES (?, ?, ?, 1, ?)`,
                [nacionalidad, genero, voice_code, usuario_registro || null]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear voz: ${error.message}`);
        }
    }

    async update(id, { nacionalidad, genero, voice_code, usuario_actualizacion }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE voz
                SET nacionalidad = ?, genero = ?, voice_code = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW()
                WHERE id = ? AND estado_registro = 1`,
                [nacionalidad, genero, voice_code, usuario_actualizacion || null, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar voz: ${error.message}`);
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE voz SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ?',
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar voz: ${error.message}`);
        }
    }
}

module.exports = VozModel;
