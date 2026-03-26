const { pool } = require("../config/dbConnection.js");

class CampaniaBaseNumeroModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByCampania(id_campania) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT cbn.*, cbn.activo, bn.nombre as base_nombre, bn.id_formato, f.nombre as formato_nombre,
                    (SELECT COUNT(*)::integer FROM base_numero_detalle bnd
                     WHERE bnd.id_base_numero = bn.id AND bnd.estado_registro = 1) as total_numeros,
                    (SELECT COUNT(*)::integer FROM campania_ejecucion ce
                     WHERE ce.id_base_numero = bn.id AND ce.id_campania = cbn.id_campania AND ce.estado_registro = 1) as total_ejecuciones
                FROM campania_base_numero cbn
                INNER JOIN base_numero bn ON cbn.id_base_numero = bn.id
                LEFT JOIN formato f ON bn.id_formato = f.id
                WHERE cbn.id_campania = ? AND cbn.estado_registro = 1
                ORDER BY cbn.fecha_registro DESC`,
                [id_campania]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener bases de campania: ${error.message}`);
        }
    }

    async add({ id_empresa, id_campania, id_base_numero, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO campania_base_numero
                (id_empresa, id_campania, id_base_numero, activo, estado_registro, usuario_registro)
                VALUES (?, ?, ?, 1, 1, ?)`,
                [
                    id_empresa,
                    id_campania,
                    id_base_numero,
                    usuario_registro || null
                ]
            );
            return result.insertId;
        } catch (error) {
            if (error.code === '23505') {
                throw new Error('Esta base ya esta asignada a la campania');
            }
            throw new Error(`Error al agregar base a campania: ${error.message}`);
        }
    }

    async remove(id, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE campania_base_numero SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar base de campania: ${error.message}`);
        }
    }

    async removeByCampaniaAndBase(id_campania, id_base_numero) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE campania_base_numero SET estado_registro = 0, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_campania = ? AND id_base_numero = ?',
                [id_campania, id_base_numero]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar base de campania: ${error.message}`);
        }
    }

    async removeByFormatoMismatch(id_campania, id_formato) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE campania_base_numero
                SET estado_registro = 0, fecha_actualizacion = CURRENT_TIMESTAMP
                FROM base_numero bn
                WHERE campania_base_numero.id_base_numero = bn.id
                AND campania_base_numero.id_campania = ?
                AND campania_base_numero.estado_registro = 1
                AND bn.id_formato != ?`,
                [id_campania, id_formato]
            );
            return result.affectedRows;
        } catch (error) {
            throw new Error(`Error al eliminar bases por formato: ${error.message}`);
        }
    }

    async exists(id_campania, id_base_numero) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id FROM campania_base_numero
                WHERE id_campania = ? AND id_base_numero = ? AND estado_registro = 1`,
                [id_campania, id_base_numero]
            );
            return rows.length > 0;
        } catch (error) {
            throw new Error(`Error al verificar existencia: ${error.message}`);
        }
    }

    async toggleActivo(id, usuario_actualizacion = null) {
        try {
            console.log(`[toggleActivo] id=${id}, usuario=${usuario_actualizacion}`);
            const [result] = await this.connection.execute(
                `UPDATE campania_base_numero
                SET activo = CASE WHEN activo = 1 THEN 0 ELSE 1 END,
                    usuario_actualizacion = ?,
                    fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ? AND estado_registro = 1`,
                [usuario_actualizacion, id]
            );
            console.log(`[toggleActivo] result:`, result);

            if (result.affectedRows > 0) {
                const [rows] = await this.connection.execute(
                    'SELECT activo FROM campania_base_numero WHERE id = ?',
                    [id]
                );
                console.log(`[toggleActivo] nuevo activo:`, rows[0]?.activo);
                return rows[0]?.activo;
            }
            console.log(`[toggleActivo] No se afectaron filas`);
            return null;
        } catch (error) {
            console.error(`[toggleActivo] Error:`, error);
            throw new Error(`Error al cambiar estado activo: ${error.message}`);
        }
    }
}

module.exports = CampaniaBaseNumeroModel;
