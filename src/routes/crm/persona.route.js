const { Router } = require("express");
const PersonaController = require("../../controllers/crm/persona.controller.js");

const router = Router();

router.get("/", PersonaController.listAll);
router.get("/:id", PersonaController.getById);
router.post("/", PersonaController.create);
router.put("/:id", PersonaController.update);
router.post("/bulk-assign", PersonaController.bulkAssign);
router.get("/persona/celular/:celular", PersonaController.searchByCelular);
module.exports = router;
