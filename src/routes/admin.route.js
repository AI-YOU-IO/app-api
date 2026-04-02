const { Router } = require("express");
const AdminController = require("../controllers/admin.controller.js");

const router = Router();

// Empresas (auth aplicado en app.js)
router.get("/empresas", AdminController.getEmpresas);
router.get("/empresas/:id", AdminController.getEmpresaById);
router.post("/empresas", AdminController.createEmpresa);
router.put("/empresas/:id", AdminController.updateEmpresa);
router.put("/empresas/:id/estado", AdminController.updateEmpresaEstado);

// Tools
router.get("/tools", AdminController.getTools);
router.get("/tools/tipo/:tipo", AdminController.getToolsByTipo);

// Usuarios (admin-level, con info de empresa)
router.get("/usuarios", AdminController.getUsuarios);
router.get("/usuarios/:id", AdminController.getUsuarioById);
router.post("/usuarios", AdminController.createUsuario);
router.put("/usuarios/:id", AdminController.updateUsuario);
router.delete("/usuarios/:id", AdminController.deleteUsuario);

module.exports = router;
