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

// Webhook - el bot responde aquí
router.post("/reply", SandboxController.receiveReply);

module.exports = router;
