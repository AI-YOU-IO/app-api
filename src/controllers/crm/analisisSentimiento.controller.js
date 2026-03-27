const { pool } = require("../../config/dbConnection.js");
const AnalisisLlamadaModel = require("../../models/analisisLlamada.model.js");
const AnalisisSentimientoModel = require("../../models/analisisSentimiento.model.js");
const PreguntaFrecuenteAnalisisModel = require("../../models/preguntaFrecuenteAnalisis.model.js");
const logger = require('../../config/logger/loggerClient.js');

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const EMOTION_COLORS = {
    frustracion: '#dc2626', enojo: '#f43f5e', confusion: '#f59e0b', ansiedad: '#fb923c',
    desconfianza: '#a855f7', decepcion: '#6366f1', satisfaccion: '#10b981', gratitud: '#06b6d4',
    entusiasmo: '#22c55e', curiosidad: '#3b82f6', confianza: '#0ea5e9', calma: '#94a3b8',
    indiferencia: '#cbd5e1', neutral: '#94a3b8'
};

class AnalisisSentimientoController {

    async getByLlamada(req, res) {
        try {
            const { idLlamada } = req.params;
            const analisisModel = new AnalisisLlamadaModel();
            const sentimientoModel = new AnalisisSentimientoModel();
            const preguntaModel = new PreguntaFrecuenteAnalisisModel();

            const [analisis, sentimiento, preguntas] = await Promise.all([
                analisisModel.getByLlamada(idLlamada),
                sentimientoModel.getByLlamada(idLlamada),
                preguntaModel.getByLlamada(idLlamada)
            ]);

            return res.status(200).json({
                data: { analisis, sentimiento, preguntas }
            });
        } catch (error) {
            logger.error(`[analisisSentimiento.controller] Error getByLlamada: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener análisis de llamada" });
        }
    }

    async getByChat(req, res) {
        try {
            const { idChat } = req.params;
            const analisisModel = new AnalisisLlamadaModel();
            const sentimientoModel = new AnalisisSentimientoModel();
            const preguntaModel = new PreguntaFrecuenteAnalisisModel();

            const [analisis, sentimiento, preguntas] = await Promise.all([
                analisisModel.getByChat(idChat),
                sentimientoModel.getByChat(idChat),
                preguntaModel.getByChat(idChat)
            ]);

            return res.status(200).json({
                data: { analisis, sentimiento, preguntas }
            });
        } catch (error) {
            logger.error(`[analisisSentimiento.controller] Error getByChat: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener análisis de chat" });
        }
    }

    async getDashboard(req, res) {
        try {
            const { idEmpresa } = req.user;

            // --- TAB 1: Conversación ---
            // Conversaciones por hora del día
            const [convPorHoraRows] = await pool.execute(
                `SELECT EXTRACT(HOUR FROM l.fecha_inicio) as hora, COUNT(*) as value
                FROM llamada l
                INNER JOIN analisis_llamada al2 ON al2.id_llamada = l.id AND al2.estado_registro = 1
                WHERE l.id_empresa = ? AND l.estado_registro = 1 AND l.fecha_inicio IS NOT NULL
                GROUP BY hora ORDER BY hora`,
                [idEmpresa]
            );
            const convPorHora = convPorHoraRows.map(r => ({
                hora: `${parseInt(r.hora)}:00`,
                value: parseInt(r.value)
            }));

            // FCR donut
            const [fcrRows] = await pool.execute(
                `SELECT
                    COUNT(*) FILTER (WHERE fcr = true) as resueltas,
                    COUNT(*) FILTER (WHERE fcr = false) as no_resueltas,
                    COUNT(*) as total
                FROM analisis_llamada
                WHERE id_empresa = ? AND estado_registro = 1`,
                [idEmpresa]
            );
            const fcrData = fcrRows[0] || { resueltas: 0, no_resueltas: 0, total: 0 };
            const fcrPct = fcrData.total > 0 ? Math.round((parseInt(fcrData.resueltas) / parseInt(fcrData.total)) * 100) : 0;
            const fcr = {
                donut: [
                    { name: 'Resueltas', value: fcrPct, color: '#6366f1' },
                    { name: 'No resueltas', value: 100 - fcrPct, color: '#94a3b8' }
                ],
                porcentaje: fcrPct,
                total: parseInt(fcrData.total)
            };

            // Evolución FCR mensual (año actual)
            const [evoFcrRows] = await pool.execute(
                `SELECT EXTRACT(MONTH FROM fecha_registro) as mes,
                    COUNT(*) FILTER (WHERE fcr = true) as resueltas,
                    COUNT(*) as total
                FROM analisis_llamada
                WHERE id_empresa = ? AND estado_registro = 1
                    AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE)
                GROUP BY mes ORDER BY mes`,
                [idEmpresa]
            );
            const evoFcr = MESES.map((nombre, i) => {
                const row = evoFcrRows.find(r => parseInt(r.mes) === i + 1);
                const pct = row && parseInt(row.total) > 0 ? Math.round((parseInt(row.resueltas) / parseInt(row.total)) * 100) : 0;
                return { mes: nombre, value: pct };
            });

            // --- TAB 2: Sentimiento ---
            // Distribución sentimiento donut
            const [sentRows] = await pool.execute(
                `SELECT sentimiento, COUNT(*) as total
                FROM analisis_sentimiento
                WHERE id_empresa = ? AND estado_registro = 1
                GROUP BY sentimiento`,
                [idEmpresa]
            );
            const totalSent = sentRows.reduce((acc, r) => acc + parseInt(r.total), 0);
            const getSentPct = (tipo) => {
                const row = sentRows.find(r => r.sentimiento === tipo);
                return row && totalSent > 0 ? Math.round((parseInt(row.total) / totalSent) * 100) : 0;
            };
            const sentimiento = {
                donut: [
                    { name: 'Positivo', value: getSentPct('positivo'), color: '#10b981' },
                    { name: 'Negativo', value: getSentPct('negativo'), color: '#f43f5e' },
                    { name: 'Neutro', value: getSentPct('neutro'), color: '#94a3b8' }
                ],
                totales: {
                    positivo: parseInt(sentRows.find(r => r.sentimiento === 'positivo')?.total || 0),
                    negativo: parseInt(sentRows.find(r => r.sentimiento === 'negativo')?.total || 0),
                    neutro: parseInt(sentRows.find(r => r.sentimiento === 'neutro')?.total || 0)
                }
            };

            // Evolución sentimiento mensual
            const [evoSentRows] = await pool.execute(
                `SELECT EXTRACT(MONTH FROM fecha_registro) as mes, sentimiento, COUNT(*) as total
                FROM analisis_sentimiento
                WHERE id_empresa = ? AND estado_registro = 1
                    AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE)
                GROUP BY mes, sentimiento ORDER BY mes`,
                [idEmpresa]
            );
            const evoSentimiento = MESES.map((nombre, i) => {
                const mesRows = evoSentRows.filter(r => parseInt(r.mes) === i + 1);
                return {
                    mes: nombre,
                    Positivo: parseInt(mesRows.find(r => r.sentimiento === 'positivo')?.total || 0),
                    Negativo: parseInt(mesRows.find(r => r.sentimiento === 'negativo')?.total || 0),
                    Neutro: parseInt(mesRows.find(r => r.sentimiento === 'neutro')?.total || 0)
                };
            });

            // Emociones distribución
            const [emocionRows] = await pool.execute(
                `SELECT emocion_principal, COUNT(*) as total
                FROM analisis_sentimiento
                WHERE id_empresa = ? AND estado_registro = 1 AND emocion_principal IS NOT NULL
                GROUP BY emocion_principal ORDER BY total DESC`,
                [idEmpresa]
            );
            const emociones = emocionRows.map(r => ({
                name: r.emocion_principal.charAt(0).toUpperCase() + r.emocion_principal.slice(1),
                value: parseInt(r.total),
                color: EMOTION_COLORS[r.emocion_principal] || '#94a3b8'
            }));

            // Evolución emociones mensual
            const [evoEmoRows] = await pool.execute(
                `SELECT EXTRACT(MONTH FROM fecha_registro) as mes, emocion_principal, COUNT(*) as total
                FROM analisis_sentimiento
                WHERE id_empresa = ? AND estado_registro = 1 AND emocion_principal IS NOT NULL
                    AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE)
                GROUP BY mes, emocion_principal ORDER BY mes`,
                [idEmpresa]
            );
            const emocionesUnicas = [...new Set(emocionRows.map(r => r.emocion_principal))];
            const evoEmociones = MESES.map((nombre, i) => {
                const mesRows = evoEmoRows.filter(r => parseInt(r.mes) === i + 1);
                const obj = { mes: nombre };
                emocionesUnicas.forEach(e => {
                    const label = e.charAt(0).toUpperCase() + e.slice(1);
                    obj[label] = parseInt(mesRows.find(r => r.emocion_principal === e)?.total || 0);
                });
                return obj;
            });

            // --- TAB 3: Preguntas frecuentes ---
            const preguntaModel = new PreguntaFrecuenteAnalisisModel();
            const [preguntas, temas, palabras] = await Promise.all([
                preguntaModel.getDashboard(idEmpresa, 'pregunta', 8),
                preguntaModel.getDashboard(idEmpresa, 'tema', 8),
                preguntaModel.getDashboard(idEmpresa, 'palabra', 20)
            ]);

            return res.status(200).json({
                data: {
                    // Tab Conversación
                    convPorHora,
                    fcr,
                    evoFcr,
                    // Tab Sentimiento
                    sentimiento,
                    evoSentimiento,
                    emociones,
                    evoEmociones,
                    // Tab Preguntas frecuentes
                    preguntas: preguntas.map(p => ({ pregunta: p.contenido, value: parseInt(p.total) })),
                    temas: temas.map(t => ({ tema: t.contenido, value: parseInt(t.total) })),
                    palabras: palabras.map(p => ({ text: p.contenido, size: parseInt(p.total) }))
                }
            });
        } catch (error) {
            logger.error(`[analisisSentimiento.controller] Error getDashboard: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener dashboard de análisis" });
        }
    }
}

module.exports = new AnalisisSentimientoController();
