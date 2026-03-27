const { Router } = require("express");
const AnalisisSentimientoController = require("../../controllers/crm/analisisSentimiento.controller.js");

const router = Router();

// GET /crm/analisis/llamada/:idLlamada
router.get("/analisis/llamada/:idLlamada", AnalisisSentimientoController.getByLlamada);

// GET /crm/analisis/chat/:idChat
router.get("/analisis/chat/:idChat", AnalisisSentimientoController.getByChat);

// GET /crm/analisis/dashboard?fecha_inicio=2026-01-01&fecha_fin=2026-03-31
router.get("/analisis/dashboard", AnalisisSentimientoController.getDashboard);

module.exports = router;
