const { Router } = require("express");
const PersonaController = require("../../controllers/crm/persona.controller.js");

const router = Router();

router.get("/persona", PersonaController.listAll);
router.post("/persona/lista-negra", PersonaController.addToListaNegra);
router.get("/persona/celular/:celular", PersonaController.searchByCelular);
router.post("/persona/bulk-assign", PersonaController.bulkAssign);
router.get("/persona/:id", PersonaController.getById);
router.post("/persona", PersonaController.create);
router.put("/persona/:id", PersonaController.update);
module.exports = router;
