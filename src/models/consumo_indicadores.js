/**
 * ============================================================
 * CONSUMO INDICADORES SERVICE
 * ============================================================
 *
 * Este servicio calcula todos los indicadores del módulo
 * de llamadas usando la vista SQL:
 *
 *      CONSUMO_INDICADORES_COMPLETO
 *
 * IMPORTANTE
 * ------------------------------------------------------------
 * El frontend NO hace cálculos.
 * Todo el procesamiento ocurre aquí.
 *
 * El servicio devuelve datasets listos para:
 *
 * - Embudo
 * - KPIs
 * - Donut tipificaciones
 * - Area chart por hora
 * - Barras semanales
 * - Heatmap día x hora
 * - Consumo minutos
 * - Tabla por campaña
 *
 * ============================================================
 */

const { pool } = require("../config/dbConnection");

/**
 * ============================================================
 * FUNCIÓN PRINCIPAL
 * ============================================================
 */

async function getConsumoIndicadores({ empresa, fecha_inicio, fecha_fin }) {
    /**
     * ============================================================
     * 1. CONSTRUCCIÓN DE FILTROS SQL
     * ============================================================
     */

    const params = [];
    let where = "WHERE 1=1";

    if (empresa && empresa !== "all") {
        where += " AND id_empresa = ?";
        params.push(empresa);
    }

    if (fecha_inicio && fecha_fin) {
        where += " AND DATE(fecha_registro) BETWEEN ? AND ?";
        params.push(fecha_inicio, fecha_fin);
    }

    /**
     * ============================================================
     * 2. EJECUTAR QUERIES EN PARALELO (SQL hace las agregaciones)
     * ============================================================
     */

    const [
        [totalesRows],
        [equivalenciasRows],
        [tipificacionesRows],
        [hourlyRows],
        [weeklyRows],
        [heatmapRows],
        [minutesRows],
        [campaniasRows]
    ] = await Promise.all([
        // ── Totales y duración global
        pool.execute(`
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(duracion_seg), 0) AS total_duracion,
                CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(duracion_seg)) ELSE 0 END AS promedio_duracion
            FROM CONSUMO_INDICADORES_COMPLETO
            ${where}
        `, params),

        // ── Equivalencias (embudo + KPIs)
        pool.execute(`
            SELECT
                COALESCE(tipificacion_equivalencia, 'SIN_EQUIVALENCIA') AS equivalencia,
                COUNT(*) AS cantidad
            FROM CONSUMO_INDICADORES_COMPLETO
            ${where}
            GROUP BY tipificacion_equivalencia
        `, params),

        // ── Tipificaciones (donut)
        pool.execute(`
            SELECT
                COALESCE(tipificacion_nombre, 'Sin tipificar') AS name,
                COUNT(*) AS value
            FROM CONSUMO_INDICADORES_COMPLETO
            ${where}
            GROUP BY tipificacion_nombre
            ORDER BY value DESC
        `, params),

        // ── Volumen por hora
        pool.execute(`
            SELECT
                EXTRACT(HOUR FROM fecha_registro)::integer AS hora,
                COUNT(*) AS llamadas,
                COALESCE(SUM(duracion_seg), 0) AS duracion
            FROM CONSUMO_INDICADORES_COMPLETO
            ${where}
            AND fecha_registro IS NOT NULL
            GROUP BY EXTRACT(HOUR FROM fecha_registro)
            ORDER BY hora
        `, params),

        // ── Rendimiento semanal (0=dom, 1=lun ... 6=sab)
        pool.execute(`
            SELECT
                EXTRACT(DOW FROM fecha_registro)::integer AS dow,
                COUNT(*) AS llamadas,
                COALESCE(SUM(duracion_seg), 0) AS duracion
            FROM CONSUMO_INDICADORES_COMPLETO
            ${where}
            AND fecha_registro IS NOT NULL
            GROUP BY EXTRACT(DOW FROM fecha_registro)
            ORDER BY dow
        `, params),

        // ── Heatmap día x hora
        pool.execute(`
            SELECT
                EXTRACT(DOW FROM fecha_registro)::integer AS dow,
                EXTRACT(HOUR FROM fecha_registro)::integer AS hora,
                COUNT(*) AS cantidad
            FROM CONSUMO_INDICADORES_COMPLETO
            ${where}
            AND fecha_registro IS NOT NULL
            GROUP BY EXTRACT(DOW FROM fecha_registro), EXTRACT(HOUR FROM fecha_registro)
        `, params),

        // ── Minutos por día
        pool.execute(`
            SELECT
                DATE(fecha_registro)::text AS day,
                ROUND(COALESCE(SUM(duracion_seg), 0) / 60) AS minutos,
                COUNT(*) AS llamadas
            FROM CONSUMO_INDICADORES_COMPLETO
            ${where}
            AND fecha_registro IS NOT NULL
            GROUP BY DATE(fecha_registro)
            ORDER BY day
        `, params),

        // ── Agrupación por campaña
        pool.execute(`
            SELECT
                COALESCE(campania_nombre, 'Sin campaña') AS name,
                COUNT(*) AS total,
                COALESCE(SUM(duracion_seg), 0) AS duracion,
                CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(duracion_seg)) ELSE 0 END AS avg_duracion
            FROM CONSUMO_INDICADORES_COMPLETO
            ${where}
            GROUP BY campania_nombre
        `, params)
    ]);

    /**
     * ============================================================
     * 3. PROCESAR RESULTADOS
     * ============================================================
     */

    const total = Number(totalesRows[0]?.total || 0);
    const BASE_TOTAL = total;
    const promedioDuracion = Number(totalesRows[0]?.promedio_duracion || 0);

    // ── Equivalencias
    const equivalencias = {
        "ANSWER": 0, "C.VALIDO": 0, "NO_ANSWER": 0,
        "C.N.VALIDO": 0, "C.N.EFECTIVO": 0, "C.EFECTIVO": 0
    };
    equivalenciasRows.forEach(r => {
        if (equivalencias[r.equivalencia] !== undefined) {
            equivalencias[r.equivalencia] = Number(r.cantidad);
        }
    });

    // ── Embudo
    const ANSWER_TOTAL = equivalencias["ANSWER"] + equivalencias["C.VALIDO"] +
        equivalencias["C.N.VALIDO"] + equivalencias["C.N.EFECTIVO"] + equivalencias["C.EFECTIVO"];
    const NO_ANSWER = equivalencias["NO_ANSWER"];
    const BASE_RECORRIDA = ANSWER_TOTAL + NO_ANSWER;
    const BASE_NO_RECORRIDA = BASE_TOTAL - BASE_RECORRIDA;
    const CONTACTO_VALIDO = equivalencias["C.VALIDO"] + equivalencias["C.N.EFECTIVO"] + equivalencias["C.EFECTIVO"];
    const CONTACTO_NO_VALIDO = equivalencias["C.N.VALIDO"];
    const CONTACTO_EFECTIVO = equivalencias["C.EFECTIVO"];
    const CONTACTO_NO_EFECTIVO = equivalencias["C.N.EFECTIVO"];

    const embudo = {
        base_total: total, base_no_recorrida: BASE_NO_RECORRIDA,
        base_recorrida: BASE_RECORRIDA, answer: ANSWER_TOTAL, no_answer: NO_ANSWER,
        contacto_valido: CONTACTO_VALIDO, contacto_no_valido: CONTACTO_NO_VALIDO,
        contacto_efectivo: CONTACTO_EFECTIVO, contacto_no_efectivo: CONTACTO_NO_EFECTIVO
    };

    // ── KPIs
    const kpis = {
        contactabilidad: BASE_RECORRIDA > 0 ? ANSWER_TOTAL / BASE_RECORRIDA : 0,
        tasa_cierre: CONTACTO_VALIDO > 0 ? CONTACTO_EFECTIVO / CONTACTO_VALIDO : 0,
        efectividad: ANSWER_TOTAL > 0 ? CONTACTO_EFECTIVO / ANSWER_TOTAL : 0,
        conversion_total: BASE_TOTAL > 0 ? CONTACTO_EFECTIVO / BASE_TOTAL : 0,
        conversion_recorrida: BASE_RECORRIDA > 0 ? CONTACTO_EFECTIVO / BASE_RECORRIDA : 0
    };

    const kpis_percent = {
        contactabilidad: (kpis.contactabilidad * 100).toFixed(1),
        tasa_cierre: (kpis.tasa_cierre * 100).toFixed(1),
        efectividad: (kpis.efectividad * 100).toFixed(1),
        conversion_total: (kpis.conversion_total * 100).toFixed(1)
    };

    // ── Tipificaciones (ya viene ordenado del SQL)
    const tipificaciones = tipificacionesRows.map(r => ({
        name: r.name, value: Number(r.value)
    }));

    // ── Volumen por hora
    const hourly = hourlyRows.map(r => ({
        hour: `${String(r.hora).padStart(2, "0")}:00`,
        llamadas: Number(r.llamadas),
        duracion: Number(r.duracion)
    }));

    // ── Rendimiento semanal
    const DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
    const weeklyBase = DAYS.map(d => ({ day: d, llamadas: 0, duracion: 0 }));
    weeklyRows.forEach(r => {
        // PostgreSQL DOW: 0=dom, 1=lun ... 6=sab → convertir a 0=lun ... 6=dom
        const idx = r.dow === 0 ? 6 : r.dow - 1;
        weeklyBase[idx].llamadas = Number(r.llamadas);
        weeklyBase[idx].duracion = Number(r.duracion);
    });
    const weekly = weeklyBase;

    // ── Heatmap
    const HOURS = ["06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22"];
    const heatmap = Array.from({ length: 7 }, () => Array(HOURS.length).fill(0));
    heatmapRows.forEach(r => {
        const dow = r.dow === 0 ? 6 : r.dow - 1;
        const hi = HOURS.indexOf(String(r.hora).padStart(2, "0"));
        if (hi >= 0 && dow >= 0 && dow < 7) {
            heatmap[dow][hi] = Number(r.cantidad);
        }
    });

    // ── Minutos por día
    const minutes = minutesRows.map(r => ({
        day: r.day, minutos: Number(r.minutos), llamadas: Number(r.llamadas)
    }));

    // ── Resumen minutos
    const totalMinutosWeek = minutes.reduce((s, d) => s + d.minutos, 0);
    const avgMinutosDay = minutes.length > 0 ? Math.round(totalMinutosWeek / minutes.length) : 0;
    const peakDay = minutes.reduce((max, d) => d.minutos > (max?.minutos || 0) ? d : max, null);

    // ── Campañas
    const campanias = campaniasRows.map(r => ({
        name: r.name, total: Number(r.total),
        duracion: Number(r.duracion), avg_duracion: Number(r.avg_duracion)
    }));
    const totalCampanias = campanias.length;

    /**
     * ============================================================
     * 4. RESPUESTA FINAL
     * ============================================================
     */

    return {
        total,
        promedioDuracion,
        totalCampanias,
        equivalencias,
        embudo,
        kpis,
        kpis_percent,
        tipificaciones,
        hourly,
        weekly,
        heatmap,
        minutes,
        totalMinutosWeek,
        avgMinutosDay,
        peakDay,
        campanias
    };
}

/**
 * ============================================================
 * EXPORTAR SERVICIO
 * ============================================================
 */

module.exports = {
    getConsumoIndicadores
};