const { pool } = require("../config/dbConnection.js");

class CampaniaModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll(id_empresa = null) {
        try {
            let query = `
                SELECT c.*,
                    tc.nombre AS tipo_campania_nombre,
                    f.nombre AS formato_nombre,
                    (SELECT COUNT(*) FROM campania_base_numero cbn
                     WHERE cbn.id_campania = c.id AND cbn.estado_registro = 1) as total_bases,
                    (SELECT COUNT(*) FROM campania_ejecucion ce
                     WHERE ce.id_campania = c.id AND ce.estado_registro = 1) as total_ejecuciones
                FROM campania c
                LEFT JOIN tipo_campania tc ON c.id_tipo_campania = tc.id AND tc.estado_registro = 1
                LEFT JOIN formato f ON c.id_formato = f.id
                WHERE c.estado_registro = 1
            `;
            const params = [];

            if (id_empresa) {
                query += ` AND c.id_empresa = ?`;
                params.push(id_empresa);
            }

            query += ` ORDER BY c.fecha_registro DESC`;

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener campanias: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT c.*, tc.nombre AS tipo_campania_nombre, f.nombre AS formato_nombre,
                    (SELECT COUNT(*) FROM campania_base_numero cbn
                     WHERE cbn.id_campania = c.id AND cbn.estado_registro = 1) as total_bases
                FROM campania c
                LEFT JOIN tipo_campania tc ON c.id_tipo_campania = tc.id AND tc.estado_registro = 1
                LEFT JOIN formato f ON c.id_formato = f.id
                WHERE c.id = ? AND c.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener campania por ID: ${error.message}`);
        }
    }

    async getByIdWithBases(id) {
        try {
            // Obtener campania
            const campania = await this.getById(id);
            if (!campania) return null;

            // Obtener bases asociadas
            const [bases] = await this.connection.execute(
                `SELECT cbn.*, bn.nombre as base_nombre, bn.id_formato,
                    (SELECT COUNT(*) FROM base_numero_detalle bnd
                     WHERE bnd.id_base_numero = bn.id AND bnd.estado_registro = 1) as total_numeros
                FROM campania_base_numero cbn
                INNER JOIN base_numero bn ON cbn.id_base_numero = bn.id
                WHERE cbn.id_campania = ? AND cbn.estado_registro = 1
                ORDER BY cbn.fecha_registro DESC`,
                [id]
            );

            campania.bases = bases;
            return campania;
        } catch (error) {
            throw new Error(`Error al obtener campania con bases: ${error.message}`);
        }
    }

    async create({ id_empresa, nombre, descripcion, id_tipo_campania, id_formato, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO campania
                (id_empresa, nombre, descripcion, id_tipo_campania, id_formato, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, 1, ?)`,
                [
                    id_empresa,
                    nombre,
                    descripcion || null,
                    id_tipo_campania,
                    id_formato,
                    usuario_registro || null
                ]
            );
            return result.insertId;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Ya existe una campania con ese nombre');
            }
            throw new Error(`Error al crear campania: ${error.message}`);
        }
    }

    async update(id, { nombre, descripcion, id_tipo_campania, id_formato, usuario_actualizacion }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE campania
                SET nombre = ?, descripcion = ?, id_tipo_campania = ?, id_formato = ?,
                    usuario_actualizacion = ?, fecha_actualizacion = NOW()
                WHERE id = ?`,
                [
                    nombre,
                    descripcion || null,
                    id_tipo_campania,
                    id_formato,
                    usuario_actualizacion || null,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Ya existe una campania con ese nombre');
            }
            throw new Error(`Error al actualizar campania: ${error.message}`);
        }
    }

    async delete(id) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE campania SET estado_registro = 0, fecha_actualizacion = NOW() WHERE id = ?',
                [id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar campania: ${error.message}`);
        }
    }
}

module.exports = CampaniaModel;
