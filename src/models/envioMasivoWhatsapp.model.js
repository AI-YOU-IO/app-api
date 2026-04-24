const { pool } = require("../config/dbConnection.js");

class EnvioMasivoWhatsappModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll(id_empresa = null) {
        try {
            let query = `
                SELECT emw.*, pw.name as plantilla_nombre, e.nombre_comercial as empresa_nombre,
                    COUNT(eb.id)::integer AS cantidad,
                    SUM(CASE WHEN eb.estado = 'entregado' THEN 1 ELSE 0 END)::integer AS cantidad_exitosos,
                    SUM(CASE WHEN eb.estado = 'cancelado' THEN 1 ELSE 0 END)::integer AS cantidad_fallidos
                FROM envio_masivo_whatsapp emw
                LEFT JOIN plantilla_whatsapp pw ON emw.id_plantilla = pw.id
                LEFT JOIN empresa e ON emw.id_empresa = e.id
                LEFT JOIN envio_base eb ON eb.id_envio_masivo = emw.id AND eb.estado_registro = 1
                WHERE emw.estado_registro = 1
            `;
            const params = [];

            if (id_empresa) {
                query += ` AND emw.id_empresa = ?`;
                params.push(id_empresa);
            }

            query += ` GROUP BY emw.id, pw.name, e.nombre_comercial ORDER BY emw.fecha_registro DESC`;

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener envíos masivos: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT emw.*, pw.name as plantilla_nombre, e.nombre_comercial as empresa_nombre
                FROM envio_masivo_whatsapp emw
                LEFT JOIN plantilla_whatsapp pw ON emw.id_plantilla = pw.id
                LEFT JOIN empresa e ON emw.id_empresa = e.id
                WHERE emw.id = ? AND emw.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener envío masivo por ID: ${error.message}`);
        }
    }

    async create({
        id_empresa,
        id_plantilla,
        titulo,
        descripcion,
        cantidad,
        fecha_envio,
        es_programado,
        estado_envio,
        usuario_registro
    }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO envio_masivo_whatsapp
                (id_empresa, id_plantilla, titulo, descripcion, cantidad, fecha_envio, es_programado, estado_envio, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                [
                    id_empresa,
                    id_plantilla,
                    titulo || null,
                    descripcion || null,
                    cantidad || null,
                    fecha_envio || null,
                    es_programado,
                    estado_envio || 'pendiente',
                    usuario_registro || null
                ]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear envío masivo: ${error.message}`);
        }
    }

    async update(id, {
        id_plantilla,
        titulo,
        descripcion,
        cantidad,
        cantidad_exitosos,
        cantidad_fallidos,
        fecha_envio,
        estado_envio,
        usuario_actualizacion
    }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE envio_masivo_whatsapp
                SET id_plantilla = ?, titulo = ?, descripcion = ?, cantidad = ?,
                    cantidad_exitosos = ?, cantidad_fallidos = ?, fecha_envio = ?,
                    estado_envio = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ? AND estado_registro = 1`,
                [
                    id_plantilla,
                    titulo || null,
                    descripcion || null,
                    cantidad || null,
                    cantidad_exitosos || null,
                    cantidad_fallidos || null,
                    fecha_envio || null,
                    estado_envio || null,
                    usuario_actualizacion || null,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar envío masivo: ${error.message}`);
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE envio_masivo_whatsapp SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar envío masivo: ${error.message}`);
        }
    }

    async updateEstado(id, estado_envio, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE envio_masivo_whatsapp SET estado_envio = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND estado_registro = 1`,
                [estado_envio, usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar estado de envío masivo: ${error.message}`);
        }
    }

    async updateContadores(id, cantidad_exitosos, cantidad_fallidos) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE envio_masivo_whatsapp SET cantidad_exitosos = ?, cantidad_fallidos = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND estado_registro = 1`,
                [cantidad_exitosos, cantidad_fallidos, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar contadores: ${error.message}`);
        }
    }
}

module.exports = new EnvioMasivoWhatsappModel();
