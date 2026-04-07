const { pool } = require("../config/dbConnection.js");
const logger = require("../config/logger/loggerClient.js");

class KpiController {

    async getKpis(req, res) {
        try {
            const { start_date, end_date, id_empresa } = req.query;

            if (!start_date || !end_date || !id_empresa) {
                return res.status(400).json({ msg: "start_date, end_date y id_empresa son requeridos" });
            }

            // ── 1. KPIs generales ────────────────────────────────────────────────
            const [kpisRows] = await pool.execute(`
                WITH base AS (
                    SELECT
                        id,
                        CASE
                            WHEN json_mensajes IS NULL OR json_mensajes::text = '[]' THEN NULL
                            ELSE json_mensajes::jsonb
                        END AS mensajes
                    FROM vw_chat_resumen_final
                    WHERE fecha_registro::date BETWEEN ? AND ?
                      AND id_empresa = ?
                )
                SELECT
                    COUNT(id)                                                                                         AS chat_totales,
                    COUNT(CASE WHEN mensajes IS NULL THEN 1 END)                                                     AS no_enviados,
                    COUNT(CASE WHEN mensajes IS NOT NULL AND mensajes->0->>'direccion' = 'in'  THEN 1 END)           AS mensajes_entrantes,
                    COUNT(CASE WHEN mensajes IS NOT NULL AND mensajes->0->>'direccion' = 'out' THEN 1 END)           AS mensajes_salientes,
                    COUNT(CASE WHEN mensajes IS NOT NULL
                                    AND mensajes->0->>'direccion' = 'in'
                                    AND mensajes @> '[{"direccion":"out"}]'                    THEN 1 END)           AS mensajes_entrantes_respondidos,
                    COUNT(CASE WHEN mensajes IS NOT NULL
                                    AND mensajes->0->>'direccion' = 'out'
                                    AND mensajes @> '[{"direccion":"in"}]'                     THEN 1 END)           AS mensajes_salientes_respondidos
                FROM base
            `, [start_date, end_date, id_empresa]);

            const k = kpisRows[0];
            const entrantes           = Number(k.mensajes_entrantes);
            const salientes           = Number(k.mensajes_salientes);
            const entrantesResp       = Number(k.mensajes_entrantes_respondidos);
            const salientesResp       = Number(k.mensajes_salientes_respondidos);

            const tasa_respuesta_inbound  = entrantes  > 0 ? +((entrantesResp / entrantes)  * 100).toFixed(2) : 0;
            const tasa_respuesta_outbound = salientes  > 0 ? +((salientesResp / salientes)  * 100).toFixed(2) : 0;
            const productividad_entrante  = entrantesResp > 0 ? +(entrantes  / entrantesResp).toFixed(2) : 0;
            const productividad_saliente  = salientesResp > 0 ? +(salientes  / salientesResp).toFixed(2) : 0;

            // ── 2. First Response Time (FRT) ─────────────────────────────────────
            const [frtRows] = await pool.execute(`
                WITH expanded AS (
                    SELECT
                        v.id,
                        v.json_mensajes::jsonb->0->>'direccion'  AS primera_direccion,
                        elem->>'fecha_registro'                       AS fecha_registro,
                        elem->>'direccion'                        AS direccion,
                        ROW_NUMBER() OVER (
                            PARTITION BY v.id
                            ORDER BY (elem->>'fecha_registro')
                        ) AS rn
                    FROM vw_chat_resumen_final v,
                         jsonb_array_elements(v.json_mensajes::jsonb) AS elem
                    WHERE v.fecha_registro::date BETWEEN ? AND ?
                      AND v.id_empresa = ?
                      AND v.json_mensajes IS NOT NULL
                      AND v.json_mensajes::text != '[]'
                ),
                primer_mensaje AS (
                    SELECT id, primera_direccion, fecha_registro AS ts_primero
                    FROM expanded
                    WHERE rn = 1
                ),
                primera_respuesta AS (
                    SELECT DISTINCT ON (e.id) e.id, e.fecha_registro AS ts_respuesta
                    FROM expanded e
                    JOIN primer_mensaje p ON p.id = e.id
                    WHERE e.direccion != p.primera_direccion
                    ORDER BY e.id, e.fecha_registro
                )
                SELECT
                    ROUND(
                        AVG(
                            EXTRACT(EPOCH FROM (
                                pr.ts_respuesta::timestamptz - pm.ts_primero::timestamptz
                            )) / 60
                        )::numeric, 2
                    ) AS frt_minutos
                FROM primer_mensaje pm
                JOIN primera_respuesta pr ON pm.id = pr.id
            `, [start_date, end_date, id_empresa]);

            const frt_minutos = frtRows[0]?.frt_minutos ?? null;

            // ── 3. Links de pago enviados ─────────────────────────────────────────
            const [linksPagoRows] = await pool.execute(`
                SELECT COUNT(*) AS links_pago_enviados
                FROM vw_chat_resumen_final
                WHERE fecha_registro::date BETWEEN ? AND ?
                  AND id_empresa = ?
                  AND enviado_link = true
            `, [start_date, end_date, id_empresa]);

            const links_pago_enviados = Number(linksPagoRows[0]?.links_pago_enviados ?? 0);

            // ── 4. Tipificaciones (donut) ─────────────────────────────────────────
            const [tipificacionRows] = await pool.execute(`
                SELECT
                    COALESCE(nombre_tipificacion_bot_whasap, 'Sin tipificar') AS name,
                    COUNT(*) AS value
                FROM vw_chat_resumen_final
                WHERE fecha_registro::date BETWEEN ? AND ?
                  AND id_empresa = ?
                GROUP BY nombre_tipificacion_bot_whasap
                ORDER BY value DESC
            `, [start_date, end_date, id_empresa]);

            // ── 5. Equivalencias tipificación ────────────────────────────────────
            const [equivalenciaRows] = await pool.execute(`
                SELECT
                    COALESCE(equivalencia_tipificacion_bot_whasap, 'ULTIMO_MENSAJE_MENOR_A_24_HORAS') AS equivalencia,
                    COUNT(*) AS value
                FROM vw_chat_resumen_final
                WHERE fecha_registro::date BETWEEN ? AND ?
                  AND id_empresa = ?
                GROUP BY equivalencia_tipificacion_bot_whasap
                ORDER BY value DESC
            `, [start_date, end_date, id_empresa]);

            // ── 6. Actividad por usuario y hora ──────────────────────────────────
            const [porUsuarioHoraRows] = await pool.execute(`
                SELECT
                    username,
                    EXTRACT(HOUR FROM (
                        SELECT elem->>'fecha_registro'
                        FROM jsonb_array_elements(json_mensajes::jsonb) AS elem
                        ORDER BY elem->>'fecha_registro' DESC
                        LIMIT 1
                    )::timestamptz) AS hora,
                    COUNT(*) AS chats
                FROM vw_chat_resumen_final
                WHERE fecha_registro::date BETWEEN ? AND ?
                  AND id_empresa = ?
                  AND json_mensajes IS NOT NULL
                  AND json_mensajes::text != '[]'
                GROUP BY username, hora
                ORDER BY username, hora
            `, [start_date, end_date, id_empresa]);

            return res.status(200).json({
                data: {
                    kpis: {
                        chat_totales:                   Number(k.chat_totales),
                        no_enviados:                    Number(k.no_enviados),
                        mensajes_entrantes:             entrantes,
                        mensajes_salientes:             salientes,
                        mensajes_entrantes_respondidos: entrantesResp,
                        mensajes_salientes_respondidos: salientesResp,
                        tasa_respuesta_inbound,
                        tasa_respuesta_outbound,
                        productividad_entrante,
                        productividad_saliente,
                        frt_minutos,
                        links_pago_enviados,
                    },
                    por_usuario_hora: porUsuarioHoraRows,
                    tipificaciones: tipificacionRows,
                    equivalencias: equivalenciaRows,
                }
            });

        } catch (error) {
            logger.error(`[kpi.controller.js] Error al obtener KPIs: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener KPIs" });
        }
    }
}

module.exports = new KpiController();
