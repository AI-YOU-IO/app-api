const { pool } = require("../config/dbConnection.js");

class FormatoCampoPlantillaModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAllByPlantilla(idPlantilla) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT fcp.*, fc.nombre_campo, fc.etiqueta, fc.tipo_dato, fc.requerido, fc.orden
                FROM formato_campo_plantilla fcp
                INNER JOIN formato_campo fc ON fcp.id_formato_campo = fc.id AND fc.estado_registro = 1
                WHERE fcp.id_plantilla = ? AND fcp.estado_registro = 1
                ORDER BY fc.orden ASC`,
                [idPlantilla]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener campos de plantilla: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT fcp.*, fc.nombre_campo, fc.etiqueta, fc.tipo_dato
                FROM formato_campo_plantilla fcp
                INNER JOIN formato_campo fc ON fcp.id_formato_campo = fc.id
                WHERE fcp.id = ? AND fcp.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener campo de plantilla por ID: ${error.message}`);
        }
    }

    async create({ id_plantilla, id_formato_campo, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO formato_campo_plantilla
                (id_plantilla, id_formato_campo, estado_registro, usuario_registro)
                VALUES (?, ?, 1, ?)`,
                [id_plantilla, id_formato_campo, usuario_registro || null]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear campo de plantilla: ${error.message}`);
        }
    }

    async bulkCreate(idPlantilla, campoIds, usuarioRegistro = null) {
        try {
            const results = [];
            for (const idCampo of campoIds) {
                const [result] = await this.connection.execute(
                    `INSERT INTO formato_campo_plantilla
                    (id_plantilla, id_formato_campo, estado_registro, usuario_registro)
                    VALUES (?, ?, 1, ?)`,
                    [idPlantilla, idCampo, usuarioRegistro]
                );
                results.push(result.insertId);
            }
            return results;
        } catch (error) {
            throw new Error(`Error al crear campos de plantilla en lote: ${error.message}`);
        }
    }

    async delete(id, usuarioActualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE formato_campo_plantilla
                SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [usuarioActualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar campo de plantilla: ${error.message}`);
        }
    }

    async deleteByPlantilla(idPlantilla, usuarioActualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE formato_campo_plantilla
                SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id_plantilla = ? AND estado_registro = 1`,
                [usuarioActualizacion, idPlantilla]
            );
            return result.affectedRows;
        } catch (error) {
            throw new Error(`Error al eliminar campos de plantilla: ${error.message}`);
        }
    }

    async syncByPlantilla(idPlantilla, campoIds, usuarioRegistro = null) {
        try {
            // Desactivar todos los campos actuales
            await this.deleteByPlantilla(idPlantilla, usuarioRegistro);

            // Crear los nuevos
            if (campoIds && campoIds.length > 0) {
                return await this.bulkCreate(idPlantilla, campoIds, usuarioRegistro);
            }
            return [];
        } catch (error) {
            throw new Error(`Error al sincronizar campos de plantilla: ${error.message}`);
        }
    }
}

module.exports = FormatoCampoPlantillaModel;
