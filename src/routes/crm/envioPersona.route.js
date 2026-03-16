const { Router } = require("express");
const EnvioPersonaController = require("../../controllers/crm/envioPersona.controller.js");

const router = Router();

router.get("/envio-persona", EnvioPersonaController.listAll);
router.get("/envio-persona/:id", EnvioPersonaController.getById);
router.get("/envio-persona/envio-masivo/:id_envio_masivo", EnvioPersonaController.getByEnvioMasivo);
router.post("/envio-persona", EnvioPersonaController.create);
router.post("/envio-persona/bulk", EnvioPersonaController.bulkCreate);
router.put("/envio-persona/:id", EnvioPersonaController.update);
router.patch("/envio-persona/:id/estado", EnvioPersonaController.updateEstado);
router.delete("/envio-persona/:id", EnvioPersonaController.delete);

module.exports = router;
