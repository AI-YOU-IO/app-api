const { pool } = require("../config/dbConnection.js");

class BaseNumeroDetalleModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByBaseNumero(id_base_numero, page = 1, limit = 50) {
        try {
            const pageNum = parseInt(page, 10) || 1;
            const limitNum = parseInt(limit, 10) || 50;
            const offset = (pageNum - 1) * limitNum;

            const [countRows] = await this.connection.execute(
                `SELECT COUNT(*) as total FROM base_numero_detalle WHERE id_base_numero = ? AND estado_registro = 1`,
                [id_base_numero]
            );

            // Use query instead of execute for LIMIT/OFFSET (MySQL2 limitation with prepared statements)
            const [rows] = await this.connection.query(
                `SELECT bnd.*, e.nombre_comercial, e.id as id_empresa
                FROM base_numero_detalle bnd
                INNER JOIN base_numero bn ON bn.id = bnd.id_base_numero
                INNER JOIN empresa e ON e.id = bn.id_empresa
                WHERE bnd.id_base_numero = ? AND bnd.estado_registro = 1
                ORDER BY bnd.id ASC
                LIMIT ? OFFSET ?`,
                [id_base_numero, limitNum, offset]
            );

            return {
                data: rows,
                total: countRows[0].total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(countRows[0].total / limitNum)
            };
        } catch (error) {
            throw new Error(`Error al obtener detalles: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM base_numero_detalle WHERE id = ? AND estado_registro = 1',
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener detalle por ID: ${error.message}`);
        }
    }

    async create({ id_base_numero, telefono, nombre, correo, tipo_documento, numero_documento, id_tipo_persona, json_adicional, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO base_numero_detalle
                (id_base_numero, telefono, nombre, correo, tipo_documento, numero_documento, id_tipo_persona, json_adicional, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [
                    id_base_numero,
                    telefono,
                    nombre || null,
                    correo || null,
                    tipo_documento || null,
                    numero_documento || null,
                    id_tipo_persona || null,
                    json_adicional ? JSON.stringify(json_adicional) : null,
                    usuario_registro || null
                ]
            );
            return result.insertId;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error(`El telefono ${telefono} ya existe en esta base`);
            }
            throw new Error(`Error al crear detalle: ${error.message}`);
        }
    }

    async bulkCreate(id_base_numero, registros, usuario_registro) {
        const conn = await this.connection.getConnection();
        try {
            await conn.beginTransaction();

            const insertados = [];
            const errores = [];

            for (const registro of registros) {
                try {
                    const [result] = await conn.execute(
                        `INSERT INTO base_numero_detalle
                        (id_base_numero, telefono, nombre, correo, tipo_documento, numero_documento, id_tipo_persona, json_adicional, estado_registro, usuario_registro)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                        [
                            id_base_numero,
                            registro.telefono,
                            registro.nombre || null,
                            registro.correo || null,
                            registro.tipo_documento || null,
                            registro.numero_documento || null,
                            registro.id_tipo_persona || null,
                            registro.json_adicional ? JSON.stringify(registro.json_adicional) : null,
                            usuario_registro || null
                        ]
                    );
                    insertados.push({ id: result.insertId, telefono: registro.telefono });
                } catch (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        errores.push({ telefono: registro.telefono, error: 'Telefono duplicado' });
                    } else {
                        errores.push({ telefono: registro.telefono, error: err.message });
                    }
                }
            }

            await conn.commit();
            return { insertados, errores, total: insertados.length };
        } catch (error) {
            await conn.rollback();
            throw new Error(`Error en carga masiva: ${error.message}`);
        } finally {
            conn.release();
        }
    }

    async update(id, { telefono, nombre, correo, tipo_documento, numero_documento, id_tipo_persona, json_adicional, usuario_actualizacion }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE base_numero_detalle
                SET telefono = ?, nombre = ?, correo = ?, tipo_documento = ?, numero_documento = ?,
                    id_tipo_persona = ?, json_adicional = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW()
                WHERE id = ?`,
                [
                    telefono,
                    nombre || null,
                    correo || null,
                    tipo_documento || null,
                    numero_documento || null,
                    id_tipo_persona || null,
                    json_adicional ? JSON.stringify(json_adicional) : null,
                    usuario_actualizacion || null,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('El telefono ya existe en esta base');
            }
            throw new Error(`Error al actualizar detalle: ${error.message}`);
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE base_numero_detalle SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = NOW() WHERE id = ?',
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar detalle: ${error.message}`);
        }
    }

    async deleteByBaseNumero(id_base_numero) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE base_numero_detalle SET estado_registro = 0, fecha_actualizacion = NOW() WHERE id_base_numero = ?',
                [id_base_numero]
            );
            return result.affectedRows;
        } catch (error) {
            throw new Error(`Error al eliminar detalles: ${error.message}`);
        }
    }

    async checkDuplicate(id_base_numero, telefono, excludeId = null) {
        try {
            let query = `SELECT id FROM base_numero_detalle WHERE id_base_numero = ? AND telefono = ? AND estado_registro = 1`;
            const params = [id_base_numero, telefono];

            if (excludeId) {
                query += ` AND id != ?`;
                params.push(excludeId);
            }

            const [rows] = await this.connection.execute(query, params);
            return rows.length > 0;
        } catch (error) {
            throw new Error(`Error al verificar duplicado: ${error.message}`);
        }
    }
}

module.exports = BaseNumeroDetalleModel;
