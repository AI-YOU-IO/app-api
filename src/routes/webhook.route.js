const { Router } = require("express");
const WebhookController = require("../controllers/webhook.controller.js");

const router = Router();

// GET /webhook - Verificacion de Meta
router.get("/", WebhookController.verify);

// POST /webhook - Recibe mensajes
router.post("/", WebhookController.receive.bind(WebhookController));

module.exports = router;
