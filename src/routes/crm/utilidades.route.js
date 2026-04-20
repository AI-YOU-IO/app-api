const { Router } = require("express");
const UtilidadesController = require("../../controllers/crm/utilidades.controller.js");

const router = Router();

router.post("/utilidades/fechaHora", UtilidadesController.obtenerFechaHora);

module.exports = router;
