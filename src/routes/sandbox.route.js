const { Router } = require("express");
const SandboxController = require("../controllers/sandbox.controller.js");

const router = Router();

// Configuración
router.get("/configuracion", SandboxController.getConfiguracion);
router.post("/configuracion", SandboxController.saveConfiguracion);
router.put("/configuracion/:id", SandboxController.updateConfiguracion);

// Chats
router.get("/chats", SandboxController.getChats);
router.post("/chats", SandboxController.createChat);
router.delete("/chats/:id", SandboxController.deleteChat);

// Mensajes
router.get("/chats/:idChat/messages", SandboxController.getMessages);
router.post("/chats/:idChat/messages", SandboxController.sendMessage);

// Webhook - el bot responde aquí (formato simple: message, type, url)
router.post("/reply", SandboxController.receiveReply);

// Webhook - el bot responde aquí (formato n8n con session_id)
router.post("/chats/:idChat/reply", SandboxController.receiveReplyWithSessionId);

// Mock WhatsApp webhook payload (solo message dinámico)
router.post("/mock-whatsapp", SandboxController.sendMockWhatsappPayload);

// Nuevo endpoint adicional: recibe body de front y lo mapea a webhook mock
router.post("/chats/:idChat/messages/webhook-mock", SandboxController.sendMockWhatsappWebhookFromFront);

module.exports = router;
