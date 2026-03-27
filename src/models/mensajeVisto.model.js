const { pool } = require("../config/dbConnection.js");

const DOMINIO_COBRANZAS = 'https://cobranzas-auna.oncosalud.pe';

class MensajeVistoModel {

    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    /**
     * Obtiene los 5 últimos mensajes de cada chat activo de una empresa
     * y filtra solo los que contienen una URL del dominio de cobranzas.
     * @param {number} idEmpresa
     * @returns {Promise<Array>} mensajes con URL de cobranzas
     */
    async getUltimosConUrlCobranzas(idEmpresa) {
        const [rows] = await this.connection.execute(`
            SELECT m.id as id_mensaje,
                   m.id_chat,
                   m.contenido,
                   m.direccion,
                   m.fecha_hora,
                   c.id_persona,
                   p.id_usuario
            FROM mensaje m
            INNER JOIN chat c ON c.id = m.id_chat
            INNER JOIN persona p ON p.id = c.id_persona
            WHERE c.estado_registro = 1
              AND m.estado_registro = 1
              AND p.id_empresa = ?
              AND m.contenido LIKE ?
              AND m.id IN (
                  SELECT sub.id FROM (
                      SELECT m2.id, m2.id_chat,
                             ROW_NUMBER() OVER (PARTITION BY m2.id_chat ORDER BY m2.id DESC) as rn
                      FROM mensaje m2
                      INNER JOIN chat c2 ON c2.id = m2.id_chat
                      INNER JOIN persona p2 ON p2.id = c2.id_persona
                      WHERE c2.estado_registro = 1
                        AND m2.estado_registro = 1
                        AND p2.id_empresa = ?
                  ) sub WHERE sub.rn <= 5
              )
            ORDER BY m.id_chat, m.id DESC
        `, [idEmpresa, `%${DOMINIO_COBRANZAS}%`, idEmpresa]);

        return rows;
    }

    /**
     * Verifica si un mensaje ya fue registrado en mensaje_visto
     * @param {number} idMensaje
     * @returns {Promise<boolean>}
     */
    async existeRegistro(idMensaje) {
        const [rows] = await this.connection.execute(
            'SELECT id FROM mensaje_visto WHERE id_mensaje = ? AND estado_registro = 1',
            [idMensaje]
        );
        return rows.length > 0;
    }

    /**
     * Registra un mensaje como visto en la tabla mensaje_visto
     * @param {Object} data
     * @returns {Promise<number>} id del registro creado
     */
    async registrar({ id_mensaje, id_usuario, id_contacto, tipo_recuperacion }) {
        const [result] = await this.connection.execute(
            `INSERT INTO mensaje_visto (id_mensaje, id_usuario, id_contacto, tipo_recuperacion, fecha_visto, mensaje_enviado, estado_registro, usuario_registro, fecha_registro, fecha_actualizacion)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, false, 1, ?, NOW(), NOW())`,
            [id_mensaje, id_usuario, id_contacto, tipo_recuperacion || null, id_usuario]
        );
        return result.insertId;
    }

    /**
     * Actualiza el estado de envío de un registro de mensaje_visto
     * @param {number} id
     * @param {boolean} enviado
     * @param {string|null} errorEnvio
     */
    async actualizarEstadoEnvio(id, enviado, errorEnvio = null) {
        await this.connection.execute(
            `UPDATE mensaje_visto SET mensaje_enviado = ?, error_envio = ?, fecha_actualizacion = NOW() WHERE id = ?`,
            [enviado, errorEnvio, id]
        );
    }

    /**
     * Obtiene los mensajes candidatos con URL de cobranzas que aún no están en mensaje_visto.
     * Retorna solo los nuevos (no duplicados), listos para bulk insert.
     * @param {number} idEmpresa
     * @returns {Promise<Array>}
     */
    async getCandidatosNuevos(idEmpresa) {
        const [rows] = await this.connection.execute(`
            SELECT m.id as id_mensaje,
                   m.id_chat,
                   m.contenido,
                   m.fecha_hora,
                   c.id_persona,
                   COALESCE(p.id_usuario, 0) as id_usuario
            FROM mensaje m
            INNER JOIN chat c ON c.id = m.id_chat
            INNER JOIN persona p ON p.id = c.id_persona
            WHERE c.estado_registro = 1
              AND m.estado_registro = 1
              AND p.id_empresa = ?
              AND m.contenido LIKE ?
              AND m.tipo_mensaje NOT IN ('recuperacion')
              AND m.id IN (
                  SELECT sub.id FROM (
                      SELECT m2.id,
                             ROW_NUMBER() OVER (PARTITION BY m2.id_chat ORDER BY m2.id DESC) as rn
                      FROM mensaje m2
                      INNER JOIN chat c2 ON c2.id = m2.id_chat
                      INNER JOIN persona p2 ON p2.id = c2.id_persona
                      WHERE c2.estado_registro = 1
                        AND m2.estado_registro = 1
                        AND p2.id_empresa = ?
                  ) sub WHERE sub.rn <= 5
              )
              AND NOT EXISTS (
                  SELECT 1 FROM mensaje_visto mv
                  WHERE mv.id_mensaje = m.id AND mv.estado_registro = 1
              )
            ORDER BY m.id_chat, m.id DESC
        `, [idEmpresa, `%${DOMINIO_COBRANZAS}%`, idEmpresa]);

        return rows;
    }

    /**
     * Inserta múltiples registros en mensaje_visto de una sola vez (bulk create).
     * @param {Array<{id_mensaje, id_usuario, id_contacto, tipo_recuperacion}>} registros
     * @returns {Promise<number>} cantidad de filas insertadas
     */
    async bulkCreate(registros) {
        if (!registros.length) return 0;

        const valores = registros.map(() =>
            '(?, ?, ?, ?, CURRENT_TIMESTAMP, false, 1, ?, NOW(), NOW())'
        ).join(', ');

        const params = registros.flatMap(r => [
            r.id_mensaje,
            r.id_usuario,
            r.id_contacto,
            r.tipo_recuperacion || null,
            r.id_usuario
        ]);

        const [result] = await this.connection.execute(
            `INSERT INTO mensaje_visto (id_mensaje, id_usuario, id_contacto, tipo_recuperacion, fecha_visto, mensaje_enviado, estado_registro, usuario_registro, fecha_registro, fecha_actualizacion)
             VALUES ${valores}`,
            params
        );

        return result.rowCount || result.affectedRows || 0;
    }
}

module.exports = MensajeVistoModel;
