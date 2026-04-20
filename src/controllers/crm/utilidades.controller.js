const logger = require("../../config/logger/loggerClient.js");

const COUNTRY_TIMEZONES = {
    PE: "America/Lima",
    PERU: "America/Lima",
    CO: "America/Bogota",
    COLOMBIA: "America/Bogota",
    EC: "America/Guayaquil",
    ECUADOR: "America/Guayaquil",
    BO: "America/La_Paz",
    BOLIVIA: "America/La_Paz",
    CL: "America/Santiago",
    CHILE: "America/Santiago",
    AR: "America/Argentina/Buenos_Aires",
    ARGENTINA: "America/Argentina/Buenos_Aires",
    UY: "America/Montevideo",
    URUGUAY: "America/Montevideo",
    PY: "America/Asuncion",
    PARAGUAY: "America/Asuncion",
    BR: "America/Sao_Paulo",
    BRASIL: "America/Sao_Paulo",
    BRAZIL: "America/Sao_Paulo",
    VE: "America/Caracas",
    VENEZUELA: "America/Caracas",
    MX: "America/Mexico_City",
    MEXICO: "America/Mexico_City",
    "MÉXICO": "America/Mexico_City",
    GT: "America/Guatemala",
    GUATEMALA: "America/Guatemala",
    SV: "America/El_Salvador",
    "EL SALVADOR": "America/El_Salvador",
    HN: "America/Tegucigalpa",
    HONDURAS: "America/Tegucigalpa",
    NI: "America/Managua",
    NICARAGUA: "America/Managua",
    CR: "America/Costa_Rica",
    "COSTA RICA": "America/Costa_Rica",
    PA: "America/Panama",
    "PANAMÁ": "America/Panama",
    PANAMA: "America/Panama",
    DO: "America/Santo_Domingo",
    "REPUBLICA DOMINICANA": "America/Santo_Domingo",
    "REPÚBLICA DOMINICANA": "America/Santo_Domingo",
    CU: "America/Havana",
    CUBA: "America/Havana",
    PR: "America/Puerto_Rico",
    "PUERTO RICO": "America/Puerto_Rico",
    ES: "Europe/Madrid",
    "ESPAÑA": "Europe/Madrid",
    ESPANA: "Europe/Madrid",
    SPAIN: "Europe/Madrid",
    US: "America/New_York",
    USA: "America/New_York",
    "ESTADOS UNIDOS": "America/New_York",
    EEUU: "America/New_York"
};

class UtilidadesController {
    async obtenerFechaHora(req, res) {
        try {
            const { pais } = req.body;

            if (!pais) {
                return res.status(400).json({ msg: "El campo pais es requerido" });
            }

            const key = String(pais).trim().toUpperCase();
            const timezone = COUNTRY_TIMEZONES[key];

            if (!timezone) {
                return res.status(404).json({
                    msg: `País '${pais}' no soportado`,
                    paises_soportados: Object.keys(COUNTRY_TIMEZONES)
                });
            }

            const ahora = new Date();
            const formatter = new Intl.DateTimeFormat("es-PE", {
                timeZone: timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                weekday: "long",
                hour12: false
            });

            const parts = formatter.formatToParts(ahora).reduce((acc, p) => {
                acc[p.type] = p.value;
                return acc;
            }, {});

            const fecha = `${parts.year}-${parts.month}-${parts.day}`;
            const hora = `${parts.hour}:${parts.minute}:${parts.second}`;

            return res.status(200).json({
                data: {
                    pais: pais,
                    timezone,
                    fecha,
                    hora,
                    dia_semana: parts.weekday,
                    fecha_hora_iso: ahora.toISOString(),
                    fecha_hora_legible: `${parts.weekday} ${parts.day}/${parts.month}/${parts.year} ${hora}`
                }
            });
        } catch (error) {
            logger.error(`[utilidades.controller.js] Error obtenerFechaHora: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener fecha y hora" });
        }
    }
}

module.exports = new UtilidadesController();
