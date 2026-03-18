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
                `SELECT COUNT(*)::integer as total FROM base_numero_detalle WHERE id_base_numero = ? AND estado_registro = 1`,
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
            if (error.code === '23505') {
                throw new Error(`El telefono ${telefono} ya existe en esta base`);
            }
            throw new Error(`Error al crear detalle: ${error.message}`);
        }
    }

    async bulkCreate(id_base_numero, registros, usuario_registro) {
        const client = await this.connection.connect();
        try {
            await client.query('BEGIN');

            const errores = [];
            let totalInsertados = 0;

            // Insertar en bloques de 100 registros usando INSERT múltiple
            const BATCH_SIZE = 100;

            for (let i = 0; i < registros.length; i += BATCH_SIZE) {
                const batch = registros.slice(i, i + BATCH_SIZE);

                // Construir INSERT múltiple con placeholders PostgreSQL
                const values = [];
                const params = [];
                let paramIndex = 0;

                for (const registro of batch) {
                    const placeholders = [];
                    for (let j = 0; j < 9; j++) {
                        placeholders.push(`$${++paramIndex}`);
                    }
                    values.push(`(${placeholders.join(', ')})`);
                    params.push(
                        id_base_numero,
                        registro.telefono,
                        registro.nombre || null,
                        registro.correo || null,
                        registro.tipo_documento || null,
                        registro.numero_documento || null,
                        registro.id_tipo_persona || null,
                        registro.json_adicional ? JSON.stringify(registro.json_adicional) : null,
                        usuario_registro || null
                    );
                }

                const sql = `INSERT INTO base_numero_detalle
                    (id_base_numero, telefono, nombre, correo, tipo_documento, numero_documento, id_tipo_persona, json_adicional, usuario_registro)
                    VALUES ${values.join(', ')}
                    ON CONFLICT (id_base_numero, telefono) DO NOTHING`;

                try {
                    const result = await client.query(sql, params);
                    totalInsertados += result.rowCount;

                    // Calcular duplicados en este batch
                    const duplicadosEnBatch = batch.length - result.rowCount;
                    if (duplicadosEnBatch > 0) {
                        // No registramos cada duplicado individualmente para mejor rendimiento
                        // Solo contamos los que no se insertaron
                    }
                } catch (err) {
                    // Si falla el batch completo, registrar error
                    errores.push({ batch: Math.floor(i / BATCH_SIZE) + 1, error: err.message });
                }
            }

            await client.query('COMMIT');

            // Calcular duplicados totales
            const totalDuplicados = registros.length - totalInsertados - errores.length;

            return {
                insertados: [],
                errores: totalDuplicados > 0 ? [{ telefono: `${totalDuplicados} registros`, error: 'Telefonos duplicados (omitidos)' }] : errores,
                total: totalInsertados
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Error en carga masiva: ${error.message}`);
        } finally {
            client.release();
        }
    }

    async update(id, { telefono, nombre, correo, tipo_documento, numero_documento, id_tipo_persona, json_adicional, usuario_actualizacion }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE base_numero_detalle
                SET telefono = ?, nombre = ?, correo = ?, tipo_documento = ?, numero_documento = ?,
                    id_tipo_persona = ?, json_adicional = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
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
            if (error.code === '23505') {
                throw new Error('El telefono ya existe en esta base');
            }
            throw new Error(`Error al actualizar detalle: ${error.message}`);
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE base_numero_detalle SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
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
                'UPDATE base_numero_detalle SET estado_registro = 0, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_base_numero = ?',
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

    /**
     * Obtiene TODOS los números pendientes de llamar para una campaña (sin paginación).
     * Obtiene las bases desde campania_base_numero y excluye teléfonos ya llamados.
     * Útil para procesar llamadas en batch.
     * @param {number} id_campania - ID de la campaña
     * @returns {Array} Array de números pendientes con _idBase incluido
     */
    async getAllUniversoPendientePorCampania(id_campania) {
        try {
            console.log(`[getAllUniversoPendientePorCampania] id_campania: ${id_campania}`);

            const [rows] = await this.connection.query(
                `SELECT bnd.*, bn.id as _idBase, e.nombre_comercial, e.id as id_empresa
                FROM base_numero_detalle bnd
                INNER JOIN base_numero bn ON bn.id = bnd.id_base_numero
                INNER JOIN campania_base_numero cbn ON cbn.id_base_numero = bn.id
                INNER JOIN empresa e ON e.id = bn.id_empresa
                WHERE cbn.id_campania = ?
                AND cbn.estado_registro = 1
                AND cbn.activo = 1
                AND bnd.estado_registro = 1
                AND NOT EXISTS (
                    SELECT 1 FROM llamada l
                    INNER JOIN base_numero_detalle bnd2 ON l.id_base_numero_detalle = bnd2.id
                    WHERE bnd2.telefono = bnd.telefono
                    AND l.id_campania = ?
                    AND l.estado_registro = 1
                    AND l.fecha_fin IS NOT NULL
                )
                ORDER BY bnd.id ASC`,
                [id_campania, id_campania]
            );

            console.log(`[getAllUniversoPendientePorCampania] rows encontradas: ${rows?.length || 0}`);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener universo completo: ${error.message}`);
        }
    }

    /**
     * Sincroniza los registros de base_numero_detalle hacia la tabla persona
     * Solo inserta personas nuevas (únicas por celular + id_empresa)
     * @param {number} id_base_numero - ID de la base de números
     * @param {number} id_empresa - ID de la empresa
     * @param {number} usuario_registro - ID del usuario que registra
     * @returns {Object} { insertados: number, existentes: number }
     */
    async syncToPersona(id_base_numero, id_empresa, usuario_registro = null) {
        try {
            console.log(`[syncToPersona] Iniciando sync - id_base_numero: ${id_base_numero}, id_empresa: ${id_empresa}, usuario: ${usuario_registro}`);

            // Verificar cuántos registros hay en base_numero_detalle
            const [countRows] = await this.connection.query(
                'SELECT COUNT(*)::integer as total FROM base_numero_detalle WHERE id_base_numero = ? AND estado_registro = 1',
                [id_base_numero]
            );
            console.log(`[syncToPersona] Registros en base_numero_detalle: ${countRows[0].total}`);

            // 1. Insertar personas nuevas (únicas por celular + id_empresa)
            const sqlInsert = `
                INSERT INTO persona (celular, id_empresa, id_estado, id_tipo_persona, nombre_completo, dni, usuario_registro)
                SELECT
                    bnd.telefono,
                    ?,
                    1,
                    COALESCE(bnd.id_tipo_persona, 1),
                    bnd.nombre,
                    bnd.numero_documento,
                    ?
                FROM base_numero_detalle bnd
                WHERE bnd.id_base_numero = ?
                AND bnd.estado_registro = 1
                AND NOT EXISTS (
                    SELECT 1 FROM persona p
                    WHERE p.celular = bnd.telefono
                    AND p.id_empresa = ?
                    AND p.estado_registro = 1
                )
                ON CONFLICT (celular, id_empresa) DO NOTHING
            `;

            const [insertResult] = await this.connection.query(sqlInsert, [
                id_empresa,
                usuario_registro,
                id_base_numero,
                id_empresa
            ]);

            console.log(`[syncToPersona] INSERT result - affectedRows: ${insertResult.affectedRows}`);

            // 2. Actualizar personas existentes que no tengan nombre o dni
            const sqlUpdate = `
                UPDATE persona
                SET
                    nombre_completo = CASE
                        WHEN (persona.nombre_completo IS NULL OR persona.nombre_completo = '') AND bnd.nombre IS NOT NULL AND bnd.nombre != ''
                        THEN bnd.nombre
                        ELSE persona.nombre_completo
                    END,
                    dni = CASE
                        WHEN (persona.dni IS NULL OR persona.dni = '') AND bnd.numero_documento IS NOT NULL AND bnd.numero_documento != ''
                        THEN bnd.numero_documento
                        ELSE persona.dni
                    END,
                    usuario_actualizacion = ?,
                    fecha_actualizacion = CURRENT_TIMESTAMP
                FROM base_numero_detalle bnd
                WHERE bnd.telefono = persona.celular
                AND bnd.id_base_numero = ?
                AND bnd.estado_registro = 1
                AND persona.id_empresa = ?
                AND persona.estado_registro = 1
                AND (
                    ((persona.nombre_completo IS NULL OR persona.nombre_completo = '') AND bnd.nombre IS NOT NULL AND bnd.nombre != '')
                    OR ((persona.dni IS NULL OR persona.dni = '') AND bnd.numero_documento IS NOT NULL AND bnd.numero_documento != '')
                )
            `;

            const [updateResult] = await this.connection.query(sqlUpdate, [
                usuario_registro,
                id_base_numero,
                id_empresa
            ]);

            console.log(`[syncToPersona] UPDATE result - affectedRows: ${updateResult.affectedRows}`);
            console.log(`[syncToPersona] Finalizando - insertados: ${insertResult.affectedRows}, actualizados: ${updateResult.affectedRows}`);

            return {
                insertados: insertResult.affectedRows,
                actualizados: updateResult.affectedRows
            };
        } catch (error) {
            throw new Error(`Error al sincronizar personas: ${error.message}`);
        }
    }
}

module.exports = BaseNumeroDetalleModel;
