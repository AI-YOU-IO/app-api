/**
 * Rutas para integración con n8n - Envíos Masivos WhatsApp
 * Protegidas con API Key en lugar de JWT
 */

const { Router } = require("express");
const N8nEnvioMasivoController = require("../../controllers/crm/n8nEnvioMasivo.controller.js");
const { validateN8nApiKey } = require("../../middlewares/n8nAuth.middleware.js");

const router = Router();

// Aplicar middleware de autenticación n8n a todas las rutas
router.use(validateN8nApiKey);

// GET /n8n/envios-masivos/pendientes - Obtener envíos pendientes agrupados por empresa
router.get("/envios-masivos/pendientes", N8nEnvioMasivoController.getPendientesAgrupados);

// POST /n8n/envios-masivos/:id/enviar - Enviar mensajes de un envío masivo
router.post("/envios-masivos/:id/enviar", N8nEnvioMasivoController.enviarMasivo);

// PUT /n8n/envios-masivos/:id/completar - Marcar envío como completado
router.put("/envios-masivos/:id/completar", N8nEnvioMasivoController.marcarCompletado);

module.exports = router;
