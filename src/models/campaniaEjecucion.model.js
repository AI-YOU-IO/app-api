const { pool } = require("../config/dbConnection.js");

class CampaniaEjecucionModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByCampania(id_campania, page = 1, limit = 20) {
        try {
            const pageNum = parseInt(page, 10) || 1;
            const limitNum = parseInt(limit, 10) || 20;
            const offset = (pageNum - 1) * limitNum;

            const [countRows] = await this.connection.execute(
                `SELECT COUNT(*)::integer as total FROM campania_ejecucion WHERE id_campania = ? AND estado_registro = 1`,
                [id_campania]
            );

            const [rows] = await this.connection.execute(
                `SELECT ce.*, bn.nombre as base_nombre, c.nombre as campania_nombre,
                    COALESCE(stats.total_llamadas, 0)::integer as total_llamadas,
                    COALESCE(stats.llamadas_exitosas, 0)::integer as llamadas_exitosas,
                    COALESCE(stats.llamadas_fallidas, 0)::integer as llamadas_fallidas,
                    COALESCE(stats.llamadas_pendientes, 0)::integer as llamadas_pendientes,
                    CASE
                        WHEN COALESCE(stats.total_llamadas, 0) = 0 THEN 'pendiente'
                        WHEN COALESCE(stats.llamadas_pendientes, 0) > 0 THEN 'en_proceso'
                        ELSE 'ejecutado'
                    END as estado_ejecucion
                FROM campania_ejecucion ce
                INNER JOIN base_numero bn ON ce.id_base_numero = bn.id
                INNER JOIN campania c ON ce.id_campania = c.id
                LEFT JOIN (
                    SELECT id_campania_ejecucion,
                        COUNT(*) as total_llamadas,
                        COUNT(CASE WHEN id_estado_llamada = 4 THEN 1 END) as llamadas_exitosas,
                        COUNT(CASE WHEN id_estado_llamada = 3 THEN 1 END) as llamadas_fallidas,
                        COUNT(CASE WHEN id_estado_llamada IN (1, 2) THEN 1 END) as llamadas_pendientes
                    FROM llamada
                    WHERE estado_registro = 1
                    GROUP BY id_campania_ejecucion
                ) stats ON stats.id_campania_ejecucion = ce.id
                WHERE ce.id_campania = ? AND ce.estado_registro = 1
                ORDER BY ce.fecha_registro DESC
                LIMIT ? OFFSET ?`,
                [id_campania, limitNum, offset]
            );

            return {
                data: rows,
                total: countRows[0].total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(countRows[0].total / limitNum)
            };
        } catch (error) {
            throw new Error(`Error al obtener ejecuciones: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT ce.*, bn.nombre as base_nombre, c.nombre as campania_nombre,
                    COALESCE(stats.total_llamadas, 0)::integer as total_llamadas,
                    COALESCE(stats.llamadas_exitosas, 0)::integer as llamadas_exitosas,
                    COALESCE(stats.llamadas_fallidas, 0)::integer as llamadas_fallidas,
                    COALESCE(stats.llamadas_pendientes, 0)::integer as llamadas_pendientes,
                    CASE
                        WHEN COALESCE(stats.total_llamadas, 0) = 0 THEN 'pendiente'
                        WHEN COALESCE(stats.llamadas_pendientes, 0) > 0 THEN 'en_proceso'
                        ELSE 'ejecutado'
                    END as estado_ejecucion
                FROM campania_ejecucion ce
                INNER JOIN base_numero bn ON ce.id_base_numero = bn.id
                INNER JOIN campania c ON ce.id_campania = c.id
                LEFT JOIN (
                    SELECT id_campania_ejecucion,
                        COUNT(*) as total_llamadas,
                        COUNT(CASE WHEN id_estado_llamada = 4 THEN 1 END) as llamadas_exitosas,
                        COUNT(CASE WHEN id_estado_llamada = 3 THEN 1 END) as llamadas_fallidas,
                        COUNT(CASE WHEN id_estado_llamada IN (1, 2) THEN 1 END) as llamadas_pendientes
                    FROM llamada
                    WHERE estado_registro = 1
                    GROUP BY id_campania_ejecucion
                ) stats ON stats.id_campania_ejecucion = ce.id
                WHERE ce.id = ? AND ce.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener ejecucion por ID: ${error.message}`);
        }
    }

    async create({ id_empresa, id_campania, id_base_numero, fecha_programada, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO campania_ejecucion
                (id_empresa, id_campania, id_base_numero, fecha_programada, estado_registro, usuario_registro, fecha_registro)
                VALUES (?, ?, ?, ?, 1, ?, NOW())`,
                [
                    id_empresa,
                    id_campania,
                    id_base_numero,
                    fecha_programada || null,
                    usuario_registro || null
                ]
            );
            console.log(`[campaniaEjecucion.create] result.insertId:`, result.insertId);
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear ejecucion: ${error.message}`);
        }
    }

    async delete(id) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE campania_ejecucion SET estado_registro = 0, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
                [id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar ejecucion: ${error.message}`);
        }
    }
}

module.exports = CampaniaEjecucionModel;
