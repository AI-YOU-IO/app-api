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
     * 2. CONSULTAR LA VISTA
     * ============================================================
     */

    const [rows] = await pool.execute(
        `
        SELECT
            telefono,
            fecha_registro,
            id_empresa,
            base_nombre,
            campania_nombre,
            tipificacion_nombre,
            tipificacion_descripcion,
            tipificacion_equivalencia,
            duracion_seg
        FROM CONSUMO_INDICADORES_COMPLETO
        ${where}
        `,
        params
    );

    const total = rows.length;
    const BASE_TOTAL=rows.length;

    /**
     * ============================================================
     * 3. CALCULAR DURACIÓN GLOBAL
     * ============================================================
     */

    const totalDuracion = rows.reduce(
        (sum, r) => sum + (Number(r.duracion_seg) || 0),
        0
    );

    const promedioDuracion =
        total > 0
            ? Math.round(totalDuracion / total)
            : 0;

    /**
     * ============================================================
     * 4. CONTAR EQUIVALENCIAS
     * ============================================================
     */

    const equivalencias = {
        "ANSWER": 0,
        "C.VALIDO": 0,
        "NO_ANSWER": 0,
        "C.N.VALIDO": 0,
        "C.N.EFECTIVO": 0,
        "C.EFECTIVO": 0
    };

    rows.forEach(r => {
        const eq = r.tipificacion_equivalencia;
        if (equivalencias[eq] !== undefined) {
            equivalencias[eq]++;
        }
    });

    /**
     * ============================================================
     * 5. CONSTRUIR EMBUDO
     * ============================================================
     */

    const ANSWER_TOTAL =
        equivalencias["ANSWER"] +
        equivalencias["C.VALIDO"] +
        equivalencias["C.N.VALIDO"] +
        equivalencias["C.N.EFECTIVO"] +
        equivalencias["C.EFECTIVO"];

    const NO_ANSWER = equivalencias["NO_ANSWER"];

    const BASE_RECORRIDA = ANSWER_TOTAL + NO_ANSWER;
    const BASE_NO_RECORRIDA =  BASE_TOTAL-BASE_RECORRIDA  ;

    const CONTACTO_VALIDO =
        equivalencias["C.VALIDO"] +
        equivalencias["C.N.EFECTIVO"] +
        equivalencias["C.EFECTIVO"];

    const CONTACTO_NO_VALIDO = equivalencias["C.N.VALIDO"];

    const CONTACTO_EFECTIVO = equivalencias["C.EFECTIVO"];

    const CONTACTO_NO_EFECTIVO = equivalencias["C.N.EFECTIVO"];

    const embudo = {
        base_total: total,
        base_no_recorrida: BASE_NO_RECORRIDA,
        base_recorrida: BASE_RECORRIDA,
        answer: ANSWER_TOTAL,
        no_answer: NO_ANSWER,
        contacto_valido: CONTACTO_VALIDO,
        contacto_no_valido: CONTACTO_NO_VALIDO,
        contacto_efectivo: CONTACTO_EFECTIVO,
        contacto_no_efectivo: CONTACTO_NO_EFECTIVO
    };

    /**
     * ============================================================
     * 6. KPIs
     * ============================================================
     */

    const kpis = {
        contactabilidad:
            BASE_RECORRIDA > 0
                ? ANSWER_TOTAL / BASE_RECORRIDA
                : 0,

        tasa_cierre:
            CONTACTO_VALIDO > 0
                ? CONTACTO_EFECTIVO / CONTACTO_VALIDO
                : 0,

        efectividad:
            ANSWER_TOTAL > 0
                ? CONTACTO_EFECTIVO / ANSWER_TOTAL
                : 0,

        conversion_total:
            BASE_TOTAL > 0
                ? CONTACTO_EFECTIVO / BASE_TOTAL
                : 0,
        conversion_recorrida: 
            BASE_RECORRIDA > 0
                ? CONTACTO_EFECTIVO / BASE_RECORRIDA
                : 0
    };

    const kpis_percent = {
        contactabilidad: (kpis.contactabilidad * 100).toFixed(1),
        tasa_cierre: (kpis.tasa_cierre * 100).toFixed(1),
        efectividad: (kpis.efectividad * 100).toFixed(1),
        conversion_total: (kpis.conversion_total * 100).toFixed(1)
    };

    /**
     * ============================================================
     * 7. TIPIFICACIONES (DONUT)
     * ============================================================
     */

    const tipMap = {};

    rows.forEach(r => {
        const key = r.tipificacion_nombre || "Sin tipificar";

        if (!tipMap[key]) {
            tipMap[key] = {
                name: key,
                value: 0
            };
        }

        tipMap[key].value++;
    });

    const tipificaciones = Object
        .values(tipMap)
        .sort((a, b) => b.value - a.value);

    /**
     * ============================================================
     * 8. VOLUMEN POR HORA
     * ============================================================
     */

    const hourlyMap = {};

    rows.forEach(r => {
        if (!r.fecha_registro) return;

        const date = new Date(r.fecha_registro);
        const h = date.getHours();

        if (!hourlyMap[h]) {
            hourlyMap[h] = {
                hour: `${String(h).padStart(2, "0")}:00`,
                llamadas: 0,
                duracion: 0
            };
        }

        hourlyMap[h].llamadas++;
        hourlyMap[h].duracion += Number(r.duracion_seg) || 0;
    });

    const hourly = Object
        .values(hourlyMap)
        .sort((a, b) => a.hour.localeCompare(b.hour));

    /**
     * ============================================================
     * 9. RENDIMIENTO SEMANAL
     * ============================================================
     */

    const DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
    const weeklyMap = {};

    DAYS.forEach((d, i) => {
        weeklyMap[i] = {
            day: d,
            llamadas: 0,
            duracion: 0
        };
    });

    rows.forEach(r => {
        if (!r.fecha_registro) return;

        const date = new Date(r.fecha_registro);
        let dow = date.getDay();
        dow = dow === 0 ? 6 : dow - 1;

        weeklyMap[dow].llamadas++;
        weeklyMap[dow].duracion += Number(r.duracion_seg) || 0;
    });

    const weekly = Object.values(weeklyMap);

    /**
     * ============================================================
     * 10. HEATMAP DIA x HORA
     * ============================================================
     */

    const HOURS = [
        "06","07","08","09","10","11","12",
        "13","14","15","16","17","18","19",
        "20","21","22"
    ];

    const heatmap = Array.from({ length: 7 }, () =>
        Array(HOURS.length).fill(0)
    );

    rows.forEach(r => {
        if (!r.fecha_registro) return;

        const date = new Date(r.fecha_registro);

        let dow = date.getDay();
        dow = dow === 0 ? 6 : dow - 1;

        const hour = String(date.getHours()).padStart(2, "0");
        const hi = HOURS.indexOf(hour);

        if (hi >= 0 && dow >= 0 && dow < 7) {
            heatmap[dow][hi]++;
        }
    });

    /**
     * ============================================================
     * 11. MINUTOS POR DIA
     * ============================================================
     */

    const minutesMap = {};

    rows.forEach(r => {
        if (!r.fecha_registro) return;

        const date = new Date(r.fecha_registro);
        const day = date.toISOString().slice(0, 10);

        if (!minutesMap[day]) {
            minutesMap[day] = {
                day,
                minutos: 0,
                llamadas: 0
            };
        }

        minutesMap[day].minutos += Math.round((Number(r.duracion_seg) || 0) / 60);
        minutesMap[day].llamadas++;
    });

    const minutes = Object
        .values(minutesMap)
        .sort((a, b) => a.day.localeCompare(b.day));

    /**
     * ============================================================
     * 12. RESUMEN MINUTOS
     * ============================================================
     */

    const totalMinutosWeek = minutes.reduce(
        (s, d) => s + d.minutos,
        0
    );

    const avgMinutosDay =
        minutes.length > 0
            ? Math.round(totalMinutosWeek / minutes.length)
            : 0;

    const peakDay = minutes.reduce(
        (max, d) =>
            d.minutos > (max?.minutos || 0)
                ? d
                : max,
        null
    );

    /**
     * ============================================================
     * 13. AGRUPACIÓN POR CAMPAÑA
     * ============================================================
     */

    const campMap = {};

    rows.forEach(r => {
        const key = r.campania_nombre || "Sin campaña";

        if (!campMap[key]) {
            campMap[key] = {
                name: key,
                total: 0,
                duracion: 0
            };
        }

        campMap[key].total++;
        campMap[key].duracion += Number(r.duracion_seg) || 0;
    });

    const campanias = Object.values(campMap);

    campanias.forEach(c => {
        c.avg_duracion =
            c.total > 0
                ? Math.round(c.duracion / c.total)
                : 0;
    });

    const totalCampanias = campanias.length;

    /**
     * ============================================================
     * 14. RESPUESTA FINAL
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