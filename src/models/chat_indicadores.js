/**
 * ============================================================
 * CHAT INDICADORES MODEL
 * ============================================================
 *
 * Calcula todos los indicadores del módulo de chat/mensajes.
 *
 * Consulta directamente las tablas: chat, mensaje, persona
 *
 * Endpoint final:
 * GET /crm/chat-indicadores
 *
 * Parámetros opcionales:
 * empresa, fecha_inicio, fecha_fin
 * ============================================================
 */

const { pool } = require("../config/dbConnection");

async function getChatIndicadores({ empresa, fecha_inicio, fecha_fin }) {

    // ─── 1. Filtros SQL ───
    const params = [];
    let whereChat = "WHERE c.estado_registro = 1";
    let whereMsg = "WHERE m.estado_registro = 1";
    let paramIndex = 0;

    if (empresa && empresa !== "all") {
        paramIndex++;
        whereChat += ` AND c.id_empresa = ?`;
        params.push(empresa);
    }

    if (fecha_inicio && fecha_fin) {
        whereChat += ` AND DATE(c.fecha_registro) BETWEEN ? AND ?`;
        whereMsg += ` AND DATE(m.fecha_hora) BETWEEN ? AND ?`;
        params.push(fecha_inicio, fecha_fin);
    }

    // ─── 2. Total chats ───
    const chatParams = empresa && empresa !== "all" ? [empresa] : [];
    if (fecha_inicio && fecha_fin) chatParams.push(fecha_inicio, fecha_fin);

    const [chats] = await pool.execute(
        `SELECT COUNT(*) as total FROM chat c ${whereChat}`,
        chatParams
    );
    const totalChats = parseInt(chats[0].total);

    // ─── 3. Chats con bot activo vs inactivo ───
    const [botStats] = await pool.execute(
        `SELECT
            COALESCE(c.bot_activo, 1) as bot_activo,
            COUNT(*) as total
         FROM chat c ${whereChat}
         GROUP BY COALESCE(c.bot_activo, 1)`,
        chatParams
    );

    const botActivo = parseInt(botStats.find(r => r.bot_activo === 1)?.total || 0);
    const botInactivo = parseInt(botStats.find(r => r.bot_activo === 0)?.total || 0);

    // ─── 4. Obtener todos los mensajes ───
    const msgParams = [];
    let msgWhere = "WHERE m.estado_registro = 1";

    if (empresa && empresa !== "all") {
        msgWhere += ` AND c.id_empresa = ?`;
        msgParams.push(empresa);
    }
    if (fecha_inicio && fecha_fin) {
        msgWhere += ` AND DATE(m.fecha_hora) BETWEEN ? AND ?`;
        msgParams.push(fecha_inicio, fecha_fin);
    }

    const [mensajes] = await pool.execute(
        `SELECT
            m.id,
            m.direccion,
            m.tipo_mensaje,
            m.fecha_hora,
            m.id_chat,
            c.id_empresa,
            c.bot_activo
         FROM mensaje m
         INNER JOIN chat c ON c.id = m.id_chat
         ${msgWhere}
         ORDER BY m.fecha_hora DESC`,
        msgParams
    );

    const totalMensajes = mensajes.length;

    // ─── 5. Mensajes por dirección ───
    const entrantes = mensajes.filter(m => m.direccion === 'in').length;
    const salientes = mensajes.filter(m => m.direccion === 'out').length;

    // ─── 6. Mensajes por tipo (normalizado) ───
    const TIPO_NORMALIZE = {
        'text': 'Texto',
        'texto': 'Texto',
        'image': 'Imagen',
        'audio': 'Audio',
        'video': 'Video',
        'document': 'Documento',
        'sticker': 'Sticker',
        'location': 'Ubicación',
        'contacts': 'Contacto',
        'unsupported': null, // excluir
    };
    const tipoMap = {};
    mensajes.forEach(m => {
        const raw = (m.tipo_mensaje || '').toLowerCase();
        const mapped = TIPO_NORMALIZE[raw];
        if (mapped === null) return; // excluir unsupported
        const tipo = mapped || m.tipo_mensaje || 'Otro';
        tipoMap[tipo] = (tipoMap[tipo] || 0) + 1;
    });
    const mensajesPorTipo = Object.entries(tipoMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    // ─── 7. Mensajes por día ───
    const dailyMap = {};
    mensajes.forEach(m => {
        if (!m.fecha_hora) return;
        const day = new Date(m.fecha_hora).toISOString().slice(0, 10);
        if (!dailyMap[day]) {
            dailyMap[day] = { day, entrantes: 0, salientes: 0, total: 0 };
        }
        dailyMap[day].total++;
        if (m.direccion === 'in') dailyMap[day].entrantes++;
        else dailyMap[day].salientes++;
    });
    const daily = Object.values(dailyMap).sort((a, b) => a.day.localeCompare(b.day));

    // ─── 8. Mensajes por hora ───
    const hourlyMap = {};
    for (let h = 0; h < 24; h++) {
        hourlyMap[h] = {
            hour: `${String(h).padStart(2, '0')}:00`,
            entrantes: 0,
            salientes: 0,
            total: 0
        };
    }
    mensajes.forEach(m => {
        if (!m.fecha_hora) return;
        const h = new Date(m.fecha_hora).getHours();
        hourlyMap[h].total++;
        if (m.direccion === 'in') hourlyMap[h].entrantes++;
        else hourlyMap[h].salientes++;
    });
    const hourly = Object.values(hourlyMap).filter(h => h.total > 0);

    // ─── 9. Mensajes por día de semana ───
    const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const weeklyMap = {};
    DAYS.forEach((d, i) => {
        weeklyMap[i] = { day: d, entrantes: 0, salientes: 0, total: 0 };
    });
    mensajes.forEach(m => {
        if (!m.fecha_hora) return;
        let dow = new Date(m.fecha_hora).getDay();
        dow = dow === 0 ? 6 : dow - 1;
        weeklyMap[dow].total++;
        if (m.direccion === 'in') weeklyMap[dow].entrantes++;
        else weeklyMap[dow].salientes++;
    });
    const weekly = Object.values(weeklyMap);

    // ─── 10. Heatmap día x hora ───
    const HOURS = [
        "06","07","08","09","10","11","12",
        "13","14","15","16","17","18","19",
        "20","21","22","23"
    ];
    const heatmap = Array.from({ length: 7 }, () => Array(HOURS.length).fill(0));
    mensajes.forEach(m => {
        if (!m.fecha_hora) return;
        const date = new Date(m.fecha_hora);
        let dow = date.getDay();
        dow = dow === 0 ? 6 : dow - 1;
        const hour = String(date.getHours()).padStart(2, "0");
        const hi = HOURS.indexOf(hour);
        if (hi >= 0 && dow >= 0 && dow < 7) {
            heatmap[dow][hi]++;
        }
    });

    // ─── 11. Chats por día (nuevos) ───
    const [chatsByDay] = await pool.execute(
        `SELECT TO_CHAR(DATE(c.fecha_registro), 'YYYY-MM-DD') as day, COUNT(*) as total
         FROM chat c ${whereChat}
         GROUP BY DATE(c.fecha_registro)
         ORDER BY DATE(c.fecha_registro) DESC
         LIMIT 30`,
        chatParams
    );

    // ─── 12. Promedio mensajes por chat ───
    const chatsConMensajes = new Set(mensajes.map(m => m.id_chat)).size;
    const promedioMsgPorChat = chatsConMensajes > 0
        ? Math.round(totalMensajes / chatsConMensajes * 10) / 10
        : 0;

    // ─── 13. Tasa de respuesta (chats con al menos 1 mensaje in y 1 out) ───
    const chatDirecciones = {};
    mensajes.forEach(m => {
        if (!chatDirecciones[m.id_chat]) chatDirecciones[m.id_chat] = new Set();
        chatDirecciones[m.id_chat].add(m.direccion);
    });
    const chatsConRespuesta = Object.values(chatDirecciones).filter(s => s.has('in') && s.has('out')).length;
    const tasaRespuesta = chatsConMensajes > 0
        ? Math.round(chatsConRespuesta / chatsConMensajes * 1000) / 10
        : 0;

    // ─── 14. Respuesta final ───
    return {
        totalChats,
        totalMensajes,
        entrantes,
        salientes,
        botActivo,
        botInactivo,
        chatsConMensajes,
        promedioMsgPorChat,
        tasaRespuesta,
        mensajesPorTipo,
        daily,
        hourly,
        weekly,
        heatmap,
        heatmapHours: HOURS,
        heatmapDays: DAYS,
        chatsByDay: chatsByDay.reverse()
    };
}

module.exports = { getChatIndicadores };
