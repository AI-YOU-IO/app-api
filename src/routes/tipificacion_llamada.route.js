const { Router } = require("express");
const TipificacionLlamadaController = require("../controllers/tipificacion_llamadas.controller.js");

const router = Router();

router.get("/tipificacion-llamada", TipificacionLlamadaController.getAllTipificacion);
router.get("/tipificacion-llamada/tree", TipificacionLlamadaController.getAllAsTree);
router.get("/tipificacion-llamada/raices", TipificacionLlamadaController.getRaices);
router.get("/tipificacion-llamada/hijos/:id_padre", TipificacionLlamadaController.getByPadre);
router.post("/tipificacion-llamada", TipificacionLlamadaController.createTipificacion);
router.get("/tipificacion-llamada/:id", TipificacionLlamadaController.getTipificacionById);
router.put("/tipificacion-llamada/:id", TipificacionLlamadaController.updateTipificacion);
router.delete("/tipificacion-llamada/:id", TipificacionLlamadaController.deleteTipificacion);

module.exports = router;