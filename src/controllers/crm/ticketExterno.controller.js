const TicketSoporteModel = require("../../models/ticketSoporte.model.js");
const TicketComentarioModel = require("../../models/ticketComentario.model.js");
const TicketAdjuntoModel = require("../../models/ticketAdjunto.model.js");
const TicketHistorialModel = require("../../models/ticketHistorial.model.js");
const TicketComentarioLecturaModel = require("../../models/ticketComentarioLectura.model.js");
const s3Service = require('../../services/s3.service.js');
const logger = require('../../config/logger/loggerClient.js');

class TicketExternoController {

    async getCatalogos(req, res) {
        try {
            const ticketModel = new TicketSoporteModel();
            const catalogos = await ticketModel.getCatalogos();
            return res.status(200).json({ data: catalogos });
        } catch (error) {
            logger.error(`[ticketExterno.controller.js] Error al obtener catalogos: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener catalogos" });
        }
    }

    async getAll(req, res) {
        try {
            const { id_plataforma, id_empresa } = req.plataforma;
            const { estado, prioridad, categoria, search, page = 1, limit = 20, usuario_externo_id } = req.query;

            const ticketModel = new TicketSoporteModel();
            const result = await ticketModel.findAllExterno({
                idPlataforma: id_plataforma,
                idEmpresa: id_empresa || null,
                usuarioExternoId: usuario_externo_id || null,
                estado, prioridad, categoria, search,
                page: parseInt(page), limit: parseInt(limit)
            });

            return res.status(200).json({ data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
        } catch (error) {
            logger.error(`[ticketExterno.controller.js] Error al obtener tickets: ${error.message}`);
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

            return res.status(200).json({ data: ticket });
        } catch (error) {
            logger.error(`[ticketExterno.controller.js] Error al obtener ticket: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener ticket" });
        }
    }

    async create(req, res) {
        try {
            const { asunto, descripcion, id_categoria_soporte, id_prioridad_ticket, id_empresa, id_plataforma, usuario_externo_id, usuario_externo_nombre } = req.body;

            if (!asunto || !descripcion || !id_categoria_soporte || !id_prioridad_ticket) {
                return res.status(400).json({ msg: "Los campos asunto, descripcion, categoria y prioridad son requeridos" });
            }

            if (!usuario_externo_id || !usuario_externo_nombre) {
                return res.status(400).json({ msg: "Los campos usuario_externo_id y usuario_externo_nombre son requeridos" });
            }

            const ticketModel = new TicketSoporteModel();
            const historialModel = new TicketHistorialModel();

            const { id, numero_ticket } = await ticketModel.create({
                asunto, descripcion, id_categoria_soporte, id_prioridad_ticket,
                id_empresa: id_empresa || req.plataforma.id_empresa,
                id_plataforma: id_plataforma || req.plataforma.id_plataforma,
                id_usuario_reporta: null,
                usuario_externo_id,
                usuario_externo_nombre,
                usuario_registro: null
            });

            await historialModel.create({
                id_ticket_soporte: id,
                id_estado_anterior: null,
                id_estado_nuevo: 1,
                id_usuario: null,
                comentario: `Ticket creado por ${usuario_externo_nombre} (externo)`
            });

            return res.status(201).json({ msg: "Ticket creado exitosamente", data: { id, numero_ticket } });
        } catch (error) {
            logger.error(`[ticketExterno.controller.js] Error al crear ticket: ${error.message}`);
            return res.status(500).json({ msg: "Error al crear ticket" });
        }
    }

    async getComentarios(req, res) {
        try {
            const { id } = req.params;

            const comentarioModel = new TicketComentarioModel();
            const adjuntoModel = new TicketAdjuntoModel();

            const comentarios = await comentarioModel.findByTicket(id, false);

            for (const comentario of comentarios) {
                comentario.adjuntos = await adjuntoModel.findByComentario(comentario.id);
            }

            return res.status(200).json({ data: comentarios });
        } catch (error) {
            logger.error(`[ticketExterno.controller.js] Error al obtener comentarios: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener comentarios" });
        }
    }

    async createComentario(req, res) {
        try {
            const { id } = req.params;
            const { contenido, usuario_externo_id, usuario_externo_nombre } = req.body;

            if (!contenido && (!req.files || req.files.length === 0)) {
                return res.status(400).json({ msg: "Debe proporcionar contenido o archivos adjuntos" });
            }

            if (!usuario_externo_id || !usuario_externo_nombre) {
                return res.status(400).json({ msg: "Los campos usuario_externo_id y usuario_externo_nombre son requeridos" });
            }

            const ticketModel = new TicketSoporteModel();
            const ticket = await ticketModel.findById(id);

            if (!ticket) {
                return res.status(404).json({ msg: "Ticket no encontrado" });
            }

            const comentarioModel = new TicketComentarioModel();
            const adjuntoModel = new TicketAdjuntoModel();

            const comentarioId = await comentarioModel.create({
                id_ticket_soporte: id,
                contenido: contenido || '',
                es_interno: false,
                es_respuesta_agente: false,
                id_usuario: null,
                usuario_externo_id,
                usuario_externo_nombre,
                usuario_registro: null
            });

            // Subir archivos adjuntos
            const adjuntos = [];
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    const ruta = await s3Service.uploadFile(file, 'tickets', ticket.id_empresa || 'externo');
                    const adjuntoId = await adjuntoModel.create({
                        id_ticket_soporte: id,
                        id_ticket_comentario: comentarioId,
                        nombre_archivo: file.originalname,
                        nombre_original: file.originalname,
                        tipo_archivo: file.mimetype,
                        ruta_archivo: ruta,
                        id_usuario: null,
                        usuario_registro: null
                    });
                    adjuntos.push({ id: adjuntoId, nombre_original: file.originalname, ruta_archivo: ruta, tipo_archivo: file.mimetype });
                }
            }

            return res.status(201).json({ msg: "Comentario creado exitosamente", data: { id: comentarioId, adjuntos } });
        } catch (error) {
            logger.error(`[ticketExterno.controller.js] Error al crear comentario: ${error.message}`);
            return res.status(500).json({ msg: "Error al crear comentario" });
        }
    }

    async markAsRead(req, res) {
        try {
            const { id } = req.params;
            const { usuario_externo_id } = req.body;

            if (!usuario_externo_id) {
                return res.status(400).json({ msg: "El campo usuario_externo_id es requerido" });
            }

            const comentarioModel = new TicketComentarioModel();
            const lastComment = await comentarioModel.getLastByTicket(id);

            if (lastComment) {
                const lecturaModel = new TicketComentarioLecturaModel();
                await lecturaModel.markAsRead(id, usuario_externo_id, lastComment.id);
            }

            return res.status(200).json({ msg: "Marcado como leido" });
        } catch (error) {
            logger.error(`[ticketExterno.controller.js] Error al marcar como leido: ${error.message}`);
            return res.status(500).json({ msg: "Error al marcar como leido" });
        }
    }
}

module.exports = new TicketExternoController();
