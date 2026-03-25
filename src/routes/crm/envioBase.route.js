const { Router } = require("express");
const EnvioBaseController = require("../../controllers/crm/envioBase.controller.js");

const router = Router();

router.get("/envio-base", EnvioBaseController.listAll);
router.get("/envio-base/:id", EnvioBaseController.getById);
router.get("/envio-base/envio-masivo/:id_envio_masivo", EnvioBaseController.getByEnvioMasivo);
router.post("/envio-base", EnvioBaseController.create);
router.post("/envio-base/bulk", EnvioBaseController.bulkCreate);
router.put("/envio-base/:id", EnvioBaseController.update);
router.patch("/envio-base/:id/estado", EnvioBaseController.updateEstado);
router.delete("/envio-base/:id", EnvioBaseController.delete);

module.exports = router;
