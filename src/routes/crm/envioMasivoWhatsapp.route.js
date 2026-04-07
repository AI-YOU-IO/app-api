const { Router } = require("express");
const EnvioMasivoWhatsappController = require("../../controllers/crm/envioMasivoWhatsapp.controller.js");

const router = Router();

router.get("/envio-masivo-whatsapp", EnvioMasivoWhatsappController.listAll);
router.get("/envio-masivo-whatsapp/:id", EnvioMasivoWhatsappController.getById);
router.get("/envio-masivo-whatsapp/:id/personas", EnvioMasivoWhatsappController.getWithPersonas);
router.post("/envio-masivo-whatsapp", EnvioMasivoWhatsappController.create);
router.put("/envio-masivo-whatsapp/:id", EnvioMasivoWhatsappController.update);
router.get("/envio-masivo-whatsapp/:id/validar", EnvioMasivoWhatsappController.validarEnvio);
router.post("/envio-masivo-whatsapp/:id/enviar", EnvioMasivoWhatsappController.ejecutarEnvio);
router.patch("/envio-masivo-whatsapp/:id/estado", EnvioMasivoWhatsappController.updateEstado);
router.delete("/envio-masivo-whatsapp/:id", EnvioMasivoWhatsappController.delete);

module.exports = router;
