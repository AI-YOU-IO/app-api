const { Router } = require("express");
const ToolController = require("../controllers/tool.controller.js");

const router = Router();

// CRUD de Tools
router.get("/", ToolController.getAll);
router.get("/:id", ToolController.getById);
router.get("/:id/full", ToolController.getByIdWithParametros);
router.post("/", ToolController.create);
router.put("/:id", ToolController.update);
router.delete("/:id", ToolController.delete);

// Parámetros de Tools
router.get("/:id/parametros", ToolController.getParametros);
router.post("/:id/parametros", ToolController.addParametro);
router.put("/:id/parametros/:parametroId", ToolController.updateParametro);
router.delete("/:id/parametros/:parametroId", ToolController.deleteParametro);
router.put("/:id/parametros", ToolController.updateParametros);

module.exports = router;
