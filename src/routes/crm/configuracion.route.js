const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const ConfiguracionController = require("../../controllers/crm/configuracion.controller.js");

const router = Router();

// Configuración de Multer para subida de imágenes de catálogo (memory storage para S3)
const uploadCatalogo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error("Solo se permiten imágenes (jpeg, jpg, png, gif, webp)"));
    }
});

// Rutas de Roles
router.get("/roles", ConfiguracionController.getRoles);
router.get("/roles/:id", ConfiguracionController.getRolById);
router.post("/roles", ConfiguracionController.createRol);
router.put("/roles/:id", ConfiguracionController.updateRol);
router.delete("/roles/:id", ConfiguracionController.deleteRol);

// Rutas de Usuarios
router.get("/usuarios", ConfiguracionController.getUsuarios);
router.get("/usuarios/rol/:idRol", ConfiguracionController.getUsuariosByRol);
router.get("/usuarios/:id", ConfiguracionController.getUsuarioById);
router.post("/usuarios", ConfiguracionController.createUsuario);
router.put("/usuarios/:id", ConfiguracionController.updateUsuario);
router.put("/usuarios/:id/password", ConfiguracionController.changePassword);
router.delete("/usuarios/:id", ConfiguracionController.deleteUsuario);

// Rutas de Módulos
router.get("/modulos", ConfiguracionController.getModulos);
router.get("/modulos/:id", ConfiguracionController.getModuloById);
router.post("/modulos", ConfiguracionController.createModulo);
router.put("/modulos/:id", ConfiguracionController.updateModulo);
router.delete("/modulos/:id", ConfiguracionController.deleteModulo);

// Rutas de Sucursales
router.get("/sucursales", ConfiguracionController.getSucursales);
router.get("/sucursales/:id", ConfiguracionController.getSucursalById);
router.post("/sucursales", ConfiguracionController.createSucursal);
router.put("/sucursales/:id", ConfiguracionController.updateSucursal);
router.delete("/sucursales/:id", ConfiguracionController.deleteSucursal);


// Rutas de Catálogo
router.get("/catalogo", ConfiguracionController.getCatalogo);
router.get("/catalogo/:id", ConfiguracionController.getCatalogoById);
router.post("/catalogo", uploadCatalogo.single('imagen'), ConfiguracionController.createCatalogo);
router.put("/catalogo/:id", uploadCatalogo.single('imagen'), ConfiguracionController.updateCatalogo);
router.delete("/catalogo/:id", ConfiguracionController.deleteCatalogo);

// Rutas de Preguntas Frecuentes
router.get("/faqs", ConfiguracionController.getFaqs);
router.get("/faqs/:id", ConfiguracionController.getFaqById);
router.post("/faqs", ConfiguracionController.createFaq);
router.put("/faqs/:id", ConfiguracionController.updateFaq);
router.delete("/faqs/:id", ConfiguracionController.deleteFaq);

// Rutas de Tipificaciones
router.get("/tipificaciones", ConfiguracionController.getTipificaciones);
router.get("/tipificaciones/:id", ConfiguracionController.getTipificacionById);
router.post("/tipificaciones", ConfiguracionController.createTipificacion);
router.put("/tipificaciones/:id", ConfiguracionController.updateTipificacion);
router.delete("/tipificaciones/:id", ConfiguracionController.deleteTipificacion);

// Rutas de Estados (solo lectura y edición de color)
router.get("/estados", ConfiguracionController.getEstados);
router.get("/estados/:id", ConfiguracionController.getEstadoById);
router.patch("/estados/:id/color", ConfiguracionController.updateEstadoColor);

// Rutas de Preguntas de Perfilamiento
router.get("/preguntas-perfilamiento", ConfiguracionController.getPreguntasPerfilamiento);
router.get("/preguntas-perfilamiento/:id", ConfiguracionController.getPreguntaPerfilamientoById);
router.post("/preguntas-perfilamiento", ConfiguracionController.createPreguntaPerfilamiento);
router.put("/preguntas-perfilamiento/:id", ConfiguracionController.updatePreguntaPerfilamiento);
router.delete("/preguntas-perfilamiento/:id", ConfiguracionController.deletePreguntaPerfilamiento);

// Rutas de Argumentos de Venta
router.get("/argumentos-venta", ConfiguracionController.getArgumentosVenta);
router.get("/argumentos-venta/:id", ConfiguracionController.getArgumentoVentaById);
router.post("/argumentos-venta", ConfiguracionController.createArgumentoVenta);
router.put("/argumentos-venta/:id", ConfiguracionController.updateArgumentoVenta);
router.delete("/argumentos-venta/:id", ConfiguracionController.deleteArgumentoVenta);

// Rutas de Periodicidad de Recordatorios
router.get("/periodicidades-recordatorio", ConfiguracionController.getPeriodicidadesRecordatorio);
router.get("/periodicidades-recordatorio/:id", ConfiguracionController.getPeriodicidadRecordatorioById);
router.post("/periodicidades-recordatorio", ConfiguracionController.createPeriodicidadRecordatorio);
router.put("/periodicidades-recordatorio/:id", ConfiguracionController.updatePeriodicidadRecordatorio);
router.delete("/periodicidades-recordatorio/:id", ConfiguracionController.deletePeriodicidadRecordatorio);

// Rutas de Formatos
router.get("/formatos", ConfiguracionController.getFormatos);
router.get("/formatos/:id", ConfiguracionController.getFormatoById);
router.post("/formatos", ConfiguracionController.createFormato);
router.put("/formatos/:id", ConfiguracionController.updateFormato);
router.delete("/formatos/:id", ConfiguracionController.deleteFormato);

// Rutas de Campos de Formato
router.get("/formatos/:idFormato/campos", ConfiguracionController.getCamposByFormato);
router.get("/formato-campos/:id", ConfiguracionController.getCampoById);
router.post("/formato-campos", ConfiguracionController.createCampo);
router.put("/formato-campos/:id", ConfiguracionController.updateCampo);
router.delete("/formato-campos/:id", ConfiguracionController.deleteCampo);
router.patch("/formato-campos/orden", ConfiguracionController.updateOrdenCampos);

// Configuracion de Multer para carga de archivos Excel/CSV
const uploadBaseNumero = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB maximo
    fileFilter: (req, file, cb) => {
        const allowedTypes = /xlsx|xls|csv/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        if (extname) {
            return cb(null, true);
        }
        cb(new Error("Solo se permiten archivos Excel (xlsx, xls) o CSV"));
    }
});

// Rutas de Base de Numeros
router.get("/bases-numeros", ConfiguracionController.getBasesNumeros);
router.get("/bases-numeros/:id", ConfiguracionController.getBaseNumeroById);
router.post("/bases-numeros", ConfiguracionController.createBaseNumero);
router.put("/bases-numeros/:id", ConfiguracionController.updateBaseNumero);
router.delete("/bases-numeros/:id", ConfiguracionController.deleteBaseNumero);

// Rutas de Detalle Base de Numeros
router.get("/bases-numeros/:idBase/detalles", ConfiguracionController.getDetallesByBaseNumero);
router.post("/base-numero-detalles", ConfiguracionController.createDetalle);
router.delete("/base-numero-detalles/:id", ConfiguracionController.deleteDetalle);

// Ruta de carga masiva
router.post("/bases-numeros/upload", uploadBaseNumero.single('archivo'), ConfiguracionController.uploadBaseNumero);

// Rutas de Plantillas
router.get("/plantillas", ConfiguracionController.getPlantillas);
router.get("/plantillas/:id", ConfiguracionController.getPlantillaById);
router.get("/formatos/:idFormato/plantillas", ConfiguracionController.getPlantillasByFormato);
router.post("/plantillas", ConfiguracionController.createPlantilla);
router.put("/plantillas/:id", ConfiguracionController.updatePlantilla);
router.delete("/plantillas/:id", ConfiguracionController.deletePlantilla);

// Rutas de Campanias
router.get("/campanias", ConfiguracionController.getCampanias);
router.get("/campanias/:id", ConfiguracionController.getCampaniaById);
router.post("/campanias", ConfiguracionController.createCampania);
router.put("/campanias/:id", ConfiguracionController.updateCampania);
router.delete("/campanias/:id", ConfiguracionController.deleteCampania);

// Rutas de Bases de Campania
router.get("/campanias/:idCampania/bases", ConfiguracionController.getBasesByCampania);
router.post("/campania-bases", ConfiguracionController.addBaseToCampania);
router.delete("/campania-bases/:id", ConfiguracionController.removeBaseFromCampania);

// Rutas de Ejecucion de Campania
router.get("/campanias/:idCampania/ejecuciones", ConfiguracionController.getEjecucionesByCampania);
router.get("/campanias/:idCampania/estadisticas", ConfiguracionController.getEstadisticasCampania);
router.post("/campania-ejecuciones/ejecutar", ConfiguracionController.ejecutarCampania);
router.get("/campania-ejecuciones/:id", ConfiguracionController.getEjecucionById);
router.patch("/campania-ejecuciones/:id/estado", ConfiguracionController.updateEstadoEjecucion);
router.patch("/campania-ejecuciones/:id/cancelar", ConfiguracionController.cancelarEjecucion);

// Rutas de Configuracion de Llamadas por Campania
router.get("/campanias/:id_campania/config-llamadas", ConfiguracionController.getConfiguracionCampaniaLlamada);
router.post("/campanias/:id_campania/config-llamadas", ConfiguracionController.saveConfiguracionCampaniaLlamada);

// Rutas de Prompt Asistente (Bot WhatsApp)
router.get("/prompt-asistente", ConfiguracionController.getPromptAsistente);
router.post("/prompt-asistente", ConfiguracionController.savePromptAsistente);

// Rutas de Proyectos
router.get("/proyectos", ConfiguracionController.getProyectos);
router.post("/proyectos", ConfiguracionController.createProyecto);
router.put("/proyectos/:id", ConfiguracionController.updateProyecto);
router.delete("/proyectos/:id", ConfiguracionController.deleteProyecto);
router.post("/projects/sync-sperant", ConfiguracionController.syncProyectosSperant);

// Rutas de Unidades
router.get("/unidades", ConfiguracionController.getUnidades);
router.post("/unidades", ConfiguracionController.createUnidad);
router.put("/unidades/:id", ConfiguracionController.updateUnidad);
router.delete("/unidades/:id", ConfiguracionController.deleteUnidad);
router.post("/units/sync-sperant", ConfiguracionController.syncUnidadesSperant);

// Rutas de Tipologías
router.get("/tipologias", ConfiguracionController.getTipologias);
router.post("/tipologias", ConfiguracionController.createTipologia);
router.put("/tipologias/:id", ConfiguracionController.updateTipologia);
router.delete("/tipologias/:id", ConfiguracionController.deleteTipologia);

// Rutas de Tipo Plantillas
router.get("/tipo-plantillas", ConfiguracionController.getTipoPlantillas);
router.get("/tipo-plantillas/:id", ConfiguracionController.getTipoPlantillaById);

// Rutas de Tipo Recursos
router.get("/tipo-recursos", ConfiguracionController.getTipoRecursos);

// Rutas de Recursos
router.get("/recursos", ConfiguracionController.getRecursos);
router.post("/recursos", ConfiguracionController.createRecurso);
router.put("/recursos/:id", ConfiguracionController.updateRecurso);
router.delete("/recursos/:id", ConfiguracionController.deleteRecurso);

// Rutas de Estados de Campaña
router.get("/estados-campania", ConfiguracionController.getEstadosCampania);
router.post("/estados-campania", ConfiguracionController.createEstadoCampania);
router.put("/estados-campania/:id", ConfiguracionController.updateEstadoCampania);
router.delete("/estados-campania/:id", ConfiguracionController.deleteEstadoCampania);

// Rutas de Tipos de Campaña
router.get("/tipos-campania", ConfiguracionController.getTiposCampania);
router.post("/tipos-campania", ConfiguracionController.createTipoCampania);
router.put("/tipos-campania/:id", ConfiguracionController.updateTipoCampania);
router.delete("/tipos-campania/:id", ConfiguracionController.deleteTipoCampania);

// Rutas de Voces
router.get("/voces", ConfiguracionController.getVoces);

// Rutas de Personas (listado)
router.get("/personas", ConfiguracionController.getPersonas);

// Tipos de persona (global)
router.get("/tipos-persona", ConfiguracionController.getTiposPersona);

// Rutas de Conversaciones
router.get("/conversaciones", ConfiguracionController.getConversaciones);

// Rutas de Plantillas WhatsApp (via /crm/ path)
router.get("/plantillas-whatsapp", ConfiguracionController.getPlantillasWhatsapp);
router.post("/plantillas-whatsapp", ConfiguracionController.createPlantillaWhatsapp);
router.put("/plantillas-whatsapp/:id", ConfiguracionController.updatePlantillaWhatsapp);
router.delete("/plantillas-whatsapp/:id", ConfiguracionController.deletePlantillaWhatsapp);

module.exports = router;
