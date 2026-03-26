const express = require("express");
const router = express.Router();

const chatIndicadoresController = require("../../controllers/crm/chat_indicadores.controller");

router.get("/chat-indicadores", chatIndicadoresController.getChatIndicadores);

module.exports = router;
