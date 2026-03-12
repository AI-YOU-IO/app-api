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
                        bnd.telefono, bnd.nombre as contacto_nombre, bnd.numero_documento,
                        ce.id as id_campania_ejecucion_rel
                FROM llamada l
                LEFT JOIN tipificacion_llamada tl ON tl.id = l.id_tipificacion_llamada
                LEFT JOIN campania ca ON ca.id = l.id_campania
                LEFT JOIN base_numero_detalle bnd ON bnd.id = l.id_base_numero_detalle
                LEFT JOIN campania_ejecucion ce ON ce.id = l.id_campania_ejecucion
                WHERE l.id_empresa = ? AND l.estado_registro = 1
                ORDER BY l.fecha_registro DESC`,
                [id_empresa]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener llamadas: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT l.*,
                        tl.nombre as tipificacion_llamada_nombre, tl.color as tipificacion_llamada_color,
                        ca.nombre as campania_nombre,
                        bnd.telefono, bnd.nombre as contacto_nombre, bnd.numero_documento,
                        ce.id as id_campania_ejecucion_rel
                FROM llamada l
                LEFT JOIN tipificacion_llamada tl ON tl.id = l.id_tipificacion_llamada
                LEFT JOIN campania ca ON ca.id = l.id_campania
                LEFT JOIN base_numero_detalle bnd ON bnd.id = l.id_base_numero_detalle
                LEFT JOIN campania_ejecucion ce ON ce.id = l.id_campania_ejecucion
                WHERE l.id = ? AND l.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener llamada por ID: ${error.message}`);
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

    async getByCampaniaEjecucion(id_campania_ejecucion) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT l.*,
                        tl.nombre as tipificacion_llamada_nombre, tl.color as tipificacion_llamada_color,
                        ca.nombre as campania_nombre,
                        bnd.telefono, bnd.nombre as contacto_nombre, bnd.numero_documento,
                        ce.id as id_campania_ejecucion_rel
                FROM llamada l
                LEFT JOIN tipificacion_llamada tl ON tl.id = l.id_tipificacion_llamada
                LEFT JOIN campania ca ON ca.id = l.id_campania
                LEFT JOIN base_numero_detalle bnd ON bnd.id = l.id_base_numero_detalle
                LEFT JOIN campania_ejecucion ce ON ce.id = l.id_campania_ejecucion
                WHERE l.id_campania_ejecucion = ? AND l.estado_registro = 1
                ORDER BY l.fecha_registro DESC`,
                [id_campania_ejecucion]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener llamadas por ejecucion: ${error.message}`);
        }
    }

    async getNextCodigoLlamada(id_empresa) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT COALESCE(MAX(codigo_llamada), 0) + 1 as next_codigo
                FROM llamada
                WHERE id_empresa = ?
                FOR UPDATE`,
                [id_empresa]
            );
            return rows[0].next_codigo;
        } catch (error) {
            throw new Error(`Error al obtener siguiente codigo de llamada: ${error.message}`);
        }
    }

    async create({ id_empresa, id_campania, id_base_numero, id_base_numero_detalle, provider_call_id, usuario_registro = null }) {
        try {
            const codigo_llamada = await this.getNextCodigoLlamada(id_empresa);

            const [result] = await this.connection.execute(
                `INSERT INTO llamada
                (id_empresa, id_campania, id_base_numero, id_base_numero_detalle, provider_call_id, codigo_llamada, id_estado_llamada, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
                [
                    id_empresa,
                    id_campania,
                    id_base_numero,
                    id_base_numero_detalle || null,
                    provider_call_id,
                    codigo_llamada,
                    usuario_registro
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

    async actualizarTipificacion(provider_call_id, id_tipificacion_llamada) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada SET id_tipificacion_llamada = ? WHERE provider_call_id = ?`,
                [id_tipificacion_llamada, provider_call_id]
            );

            return true;
        } catch (err) {
            throw new Error(`Error al actualizar tipificacion de llamada: ${err.message}`);
        }
    }
}

module.exports = LlamadaModel;
