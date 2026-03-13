const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const LlamadaController = require("../controllers/crm/llamada.controller.js");

const router = Router();

// Middleware de autenticación por token para Asterisk
const authAsteriskToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token no proporcionado. Use: Authorization: Bearer <token>' });
    }

    const token = authHeader.replace('Bearer ', '');
    const validToken = process.env.AIYOU_API_TOKEN_ASTERISK;

    if (token !== validToken) {
        return res.status(401).json({ message: 'Token inválido' });
    }

    // Simular user para compatibilidad con el controlador
    req.user = { idEmpresa: req.body.id_empresa || null, userId: 'asterisk' };
    next();
};

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

// Ruta de upload de audio
router.post("/upload-audio", authAsteriskToken, uploadAudio.single('audio'), LlamadaController.uploadAudio);

// Ruta de transcripcion
router.post("/transcripcion", authAsteriskToken, LlamadaController.guardarTranscripcion);

module.exports = router;
