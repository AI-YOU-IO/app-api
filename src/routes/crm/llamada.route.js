const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const LlamadaController = require("../../controllers/crm/llamada.controller.js");

const router = Router();

// Configuración de Multer para subida de audios de llamadas
const uploadAudio = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB máximo
    fileFilter: (req, file, cb) => {
        const allowedTypes = /mp3|wav|ogg|m4a|webm|mpeg|audio/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname || mimetype) {
            return cb(null, true);
        }
        cb(new Error("Solo se permiten archivos de audio (mp3, wav, ogg, m4a, webm)"));
    }
});

// Rutas de Llamadas (auth aplicado en app.js)
router.get("/llamadas", LlamadaController.getAll);
router.get("/llamadas/campania/:idCampania", LlamadaController.getByCampania);
router.get("/llamadas/ejecucion/:idCampaniaEjecucion", LlamadaController.getByCampaniaEjecucion);
router.get("/llamadas/provider/:providerCallId", LlamadaController.getByProviderCallId);
router.get("/llamadas/:id", LlamadaController.getById);
router.post("/llamadas", LlamadaController.create);
router.put("/llamadas/nuevaTipificacion", LlamadaController.actualizarTipificacion);

// Ruta de upload de audio
router.post("/llamadas/upload-audio", uploadAudio.single('audio'), LlamadaController.uploadAudio);

module.exports = router;
