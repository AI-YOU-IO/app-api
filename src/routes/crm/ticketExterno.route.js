const { Router } = require("express");
const multer = require("multer");
const TicketExternoController = require("../../controllers/crm/ticketExterno.controller.js");

const uploadFiles = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const router = Router();

// Middleware de autenticacion por API Key para plataformas externas
const authApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({ msg: 'API Key no proporcionada' });
    }

    // Mapear API keys a plataformas
    const keyMap = {
        [process.env.TICKET_API_KEY_INMOBILIARIA]: { id_plataforma: 2, nombre: 'inmobiliaria' },
        [process.env.TICKET_API_KEY_AUTOMOTRIZ]: { id_plataforma: 3, nombre: 'automotriz' },
    };

    const plataforma = keyMap[apiKey];
    if (!plataforma) {
        return res.status(401).json({ msg: 'API Key invalida' });
    }

    req.plataforma = plataforma;

    // Si viene id_empresa en el body o query, usarlo
    if (req.body?.id_empresa) req.plataforma.id_empresa = req.body.id_empresa;
    if (req.query?.id_empresa) req.plataforma.id_empresa = req.query.id_empresa;

    next();
};

router.use(authApiKey);

// Catalogos
router.get("/catalogos", TicketExternoController.getCatalogos);

// Tickets
router.get("/tickets", TicketExternoController.getAll);
router.get("/tickets/:id", TicketExternoController.getById);
router.post("/tickets", TicketExternoController.create);

// Comentarios
router.get("/tickets/:id/comentarios", TicketExternoController.getComentarios);
router.post("/tickets/:id/comentarios", uploadFiles.array('archivos', 5), TicketExternoController.createComentario);

// Lectura
router.post("/tickets/:id/mark-read", TicketExternoController.markAsRead);

module.exports = router;
