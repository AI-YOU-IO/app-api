const { Router } = require("express");
const KpiController = require("../controllers/kpi.controller.js");

const router = Router();

router.get("/", KpiController.getKpis);

module.exports = router;
