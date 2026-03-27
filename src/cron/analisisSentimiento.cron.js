const { pool } = require("../config/dbConnection.js");
const logger = require('../config/logger/loggerClient.js');
const sentimientoService = require('../services/analisis/sentimiento.service.js');

// Intervalo: cada 1 hora
const INTERVALO_MS = 60 * 60 * 1000;
const HORAS_INACTIVIDAD = 24;
const LIMITE_POR_CICLO = 50;

/**
 * Procesa chats/mensajes inactivos por más de 24 horas que no tienen análisis de sentimiento.
 * Solo chats — las llamadas se analizan inmediatamente al guardar la transcripción.
 */
async function procesarChatsInactivos() {
    try {
        const [candidatos] = await pool.execute(
            `SELECT c.id as id_chat, c.id_empresa
            FROM chat c
            INNER JOIN mensaje m ON m.id_chat = c.id
            LEFT JOIN analisis_sentimiento as2 ON as2.id_chat = c.id AND as2.estado_registro = 1
            WHERE c.estado_registro = 1
              AND as2.id IS NULL
              AND m.estado_registro = 1
            GROUP BY c.id, c.id_empresa
            HAVING MAX(m.fecha_registro) < NOW() - INTERVAL '24 hours'
               AND COUNT(m.id) >= 3
            ORDER BY MAX(m.fecha_registro) DESC
            LIMIT ?`,
            [LIMITE_POR_CICLO]
        );

        if (candidatos.length === 0) {
            logger.info(`[cron:sentimiento] Sin chats pendientes de análisis`);
            return;
        }

        logger.info(`[cron:sentimiento] Procesando ${candidatos.length} chats inactivos (+${HORAS_INACTIVIDAD}h)`);

        let procesados = 0;
        let errores = 0;

        for (const candidato of candidatos) {
            try {
                const [mensajes] = await pool.execute(
                    `SELECT direccion, contenido FROM mensaje
                    WHERE id_chat = ? AND estado_registro = 1 AND contenido IS NOT NULL AND contenido != ''
                    ORDER BY fecha_registro ASC`,
                    [candidato.id_chat]
                );

                if (mensajes.length >= 3) {
                    await sentimientoService.analizarChat(candidato.id_chat, mensajes, candidato.id_empresa);
                    procesados++;
                }
            } catch (err) {
                logger.error(`[cron:sentimiento] Error procesando chat ${candidato.id_chat}: ${err.message}`);
                errores++;
            }
        }

        logger.info(`[cron:sentimiento] Chats procesados: ${procesados}, errores: ${errores}`);
    } catch (error) {
        logger.error(`[cron:sentimiento] Error en procesarChatsInactivos: ${error.message}`);
    }
}

/**
 * Inicia el cron de análisis de sentimiento para chats/mensajes
 */
function iniciarCronSentimiento() {
    logger.info(`[cron:sentimiento] Cron iniciado - intervalo: ${INTERVALO_MS / 60000} min, inactividad chats: ${HORAS_INACTIVIDAD}h`);

    // Ejecutar primera vez después de 30 segundos (dar tiempo a que el server arranque)
    setTimeout(() => {
        procesarChatsInactivos();
        // Luego repetir cada hora
        setInterval(procesarChatsInactivos, INTERVALO_MS);
    }, 30000);
}

module.exports = { iniciarCronSentimiento };
