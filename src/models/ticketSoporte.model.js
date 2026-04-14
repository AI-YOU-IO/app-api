const { pool } = require("../config/dbConnection.js");
const logger = require('../config/logger/loggerClient.js');

class TicketSoporteModel {

    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async generateNumeroTicket() {
        try {
            const now = new Date();
            const dateStr = now.getFullYear().toString() +
                (now.getMonth() + 1).toString().padStart(2, '0') +
                now.getDate().toString().padStart(2, '0');

            const [rows] = await this.connection.execute(
                `SELECT COUNT(*) as total FROM ticket_soporte WHERE DATE(fecha_registro) = CURRENT_DATE`
            );
            const count = parseInt(rows[0].total) + 1;
            return `TK-${dateStr}-${count.toString().padStart(4, '0')}`;
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al generar numero ticket: ${error.message}`);
            throw error;
        }
    }

    async create(data) {
        try {
            const {
                asunto, descripcion, id_categoria_soporte, id_prioridad_ticket,
                id_empresa, id_plataforma, id_usuario_reporta, usuario_registro,
                usuario_externo_id = null, usuario_externo_nombre = null
            } = data;

            const numero_ticket = await this.generateNumeroTicket();

            const [result] = await this.connection.execute(
                `INSERT INTO ticket_soporte
                (numero_ticket, asunto, descripcion, id_categoria_soporte, id_prioridad_ticket,
                 id_estado_ticket, id_empresa, id_plataforma, id_usuario_reporta, usuario_registro,
                 usuario_externo_id, usuario_externo_nombre)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
                [numero_ticket, asunto, descripcion, id_categoria_soporte, id_prioridad_ticket,
                 id_empresa, id_plataforma || null, id_usuario_reporta, usuario_registro,
                 usuario_externo_id, usuario_externo_nombre]
            );

            return { id: result.insertId, numero_ticket };
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al crear ticket: ${error.message}`);
            throw new Error(`Error al crear ticket: ${error.message}`);
        }
    }

    async findById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT ts.*,
                    et.nombre as estado_nombre, et.color as estado_color,
                    pt.nombre as prioridad_nombre, pt.color as prioridad_color,
                    cs.nombre as categoria_nombre, cs.color as categoria_color,
                    ur.username as reporta_username,
                    ua.username as asignado_username,
                    pl.nombre as plataforma_nombre
                FROM ticket_soporte ts
                LEFT JOIN estado_ticket et ON et.id = ts.id_estado_ticket
                LEFT JOIN prioridad_ticket pt ON pt.id = ts.id_prioridad_ticket
                LEFT JOIN categoria_soporte cs ON cs.id = ts.id_categoria_soporte
                LEFT JOIN usuario ur ON ur.id = ts.id_usuario_reporta
                LEFT JOIN usuario ua ON ua.id = ts.id_usuario_asignado
                LEFT JOIN plataforma pl ON pl.id = ts.id_plataforma
                WHERE ts.id = ? AND ts.estado_registro = 1`,
                [id]
            );

            if (!rows[0]) return null;

            // Obtener nombre de empresa según plataforma
            const ticket = rows[0];
            ticket.empresa_nombre = await this.getEmpresaNombre(ticket.id_plataforma, ticket.id_empresa);

            return ticket;
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al buscar ticket por id: ${error.message}`);
            throw new Error(`Error al buscar ticket: ${error.message}`);
        }
    }

    async getEmpresaNombre(idPlataforma, idEmpresa) {
        if (!idEmpresa) return null;
        try {
            let schema = 'public';
            if (idPlataforma === 2) schema = 'fdw_inmobiliaria';
            else if (idPlataforma === 3) schema = 'fdw_automotriz';

            const [rows] = await this.connection.execute(
                `SELECT razon_social FROM ${schema}.empresa WHERE id = ?`,
                [idEmpresa]
            );
            return rows[0]?.razon_social || null;
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al obtener empresa (plataforma ${idPlataforma}): ${error.message}`);
            return null;
        }
    }

    async findAll({ idEmpresa, userId, rolId, estado, prioridad, categoria, search, empresa, plataforma, page = 1, limit = 20 }) {
        try {
            let query = `SELECT ts.*,
                    et.nombre as estado_nombre, et.color as estado_color,
                    pt.nombre as prioridad_nombre, pt.color as prioridad_color,
                    cs.nombre as categoria_nombre, cs.color as categoria_color,
                    ur.username as reporta_username,
                    ua.username as asignado_username,
                    pl.nombre as plataforma_nombre
                FROM ticket_soporte ts
                LEFT JOIN estado_ticket et ON et.id = ts.id_estado_ticket
                LEFT JOIN prioridad_ticket pt ON pt.id = ts.id_prioridad_ticket
                LEFT JOIN categoria_soporte cs ON cs.id = ts.id_categoria_soporte
                LEFT JOIN usuario ur ON ur.id = ts.id_usuario_reporta
                LEFT JOIN usuario ua ON ua.id = ts.id_usuario_asignado
                LEFT JOIN plataforma pl ON pl.id = ts.id_plataforma
                WHERE ts.estado_registro = 1`;
            const params = [];

            // Control de acceso por rol
            if ((rolId === 1 || rolId === 2) && (idEmpresa === 0 || idEmpresa === '0')) {
                // Admin Central (rol 1 o 2 con empresa 0): ve todos los tickets
            } else if (rolId === 1) {
                // Admin: ve todos de su empresa
                query += ' AND ts.id_empresa = ?';
                params.push(idEmpresa);
            } else if (rolId === 2) {
                // Coordinador: solo los propios (creados o asignados)
                query += ' AND (ts.id_usuario_reporta = ? OR ts.id_usuario_asignado = ?)';
                params.push(userId, userId);
            } else {
                // Asesor: solo los que creo
                query += ' AND ts.id_usuario_reporta = ?';
                params.push(userId);
            }

            // Filtros opcionales
            if (estado) {
                query += ' AND ts.id_estado_ticket = ?';
                params.push(estado);
            }
            if (prioridad) {
                query += ' AND ts.id_prioridad_ticket = ?';
                params.push(prioridad);
            }
            if (categoria) {
                query += ' AND ts.id_categoria_soporte = ?';
                params.push(categoria);
            }
            if (empresa) {
                query += ' AND ts.id_empresa = ?';
                params.push(empresa);
            }
            if (plataforma) {
                query += ' AND ts.id_plataforma = ?';
                params.push(plataforma);
            }
            if (search) {
                query += ' AND (ts.numero_ticket ILIKE ? OR ts.asunto ILIKE ? OR ts.descripcion ILIKE ?)';
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam);
            }

            // Contar total
            const countQuery = query.replace(/SELECT ts\.\*[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
            const [countRows] = await this.connection.execute(countQuery, params);
            const total = parseInt(countRows[0].total);

            // Paginacion
            const offset = (page - 1) * limit;
            query += ' ORDER BY ts.fecha_registro DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const [rows] = await this.connection.execute(query, params);

            // Obtener nombres de empresa para cada ticket
            for (const ticket of rows) {
                ticket.empresa_nombre = await this.getEmpresaNombre(ticket.id_plataforma, ticket.id_empresa);
            }

            return { data: rows, total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) };
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al listar tickets: ${error.message}`);
            throw new Error(`Error al listar tickets: ${error.message}`);
        }
    }

    async findAllExterno({ idPlataforma, idEmpresa, usuarioExternoId, estado, prioridad, categoria, search, page = 1, limit = 20 }) {
        try {
            let query = `SELECT ts.*,
                    et.nombre as estado_nombre, et.color as estado_color,
                    pt.nombre as prioridad_nombre, pt.color as prioridad_color,
                    cs.nombre as categoria_nombre, cs.color as categoria_color,
                    ur.username as reporta_username,
                    ua.username as asignado_username
                FROM ticket_soporte ts
                LEFT JOIN estado_ticket et ON et.id = ts.id_estado_ticket
                LEFT JOIN prioridad_ticket pt ON pt.id = ts.id_prioridad_ticket
                LEFT JOIN categoria_soporte cs ON cs.id = ts.id_categoria_soporte
                LEFT JOIN usuario ur ON ur.id = ts.id_usuario_reporta
                LEFT JOIN usuario ua ON ua.id = ts.id_usuario_asignado
                WHERE ts.estado_registro = 1 AND ts.id_plataforma = ?`;
            const params = [idPlataforma];

            if (idEmpresa) {
                query += ' AND ts.id_empresa = ?';
                params.push(idEmpresa);
            }
            if (usuarioExternoId) {
                query += ' AND ts.usuario_externo_id = ?';
                params.push(usuarioExternoId);
            }
            if (estado) { query += ' AND ts.id_estado_ticket = ?'; params.push(estado); }
            if (prioridad) { query += ' AND ts.id_prioridad_ticket = ?'; params.push(prioridad); }
            if (categoria) { query += ' AND ts.id_categoria_soporte = ?'; params.push(categoria); }
            if (search) {
                query += ' AND (ts.numero_ticket ILIKE ? OR ts.asunto ILIKE ? OR ts.descripcion ILIKE ?)';
                const s = `%${search}%`; params.push(s, s, s);
            }

            const countQuery = query.replace(/SELECT ts\.\*[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
            const [countRows] = await this.connection.execute(countQuery, params);
            const total = parseInt(countRows[0].total);

            const offset = (page - 1) * limit;
            query += ' ORDER BY ts.fecha_registro DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const [rows] = await this.connection.execute(query, params);

            // Obtener nombres de empresa para cada ticket
            for (const ticket of rows) {
                ticket.empresa_nombre = await this.getEmpresaNombre(ticket.id_plataforma, ticket.id_empresa);
            }

            return { data: rows, total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) };
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al listar tickets externo: ${error.message}`);
            throw new Error(`Error al listar tickets externo: ${error.message}`);
        }
    }

    async update(id, data) {
        try {
            const allowedFields = ['asunto', 'descripcion', 'id_categoria_soporte', 'id_prioridad_ticket',
                'id_estado_ticket', 'id_usuario_asignado', 'fecha_vencimiento', 'usuario_actualizacion'];
            const fields = [];
            const values = [];

            for (const [key, value] of Object.entries(data)) {
                if (allowedFields.includes(key)) {
                    fields.push(`${key} = ?`);
                    values.push(value ?? null);
                }
            }

            if (fields.length === 0) {
                throw new Error('No se proporcionaron campos validos para actualizar');
            }

            fields.push('fecha_actualizacion = CURRENT_TIMESTAMP');
            values.push(id);

            const [result] = await this.connection.execute(
                `UPDATE ticket_soporte SET ${fields.join(', ')} WHERE id = ? AND estado_registro = 1`,
                values
            );

            return result.affectedRows > 0;
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al actualizar ticket: ${error.message}`);
            throw new Error(`Error al actualizar ticket: ${error.message}`);
        }
    }

    async updateEstado(id, nuevoEstadoId, userId) {
        try {
            // Obtener estado actual
            const ticket = await this.findById(id);
            if (!ticket) throw new Error('Ticket no encontrado');

            const estadoAnterior = ticket.id_estado_ticket;

            // Actualizar estado
            await this.connection.execute(
                `UPDATE ticket_soporte SET id_estado_ticket = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
                [nuevoEstadoId, userId, id]
            );

            // Si es resuelto o cerrado, registrar fecha_resolucion
            const [estadoRows] = await this.connection.execute('SELECT es_final FROM estado_ticket WHERE id = ?', [nuevoEstadoId]);
            if (estadoRows[0]?.es_final) {
                await this.connection.execute(
                    `UPDATE ticket_soporte SET fecha_resolucion = CURRENT_TIMESTAMP WHERE id = ? AND fecha_resolucion IS NULL`,
                    [id]
                );
            }

            return { estadoAnterior, estadoNuevo: nuevoEstadoId };
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al actualizar estado: ${error.message}`);
            throw new Error(`Error al actualizar estado: ${error.message}`);
        }
    }

    async assignUser(id, nuevoUsuarioId, userId) {
        try {
            const ticket = await this.findById(id);
            if (!ticket) throw new Error('Ticket no encontrado');

            const usuarioAnterior = ticket.id_usuario_asignado;

            await this.connection.execute(
                `UPDATE ticket_soporte SET id_usuario_asignado = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
                [nuevoUsuarioId, userId, id]
            );

            return { usuarioAnterior, usuarioNuevo: nuevoUsuarioId };
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al asignar usuario: ${error.message}`);
            throw new Error(`Error al asignar usuario: ${error.message}`);
        }
    }

    async getStats({ idEmpresa, userId, rolId }) {
        try {
            let query = `SELECT et.id, et.nombre, et.color, COUNT(ts.id) as total
                FROM estado_ticket et
                LEFT JOIN ticket_soporte ts ON ts.id_estado_ticket = et.id AND ts.estado_registro = 1`;
            const params = [];

            if ((rolId === 1 || rolId === 2) && (idEmpresa === 0 || idEmpresa === '0')) {
                // Admin Central (rol 1 o 2 con empresa 0): ve todos
            } else if (rolId === 1) {
                query += ' AND ts.id_empresa = ?';
                params.push(idEmpresa);
            } else if (rolId === 2) {
                query += ' AND (ts.id_usuario_reporta = ? OR ts.id_usuario_asignado = ?)';
                params.push(userId, userId);
            } else {
                query += ' AND ts.id_usuario_reporta = ?';
                params.push(userId);
            }

            query += ' WHERE et.estado_registro = 1 GROUP BY et.id, et.nombre, et.color ORDER BY et.orden';

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al obtener stats: ${error.message}`);
            throw new Error(`Error al obtener stats: ${error.message}`);
        }
    }

    async getCatalogos() {
        try {
            const [estados] = await this.connection.execute('SELECT * FROM estado_ticket WHERE estado_registro = 1 ORDER BY orden');
            const [prioridades] = await this.connection.execute('SELECT * FROM prioridad_ticket WHERE estado_registro = 1 ORDER BY nivel');
            const [categorias] = await this.connection.execute('SELECT * FROM categoria_soporte WHERE estado_registro = 1 ORDER BY orden');
            return { estados, prioridades, categorias };
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al obtener catalogos: ${error.message}`);
            throw new Error(`Error al obtener catalogos: ${error.message}`);
        }
    }

    async getEmpresas() {
        try {
            const [rows] = await this.connection.execute(
                'SELECT id, razon_social FROM empresa WHERE estado_registro = 1 ORDER BY razon_social'
            );
            return rows;
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al obtener empresas: ${error.message}`);
            throw new Error(`Error al obtener empresas: ${error.message}`);
        }
    }

    async getPlataformas() {
        try {
            const [rows] = await this.connection.execute(
                'SELECT id, nombre FROM plataforma WHERE estado_registro = 1 ORDER BY nombre'
            );
            return rows;
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al obtener plataformas: ${error.message}`);
            throw new Error(`Error al obtener plataformas: ${error.message}`);
        }
    }

    async getUsuariosByEmpresa(idEmpresa) {
        try {
            // Solo superadmins (rol=1, empresa=0) pueden ser asignados
            const query = 'SELECT id, username FROM usuario WHERE estado_registro = 1 AND id_rol = 1 AND (id_empresa = 0 OR id_empresa IS NULL) ORDER BY username';
            const [rows] = await this.connection.execute(query, []);
            return rows;
        } catch (error) {
            logger.error(`[ticketSoporte.model.js] Error al obtener usuarios: ${error.message}`);
            throw new Error(`Error al obtener usuarios: ${error.message}`);
        }
    }
}

module.exports = TicketSoporteModel;
