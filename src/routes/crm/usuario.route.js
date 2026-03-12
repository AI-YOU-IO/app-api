const { Router } = require("express");
const UsuarioController = require("../../controllers/crm/usuario.controller.js");
const upload = require("../../middlewares/uploadUserPhoto");

const router = Router();

router.post("/login", UsuarioController.loginUsuario);

router.post("/auth/forgot-password", UsuarioController.forgotPassword);

router.post(
  "/usuarios/:id/foto",
  upload.single("foto"),
  UsuarioController.uploadPhoto
);

module.exports = router;