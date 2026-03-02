const { pool } = require("../config/dbConnection.js");

class LlamadaModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll(id_empresa) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT l.*,
                        tl.nombre as tipificacion_llamada_nombre, tl.color as tipificacion_llamada_color,
                        ca.nombre as campania_nombre,
                        bnd.telefono, bnd.nombre as contacto_nombre, bnd.numero_documento
                FROM llamada l
                LEFT JOIN tipificacion_llamada tl ON tl.id = l.id_tipificacion_llamada
                LEFT JOIN campania ca ON ca.id = l.id_campania
                LEFT JOIN base_numero_detalle bnd ON bnd.id = l.id_base_numero_detalle
                WHERE l.id_empresa = ? AND l.estado_registro = 1
                ORDER BY l.fecha_registro DESC`,
                [id_empresa]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener llamadas: ${error.message}`);
        }
    }

    async getByProviderCallId(provider_call_id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM llamada
                WHERE provider_call_id = ? AND estado_registro = 1`,
                [provider_call_id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener llamada por provider_call_id: ${error.message}`);
        }
    }

    async getByCampania(id_campania) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM llamada
                WHERE id_campania = ? AND estado_registro = 1
                ORDER BY fecha_registro DESC`,
                [id_campania]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener llamadas por campania: ${error.message}`);
        }
    }

    async create({ id_empresa, id_campania, id_base_numero, id_base_numero_detalle, provider_call_id }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO llamada
                (id_empresa, id_campania, id_base_numero, id_base_numero_detalle, provider_call_id, estado_registro)
                VALUES (?, ?, ?, ?, ?, 1)`,
                [
                    id_empresa,
                    id_campania,
                    id_base_numero,
                    id_base_numero_detalle || null,
                    provider_call_id
                ]
            );
            return result.insertId;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Ya existe una llamada con ese provider_call_id');
            }
            throw new Error(`Error al crear llamada: ${error.message}`);
        }
    }

    async actualizarTipificacion(id, id_tipificacion_llamada) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada SET id_tipificacion_llamada = ? WHERE id = ?`,
                [id_tipificacion_llamada, id]
            );

            return true;
        } catch (err) {
            throw new Error(`Error al actualizar tipificacion de llamada: ${err.message}`);
        }
    }
}

module.exports = LlamadaModel;
