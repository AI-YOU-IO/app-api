const { Router } = require("express");
const PlantillaWhatsappController = require("../controllers/plantillaWhatsapp.controller.js");

const router = Router();

router.get("/plantillas-whatsapp", /* #swagger.tags = ['Plantilla WhatsApp'] */ PlantillaWhatsappController.getPlantillas);
router.post("/plantillas-whatsapp/sync", /* #swagger.tags = ['Plantilla WhatsApp'] */ PlantillaWhatsappController.syncPlantillas);
router.get("/plantillas-whatsapp/:id", /* #swagger.tags = ['Plantilla WhatsApp'] */ PlantillaWhatsappController.getPlantillaById);
router.post("/plantillas-whatsapp", /* #swagger.tags = ['Plantilla WhatsApp'] */ PlantillaWhatsappController.createPlantilla);
router.put("/plantillas-whatsapp/:id", /* #swagger.tags = ['Plantilla WhatsApp'] */ PlantillaWhatsappController.updatePlantilla);
router.delete("/plantillas-whatsapp/:id", /* #swagger.tags = ['Plantilla WhatsApp'] */ PlantillaWhatsappController.deletePlantilla);
router.post("/plantillas-whatsapp/enviar", /* #swagger.tags = ['Plantilla WhatsApp'] */ PlantillaWhatsappController.enviarPlantilla);

module.exports = router;
