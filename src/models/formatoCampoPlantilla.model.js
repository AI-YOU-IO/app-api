const { pool } = require("../config/dbConnection.js");

class FormatoCampoPlantillaModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAllByPlantilla(idPlantilla) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT fcp.id, fcp.id_plantilla, fcp.id_formato_campo, fcp.id_campo_sistema,
                    fcp.orden,
                    COALESCE(fc.nombre_campo, cs.nombre) AS nombre_campo,
                    COALESCE(fc.etiqueta, cs.etiqueta) AS etiqueta,
                    COALESCE(fc.tipo_dato, cs.tipo_dato) AS tipo_dato,
                    COALESCE(fc.requerido, cs.requerido::int) AS requerido,
                    CASE WHEN fcp.id_campo_sistema IS NOT NULL THEN 'sistema' ELSE 'formato' END AS origen
                FROM formato_campo_plantilla fcp
                LEFT JOIN formato_campo fc ON fcp.id_formato_campo = fc.id AND fc.estado_registro = 1
                LEFT JOIN campo_sistema cs ON fcp.id_campo_sistema = cs.id AND cs.estado_registro = 1
                WHERE fcp.id_plantilla = ? AND fcp.estado_registro = 1
                    AND (fc.id IS NOT NULL OR cs.id IS NOT NULL)
                ORDER BY fcp.orden ASC, fcp.id ASC`,
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
                `SELECT fcp.id, fcp.id_plantilla, fcp.id_formato_campo, fcp.id_campo_sistema,
                    COALESCE(fc.nombre_campo, cs.nombre) AS nombre_campo,
                    COALESCE(fc.etiqueta, cs.etiqueta) AS etiqueta,
                    COALESCE(fc.tipo_dato, cs.tipo_dato) AS tipo_dato
                FROM formato_campo_plantilla fcp
                LEFT JOIN formato_campo fc ON fcp.id_formato_campo = fc.id
                LEFT JOIN campo_sistema cs ON fcp.id_campo_sistema = cs.id
                WHERE fcp.id = ? AND fcp.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener campo de plantilla por ID: ${error.message}`);
        }
    }

    async create({ id_plantilla, id_formato_campo, id_campo_sistema, orden, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO formato_campo_plantilla
                (id_plantilla, id_formato_campo, id_campo_sistema, orden, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, 1, ?)`,
                [id_plantilla, id_formato_campo || null, id_campo_sistema || null, orden || 1, usuario_registro || null]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear campo de plantilla: ${error.message}`);
        }
    }

    /**
     * Crea campos en lote. Cada item puede ser:
     * - { id_formato_campo: N } para campos de formato
     * - { id_campo_sistema: N } para campos del sistema
     */
    async bulkCreate(idPlantilla, campoItems, usuarioRegistro = null) {
        try {
            const results = [];
            for (let i = 0; i < campoItems.length; i++) {
                const item = campoItems[i];
                const idFormatoCampo = item.id_formato_campo || null;
                const idCampoSistema = item.id_campo_sistema || null;
                const orden = item.orden || (i + 1);

                const [result] = await this.connection.execute(
                    `INSERT INTO formato_campo_plantilla
                    (id_plantilla, id_formato_campo, id_campo_sistema, orden, estado_registro, usuario_registro)
                    VALUES (?, ?, ?, ?, 1, ?)`,
                    [idPlantilla, idFormatoCampo, idCampoSistema, orden, usuarioRegistro]
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

    /**
     * Sincroniza campos de plantilla. Acepta array de objetos:
     * [{ id_formato_campo: N }, { id_campo_sistema: N }, ...]
     */
    async syncByPlantilla(idPlantilla, campoItems, usuarioRegistro = null) {
        try {
            // Desactivar todos los campos actuales
            await this.deleteByPlantilla(idPlantilla, usuarioRegistro);

            // Crear los nuevos
            if (campoItems && campoItems.length > 0) {
                return await this.bulkCreate(idPlantilla, campoItems, usuarioRegistro);
            }
            return [];
        } catch (error) {
            throw new Error(`Error al sincronizar campos de plantilla: ${error.message}`);
        }
    }
}

module.exports = FormatoCampoPlantillaModel;
