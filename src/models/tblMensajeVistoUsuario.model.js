const { pool } = require("../config/dbConnection.js");

class TblMensajeVistoUsuarioModel {

    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    /**
     * Marca un mensaje como visto para un usuario
     * @param {number} idUsuario - ID del usuario
     * @param {number} idMensaje - ID del mensaje visto
     * @param {number} idChat - ID del chat
     */
    async markAsRead(idUsuario, idMensaje, idChat) {
        try {
            const [existing] = await this.connection.execute(
                'SELECT id FROM mensaje_visto_usuario WHERE id_usuario = ? AND id_mensaje = ?',
                [idUsuario, idMensaje]
            );

            if (existing.length === 0) {
                await this.connection.execute(
                    'INSERT INTO mensaje_visto_usuario (id_usuario, id_contacto, id_mensaje, fecha_visto) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                    [idUsuario, idChat, idMensaje]
                );
            }

            return true;
        } catch (error) {
            throw new Error(`Error al marcar mensaje como visto: ${error.message}`);
        }
    }

    /**
     * Guarda solo el ultimo mensaje visto para un chat (upsert)
     * @param {number} idUsuario - ID del usuario
     * @param {number} idChat - ID del chat
     * @param {number} idMensaje - ID del ultimo mensaje visto
     */
    async saveLastSeenMessage(idUsuario, idChat, idMensaje) {
        try {
            const [existing] = await this.connection.execute(
                'SELECT id, id_mensaje FROM mensaje_visto_usuario WHERE id_usuario = ? AND id_contacto = ?',
                [idUsuario, idChat]
            );

            if (existing.length > 0) {
                if (idMensaje > existing[0].id_mensaje) {
                    await this.connection.execute(
                        'UPDATE mensaje_visto_usuario SET id_mensaje = ?, fecha_visto = CURRENT_TIMESTAMP WHERE id = ?',
                        [idMensaje, existing[0].id]
                    );
                }
            } else {
                await this.connection.execute(
                    'INSERT INTO mensaje_visto_usuario (id_usuario, id_contacto, id_mensaje, fecha_visto) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                    [idUsuario, idChat, idMensaje]
                );
            }

            return true;
        } catch (error) {
            throw new Error(`Error al guardar ultimo mensaje visto: ${error.message}`);
        }
    }

    /**
     * Marca todos los mensajes de un chat como vistos para un usuario (hasta un mensaje específico)
     * DEPRECATED: Usar saveLastSeenMessage en su lugar
     */
    async markAllAsReadForContact(idUsuario, idChat, idMensajeHasta) {
        return this.saveLastSeenMessage(idUsuario, idChat, idMensajeHasta);
    }

    /**
     * Obtiene el conteo de chats con mensajes no leidos para un usuario
     * @param {number} idUsuario - ID del usuario
     * @param {number|null} idAsesor - ID del asesor (para filtrar por persona asignada)
     * @param {number|null} idEmpresa - ID de la empresa del usuario
     * @returns {Promise<number>} - Cantidad de chats con mensajes no leidos
     */
    async getUnreadContactsCount(idUsuario, idAsesor = null, idEmpresa = null) {
        try {
            let query = `
                SELECT COUNT(DISTINCT c.id) as unread_count
                FROM chat c
                LEFT JOIN persona p ON p.id = c.id_persona
                LEFT JOIN (
                    SELECT id_chat, MAX(id) as ultimo_mensaje_id
                    FROM mensaje
                    WHERE estado_registro = 1
                    GROUP BY id_chat
                ) ultimo_msg ON ultimo_msg.id_chat = c.id
                LEFT JOIN mensaje_visto_usuario mvu ON mvu.id_contacto = c.id AND mvu.id_usuario = ?
                WHERE ultimo_msg.ultimo_mensaje_id IS NOT NULL
                AND (mvu.id_mensaje IS NULL OR mvu.id_mensaje < ultimo_msg.ultimo_mensaje_id)
            `;

            const params = [idUsuario];

            if (idEmpresa !== null && idEmpresa !== undefined) {
                query += ` AND p.id_empresa = ?`;
                params.push(idEmpresa);
            }

            if (idAsesor !== null) {
                query += ` AND p.id_usuario = ?`;
                params.push(idAsesor);
            }

            const [rows] = await this.connection.execute(query, params);
            return rows[0]?.unread_count || 0;
        } catch (error) {
            throw new Error(`Error al obtener chats no leidos: ${error.message}`);
        }
    }

    /**
     * Verifica si un chat tiene mensajes no leidos para un usuario
     * @param {number} idUsuario - ID del usuario
     * @param {number} idChat - ID del chat
     * @returns {Promise<boolean>} - true si tiene mensajes no leidos
     */
    async hasUnreadMessages(idUsuario, idChat) {
        try {
            const [rows] = await this.connection.execute(`
                SELECT
                    COALESCE((SELECT MAX(id) FROM mensaje WHERE id_chat = ? AND estado_registro = 1), 0) as ultimo_mensaje,
                    COALESCE((SELECT id_mensaje FROM mensaje_visto_usuario WHERE id_usuario = ? AND id_contacto = ?), 0) as ultimo_visto
            `, [idChat, idUsuario, idChat]);

            const ultimoMensaje = rows[0]?.ultimo_mensaje || 0;
            const ultimoVisto = rows[0]?.ultimo_visto || 0;

            return ultimoMensaje > ultimoVisto;
        } catch (error) {
            throw new Error(`Error al verificar mensajes no leidos: ${error.message}`);
        }
    }

    /**
     * Obtiene el ultimo mensaje visto por un usuario para un chat
     * @param {number} idUsuario - ID del usuario
     * @param {number} idChat - ID del chat
     * @returns {Promise<number|null>} - ID del ultimo mensaje visto o null
     */
    async getLastSeenMessage(idUsuario, idChat) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT id_mensaje FROM mensaje_visto_usuario WHERE id_usuario = ? AND id_contacto = ?',
                [idUsuario, idChat]
            );

            return rows[0]?.id_mensaje || null;
        } catch (error) {
            throw new Error(`Error al obtener ultimo mensaje visto: ${error.message}`);
        }
    }
}

module.exports = TblMensajeVistoUsuarioModel;
