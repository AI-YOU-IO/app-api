const { Router } = require("express");
const PersonaController = require("../../controllers/crm/persona.controller.js");

const router = Router();

router.get("/persona", PersonaController.listAll);
router.get("/persona/:id", PersonaController.getById);
router.post("/persona", PersonaController.create);
router.put("/persona/:id", PersonaController.update);
router.post("/persona/bulk-assign", PersonaController.bulkAssign);
router.get("/persona/celular/:celular", PersonaController.searchByCelular);
module.exports = router;
