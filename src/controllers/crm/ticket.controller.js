const TicketSoporteModel = require("../../models/ticketSoporte.model.js");
const TicketComentarioModel = require("../../models/ticketComentario.model.js");
const TicketAdjuntoModel = require("../../models/ticketAdjunto.model.js");
const TicketHistorialModel = require("../../models/ticketHistorial.model.js");
const TicketParticipanteModel = require("../../models/ticketParticipante.model.js");
const TicketComentarioLecturaModel = require("../../models/ticketComentarioLectura.model.js");
const s3Service = require('../../services/s3.service.js');
const logger = require('../../config/logger/loggerClient.js');

// Verificar si el usuario puede acceder a un ticket especifico
function canAccessTicket(ticket, user) {
    const { userId, rolId, idEmpresa } = user;
    // Admin Central (rol 1 o 2 con empresa 0) puede ver todos los tickets
    if ((rolId === 1 || rolId === 2) && (idEmpresa === 0 || idEmpresa === '0')) return true;
    if (rolId === 1 && ticket.id_empresa == idEmpresa) return true; // Admin misma empresa
    if (rolId === 2 && (ticket.id_usuario_reporta == userId || ticket.id_usuario_asignado == userId)) return true; // Coordinador
    if (ticket.id_usuario_reporta == userId) return true; // Creador del ticket
    return false;
}

class TicketController {

    async getCatalogos(req, res) {
        try {
            const { rolId, idEmpresa } = req.user;
            const ticketModel = new TicketSoporteModel();
            const catalogos = await ticketModel.getCatalogos();

            // Admin Central (rol 1 o 2 con empresa 0) recibe empresas y plataformas
            if ((rolId === 1 || rolId === 2) && (idEmpresa === 0 || idEmpresa === '0')) {
                catalogos.empresas = await ticketModel.getEmpresas();
                catalogos.plataformas = await ticketModel.getPlataformas();
            }

            return res.status(200).json({ data: catalogos });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al obtener catalogos: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener catalogos" });
        }
    }

    async getStats(req, res) {
        try {
            const { userId, rolId, idEmpresa } = req.user;
            const ticketModel = new TicketSoporteModel();
            const stats = await ticketModel.getStats({ idEmpresa, userId, rolId });
            return res.status(200).json({ data: stats });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al obtener stats: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener estadisticas" });
        }
    }

    async getAll(req, res) {
        try {
            const { userId, rolId, idEmpresa } = req.user;
            const { estado, prioridad, categoria, search, empresa, plataforma, page = 1, limit = 20 } = req.query;

            const ticketModel = new TicketSoporteModel();
            const result = await ticketModel.findAll({
                idEmpresa, userId, rolId,
                estado, prioridad, categoria, search, empresa, plataforma,
                page: parseInt(page), limit: parseInt(limit)
            });

            return res.status(200).json({ data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al obtener tickets: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener tickets" });
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const ticketModel = new TicketSoporteModel();
            const ticket = await ticketModel.findById(id);

            if (!ticket) {
                return res.status(404).json({ msg: "Ticket no encontrado" });
            }

            if (!canAccessTicket(ticket, req.user)) {
                return res.status(403).json({ msg: "No tiene permisos para ver este ticket" });
            }

            return res.status(200).json({ data: ticket });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al obtener ticket: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener ticket" });
        }
    }

    async create(req, res) {
        try {
            const { userId, idEmpresa } = req.user;
            const { asunto, descripcion, id_categoria_soporte, id_prioridad_ticket, id_plataforma } = req.body;

            if (!asunto || !descripcion || !id_categoria_soporte || !id_prioridad_ticket) {
                return res.status(400).json({ msg: "Los campos asunto, descripcion, categoria y prioridad son requeridos" });
            }

            const ticketModel = new TicketSoporteModel();
            const historialModel = new TicketHistorialModel();

            const { id, numero_ticket } = await ticketModel.create({
                asunto, descripcion, id_categoria_soporte, id_prioridad_ticket,
                id_empresa: idEmpresa, id_plataforma: id_plataforma || 1,
                id_usuario_reporta: userId, usuario_registro: userId
            });

            // Registrar en historial
            await historialModel.create({
                id_ticket_soporte: id,
                id_estado_anterior: null,
                id_estado_nuevo: 1,
                id_usuario: userId,
                comentario: 'Ticket creado'
            });

            return res.status(201).json({ msg: "Ticket creado exitosamente", data: { id, numero_ticket } });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al crear ticket: ${error.message}`);
            return res.status(500).json({ msg: "Error al crear ticket" });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const { userId } = req.user;

            const ticketModel = new TicketSoporteModel();
            const ticket = await ticketModel.findById(id);

            if (!ticket) {
                return res.status(404).json({ msg: "Ticket no encontrado" });
            }

            if (!canAccessTicket(ticket, req.user)) {
                return res.status(403).json({ msg: "No tiene permisos para actualizar este ticket" });
            }

            const updated = await ticketModel.update(id, { ...req.body, usuario_actualizacion: userId });

            if (!updated) {
                return res.status(404).json({ msg: "No se pudo actualizar el ticket" });
            }

            return res.status(200).json({ msg: "Ticket actualizado exitosamente" });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al actualizar ticket: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar ticket" });
        }
    }

    async updateEstado(req, res) {
        try {
            const { id } = req.params;
            const { userId, rolId, idEmpresa } = req.user;
            const { id_estado_ticket, comentario } = req.body;

            if (!id_estado_ticket) {
                return res.status(400).json({ msg: "El campo id_estado_ticket es requerido" });
            }

            const ticketModel = new TicketSoporteModel();
            const historialModel = new TicketHistorialModel();
            const ticket = await ticketModel.findById(id);

            if (!ticket) {
                return res.status(404).json({ msg: "Ticket no encontrado" });
            }

            if (!canAccessTicket(ticket, req.user)) {
                return res.status(403).json({ msg: "No tiene permisos para cambiar el estado" });
            }

            // Solo superadmin puede cambiar estado
            if (!(rolId === 1 && (idEmpresa === 0 || idEmpresa === '0'))) {
                return res.status(403).json({ msg: "No tiene permisos para cambiar el estado" });
            }

            const { estadoAnterior, estadoNuevo } = await ticketModel.updateEstado(id, id_estado_ticket, userId);

            await historialModel.create({
                id_ticket_soporte: id,
                id_estado_anterior: estadoAnterior,
                id_estado_nuevo: estadoNuevo,
                id_usuario: userId,
                comentario: comentario || null
            });

            return res.status(200).json({ msg: "Estado actualizado exitosamente" });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al actualizar estado: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar estado" });
        }
    }

    async assignUser(req, res) {
        try {
            const { id } = req.params;
            const { userId, rolId, idEmpresa } = req.user;
            const { id_usuario_asignado } = req.body;

            // Solo superadmin puede asignar
            if (!(rolId === 1 && (idEmpresa === 0 || idEmpresa === '0'))) {
                return res.status(403).json({ msg: "No tiene permisos para asignar tickets" });
            }

            if (!id_usuario_asignado) {
                return res.status(400).json({ msg: "El campo id_usuario_asignado es requerido" });
            }

            const ticketModel = new TicketSoporteModel();
            const historialModel = new TicketHistorialModel();
            const ticket = await ticketModel.findById(id);

            if (!ticket) {
                return res.status(404).json({ msg: "Ticket no encontrado" });
            }

            if (!canAccessTicket(ticket, req.user)) {
                return res.status(403).json({ msg: "No tiene permisos" });
            }

            const { usuarioAnterior, usuarioNuevo } = await ticketModel.assignUser(id, id_usuario_asignado, userId);

            await historialModel.create({
                id_ticket_soporte: id,
                id_estado_anterior: ticket.id_estado_ticket,
                id_estado_nuevo: ticket.id_estado_ticket,
                id_usuario_anterior: usuarioAnterior,
                id_usuario_nuevo: usuarioNuevo,
                id_usuario: userId,
                comentario: 'Usuario asignado'
            });

            return res.status(200).json({ msg: "Usuario asignado exitosamente" });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al asignar usuario: ${error.message}`);
            return res.status(500).json({ msg: "Error al asignar usuario" });
        }
    }

    async getComentarios(req, res) {
        try {
            const { id } = req.params;
            const { rolId, idEmpresa } = req.user;

            const ticketModel = new TicketSoporteModel();
            const ticket = await ticketModel.findById(id);

            if (!ticket) {
                return res.status(404).json({ msg: "Ticket no encontrado" });
            }

            if (!canAccessTicket(ticket, req.user)) {
                return res.status(403).json({ msg: "No tiene permisos" });
            }

            const comentarioModel = new TicketComentarioModel();
            const adjuntoModel = new TicketAdjuntoModel();

            const isSuperAdmin = rolId === 1 && (idEmpresa === 0 || idEmpresa === '0');
            const comentarios = await comentarioModel.findByTicket(id, isSuperAdmin);

            // Agregar adjuntos a cada comentario
            for (const comentario of comentarios) {
                comentario.adjuntos = await adjuntoModel.findByComentario(comentario.id);
            }

            return res.status(200).json({ data: comentarios });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al obtener comentarios: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener comentarios" });
        }
    }

    async createComentario(req, res) {
        try {
            const { id } = req.params;
            const { userId, rolId, idEmpresa } = req.user;
            const { contenido, es_interno } = req.body;

            if (!contenido && (!req.files || req.files.length === 0)) {
                return res.status(400).json({ msg: "Debe proporcionar contenido o archivos adjuntos" });
            }

            const ticketModel = new TicketSoporteModel();
            const ticket = await ticketModel.findById(id);

            if (!ticket) {
                return res.status(404).json({ msg: "Ticket no encontrado" });
            }

            if (!canAccessTicket(ticket, req.user)) {
                return res.status(403).json({ msg: "No tiene permisos" });
            }

            // Solo superadmin puede crear notas internas
            const isSuperAdmin = rolId === 1 && (idEmpresa === 0 || idEmpresa === '0');
            const esInterno = (isSuperAdmin && es_interno === 'true') ? true : false;
            const esRespuestaAgente = isSuperAdmin;

            const comentarioModel = new TicketComentarioModel();
            const adjuntoModel = new TicketAdjuntoModel();

            const comentarioId = await comentarioModel.create({
                id_ticket_soporte: id,
                contenido: contenido || '',
                es_interno: esInterno,
                es_respuesta_agente: esRespuestaAgente,
                id_usuario: userId,
                usuario_registro: userId
            });

            // Subir archivos adjuntos si existen
            const adjuntos = [];
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    const ruta = await s3Service.uploadFile(file, 'tickets', idEmpresa);
                    const adjuntoId = await adjuntoModel.create({
                        id_ticket_soporte: id,
                        id_ticket_comentario: comentarioId,
                        nombre_archivo: file.filename || file.originalname,
                        nombre_original: file.originalname,
                        tipo_archivo: file.mimetype,
                        ruta_archivo: ruta,
                        id_usuario: userId,
                        usuario_registro: userId
                    });
                    adjuntos.push({ id: adjuntoId, nombre_original: file.originalname, ruta_archivo: ruta, tipo_archivo: file.mimetype });
                }
            }

            // Actualizar fecha_primera_respuesta si es primera respuesta de agente
            if (esRespuestaAgente && !ticket.fecha_primera_respuesta) {
                await ticketModel.update(id, { usuario_actualizacion: userId });
                await ticketModel.connection.execute(
                    'UPDATE ticket_soporte SET fecha_primera_respuesta = CURRENT_TIMESTAMP WHERE id = ? AND fecha_primera_respuesta IS NULL',
                    [id]
                );
            }

            return res.status(201).json({
                msg: "Comentario creado exitosamente",
                data: { id: comentarioId, contenido, es_interno: esInterno, adjuntos }
            });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al crear comentario: ${error.message}`);
            return res.status(500).json({ msg: "Error al crear comentario" });
        }
    }

    async uploadAdjunto(req, res) {
        try {
            const { id } = req.params;
            const { userId, idEmpresa } = req.user;

            if (!req.file) {
                return res.status(400).json({ msg: "No se proporciono ningun archivo" });
            }

            const ticketModel = new TicketSoporteModel();
            const ticket = await ticketModel.findById(id);

            if (!ticket) {
                return res.status(404).json({ msg: "Ticket no encontrado" });
            }

            if (!canAccessTicket(ticket, req.user)) {
                return res.status(403).json({ msg: "No tiene permisos" });
            }

            const ruta = await s3Service.uploadFile(req.file, 'tickets', idEmpresa);
            const adjuntoModel = new TicketAdjuntoModel();

            const adjuntoId = await adjuntoModel.create({
                id_ticket_soporte: id,
                nombre_archivo: req.file.filename || req.file.originalname,
                nombre_original: req.file.originalname,
                tipo_archivo: req.file.mimetype,
                ruta_archivo: ruta,
                id_usuario: userId,
                usuario_registro: userId
            });

            return res.status(201).json({
                msg: "Archivo subido exitosamente",
                data: { id: adjuntoId, nombre_original: req.file.originalname, ruta_archivo: ruta, tipo_archivo: req.file.mimetype }
            });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al subir adjunto: ${error.message}`);
            return res.status(500).json({ msg: "Error al subir archivo" });
        }
    }

    async getHistorial(req, res) {
        try {
            const { id } = req.params;

            const ticketModel = new TicketSoporteModel();
            const ticket = await ticketModel.findById(id);

            if (!ticket) {
                return res.status(404).json({ msg: "Ticket no encontrado" });
            }

            if (!canAccessTicket(ticket, req.user)) {
                return res.status(403).json({ msg: "No tiene permisos" });
            }

            const historialModel = new TicketHistorialModel();
            const historial = await historialModel.findByTicket(id);

            return res.status(200).json({ data: historial });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al obtener historial: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener historial" });
        }
    }

    async getParticipantes(req, res) {
        try {
            const { id } = req.params;
            const participanteModel = new TicketParticipanteModel();
            const participantes = await participanteModel.findByTicket(id);
            return res.status(200).json({ data: participantes });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al obtener participantes: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener participantes" });
        }
    }

    async addParticipante(req, res) {
        try {
            const { id } = req.params;
            const { userId, rolId } = req.user;
            const { id_usuario } = req.body;

            if (rolId >= 3) {
                return res.status(403).json({ msg: "No tiene permisos para agregar participantes" });
            }

            if (!id_usuario) {
                return res.status(400).json({ msg: "El campo id_usuario es requerido" });
            }

            const participanteModel = new TicketParticipanteModel();
            const participanteId = await participanteModel.add({
                id_ticket_soporte: id,
                id_usuario,
                id_usuario_agrego: userId
            });

            return res.status(201).json({ msg: "Participante agregado exitosamente", data: { id: participanteId } });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al agregar participante: ${error.message}`);
            return res.status(500).json({ msg: "Error al agregar participante" });
        }
    }

    async markAsRead(req, res) {
        try {
            const { id } = req.params;
            const { userId } = req.user;

            const comentarioModel = new TicketComentarioModel();
            const lastComment = await comentarioModel.getLastByTicket(id);

            if (lastComment) {
                const lecturaModel = new TicketComentarioLecturaModel();
                await lecturaModel.markAsRead(id, userId, lastComment.id);
            }

            return res.status(200).json({ msg: "Marcado como leido" });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al marcar como leido: ${error.message}`);
            return res.status(500).json({ msg: "Error al marcar como leido" });
        }
    }

    async getUsuarios(req, res) {
        try {
            const { idEmpresa } = req.user;
            const ticketModel = new TicketSoporteModel();
            const usuarios = await ticketModel.getUsuariosByEmpresa(idEmpresa);
            return res.status(200).json({ data: usuarios });
        } catch (error) {
            logger.error(`[ticket.controller.js] Error al obtener usuarios: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener usuarios" });
        }
    }
}

module.exports = new TicketController();
