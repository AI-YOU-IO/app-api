const express = require("express");
const router = express.Router();

const consumoIndicadoresController =
require("../../controllers/crm/consumo_indicadores.controller");

router.get(
  "/consumo-indicadores",
  consumoIndicadoresController.getConsumoIndicadores
);

module.exports = router;