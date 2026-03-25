const { Router } = require("express");
const multer = require("multer");
const ContactoController = require("../../controllers/crm/contacto.controller.js");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

const router = Router();

router.get("/:id/mensajes", ContactoController.getMensajes);
router.post("/:id/mark-read", ContactoController.markRead);
router.post("/:id/mensajes", ContactoController.sendMensaje);
router.post("/:id/archivo", upload.single('archivo'), ContactoController.sendArchivo);
router.patch("/:id/toggle-bot", ContactoController.toggleBot);

module.exports = router;
