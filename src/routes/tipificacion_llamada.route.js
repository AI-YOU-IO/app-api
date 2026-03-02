const { Router } = require("express");
const TipificacionLlamadaController = require("../controllers/tipificacion_llamadas.controller.js");

const router = Router();

router.get("/tipificacion-llamada", TipificacionLlamadaController.getAllTipificacion);
router.post("/tipificacion-llamada", TipificacionLlamadaController.createTipificacion);
router.get("/tipificacion-llamada/:id", TipificacionLlamadaController.getTipificacionById);
router.put("/tipificacion-llamada/:id", TipificacionLlamadaController.updateTipificacion);
router.delete("/tipificacion-llamada/:id", TipificacionLlamadaController.deleteTipificacion);

module.exports = router;