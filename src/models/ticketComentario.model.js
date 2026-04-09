const { pool } = require("../config/dbConnection.js");
const logger = require('../config/logger/loggerClient.js');

class TicketComentarioModel {

    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async create(data) {
        try {
            const { id_ticket_soporte, contenido, es_interno = false, es_respuesta_agente = false, id_usuario,
                usuario_registro, usuario_externo_id = null, usuario_externo_nombre = null } = data;

            const [result] = await this.connection.execute(
                `INSERT INTO ticket_comentario
                (id_ticket_soporte, contenido, es_interno, es_respuesta_agente, id_usuario, usuario_registro,
                 usuario_externo_id, usuario_externo_nombre)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id_ticket_soporte, contenido, es_interno, es_respuesta_agente, id_usuario, usuario_registro || id_usuario,
                 usuario_externo_id, usuario_externo_nombre]
            );

            return result.insertId;
        } catch (error) {
            logger.error(`[ticketComentario.model.js] Error al crear comentario: ${error.message}`);
            throw new Error(`Error al crear comentario: ${error.message}`);
        }
    }

    async findByTicket(idTicket, isSuperAdmin = false) {
        try {
            let query = `SELECT tc.*,
                    u.username
                FROM ticket_comentario tc
                LEFT JOIN usuario u ON u.id = tc.id_usuario
                WHERE tc.id_ticket_soporte = ? AND tc.estado_registro = 1`;
            const params = [idTicket];

            // Solo superadmin ve notas internas
            if (!isSuperAdmin) {
                query += ' AND tc.es_interno = false';
            }

            query += ' ORDER BY tc.fecha_registro ASC';

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            logger.error(`[ticketComentario.model.js] Error al obtener comentarios: ${error.message}`);
            throw new Error(`Error al obtener comentarios: ${error.message}`);
        }
    }

    async findById(id) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM ticket_comentario WHERE id = ? AND estado_registro = 1',
                [id]
            );
            return rows[0] || null;
        } catch (error) {
            logger.error(`[ticketComentario.model.js] Error al buscar comentario: ${error.message}`);
            throw new Error(`Error al buscar comentario: ${error.message}`);
        }
    }

    async delete(id, userId) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE ticket_comentario SET estado_registro = 0, usuario_actualizacion = ? WHERE id = ?',
                [userId, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            logger.error(`[ticketComentario.model.js] Error al eliminar comentario: ${error.message}`);
            throw new Error(`Error al eliminar comentario: ${error.message}`);
        }
    }

    async getLastByTicket(idTicket) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT tc.*, u.username
                FROM ticket_comentario tc
                LEFT JOIN usuario u ON u.id = tc.id_usuario
                WHERE tc.id_ticket_soporte = ? AND tc.estado_registro = 1
                ORDER BY tc.fecha_registro DESC LIMIT 1`,
                [idTicket]
            );
            return rows[0] || null;
        } catch (error) {
            logger.error(`[ticketComentario.model.js] Error al obtener ultimo comentario: ${error.message}`);
            throw new Error(`Error al obtener ultimo comentario: ${error.message}`);
        }
    }
}

module.exports = TicketComentarioModel;
