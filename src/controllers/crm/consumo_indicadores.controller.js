/**
 * ============================================================
 * CONSUMO INDICADORES CONTROLLER
 * ============================================================
 * Endpoint que devuelve todos los indicadores del módulo
 * de llamadas.
 *
 * Usa el service/model:
 * models/consumo_indicadores.js
 *
 * Endpoint final:
 * GET /crm/consumo-indicadores
 *
 * Parámetros opcionales:
 * empresa
 * fecha_inicio
 * fecha_fin
 * ============================================================
 */

const consumoIndicadoresModel = require("../../models/consumo_indicadores");

/**
 * Obtener indicadores de llamadas
 */
async function getConsumoIndicadores(req, res) {

    try {

        /**
         * =====================================================
         * Leer filtros desde query
         * =====================================================
         */

        const empresa = req.query.empresa || "all";
        const fecha_inicio = req.query.fecha_inicio || null;
        const fecha_fin = req.query.fecha_fin || null;

        /**
         * =====================================================
         * Llamar al modelo
         * =====================================================
         */

        const data = await consumoIndicadoresModel.getConsumoIndicadores({
            empresa,
            fecha_inicio,
            fecha_fin
        });

        /**
         * =====================================================
         * Respuesta API
         * =====================================================
         */

        res.status(200).json({
            success: true,
            data
        });

    } catch (error) {

        console.error("Error consumo indicadores:", error);

        res.status(500).json({
            success: false,
            message: "Error al obtener indicadores",
            error: error.message
        });

    }

}

module.exports = {
    getConsumoIndicadores
};