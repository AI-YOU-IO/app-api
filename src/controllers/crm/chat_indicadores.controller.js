/**
 * ============================================================
 * CHAT INDICADORES CONTROLLER
 * ============================================================
 * Endpoint que devuelve indicadores del módulo de chat.
 *
 * Endpoint final:
 * GET /crm/chat-indicadores
 *
 * Parámetros opcionales:
 * empresa, fecha_inicio, fecha_fin
 * ============================================================
 */

const chatIndicadoresModel = require("../../models/chat_indicadores");

async function getChatIndicadores(req, res) {
    try {
        const empresa = req.query.empresa || "all";
        const fecha_inicio = req.query.fecha_inicio || null;
        const fecha_fin = req.query.fecha_fin || null;

        const data = await chatIndicadoresModel.getChatIndicadores({
            empresa,
            fecha_inicio,
            fecha_fin
        });

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error("Error chat indicadores:", error);
        res.status(500).json({
            success: false,
            message: "Error al obtener indicadores de chat",
            error: error.message
        });
    }
}

module.exports = { getChatIndicadores };
