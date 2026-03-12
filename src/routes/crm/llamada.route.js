const { Router } = require("express");
const LlamadaController = require("../../controllers/crm/llamada.controller.js");

const router = Router();

// Rutas de Llamadas (auth aplicado en app.js)
router.get("/llamadas", LlamadaController.getAll);
router.get("/llamadas/campania/:idCampania", LlamadaController.getByCampania);
router.get("/llamadas/ejecucion/:idCampaniaEjecucion", LlamadaController.getByCampaniaEjecucion);
router.get("/llamadas/provider/:providerCallId", LlamadaController.getByProviderCallId);
router.get("/llamadas/:id", LlamadaController.getById);
router.post("/llamadas", LlamadaController.create);
router.put("/llamadas/nuevaTipificacion", LlamadaController.actualizarTipificacion);

module.exports = router;
