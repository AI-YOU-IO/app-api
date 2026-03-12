const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const setupSwagger = require('./config/swagger');

const messageProcessingRoutes = require('./routes/messageProcessing.route.js');
const { responseHandler } = require('./middlewares/response.middleware.js');
const authMiddleware = require('./middlewares/auth.middleware.js');
const usuarioRoutes = require("./routes/crm/usuario.route.js");
const auditoriaRoutes = require("./routes/crm/auditoria.route.js");
const configuracionRoutes = require("./routes/crm/configuracion.route.js");
const llamadaRoutes = require("./routes/crm/llamada.route.js");
const personaRoutes = require("./routes/crm/persona.route.js");
const reportesCrmRoutes = require("./routes/crm/reportes.route.js");
const transcripcionRoutes = require("./routes/crm/transcripcion.route.js")
const pagoRoutes = require("./routes/pago.routes.js");
const whatsappRoutes = require("./routes/plantillaWhatsapp.route.js");
const tipificacionLlamadaRoutes = require("./routes/tipificacion_llamada.route.js");
const clientesRoutes = require("./routes/crm/clientes.route.js");
const contactosRoutes = require("./routes/crm/contactos.route.js");
const contactoRoutes = require("./routes/crm/contacto.route.js");
const adminRoutes = require("./routes/admin.route.js");
const ConfiguracionController = require("./controllers/crm/configuracion.controller.js");
const whatsappEmbeddedRoutes = require("./routes/whatsappEmbedded.route.js");
const sandboxRoutes = require("./routes/sandbox.route.js");

const app = express();

// CORS - permitir todas las peticiones (debe ir primero)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
}));

// Middleware de seguridad (configurado para permitir CORS)
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Middleware para parsing
app.use(express.json());

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, '..', 'public')));

// Servir archivos subidos (uploads)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Middleware para respuestas JSON consistentes
app.use(responseHandler);

// Rutas publicas (sin auth)
app.use("/api/crm", usuarioRoutes);
app.use("/api/crm/tools", pagoRoutes);
app.post("/api/crm/tipificaciones", ConfiguracionController.createTipificacion);
// Rutas protegidas del CRM (requieren auth)
app.use("/api/crm", authMiddleware, auditoriaRoutes, configuracionRoutes, llamadaRoutes, tipificacionLlamadaRoutes, personaRoutes, whatsappRoutes, transcripcionRoutes);
app.use("/api/crm/clientes", authMiddleware, clientesRoutes);
app.use("/api/crm/contactos", authMiddleware, contactosRoutes);
app.use("/api/crm/contacto", authMiddleware, contactoRoutes);
app.use("/api/crm/reportes", authMiddleware, reportesCrmRoutes);
app.use("/api/crm/admin", authMiddleware, adminRoutes);
app.use("/api/crm", authMiddleware, whatsappEmbeddedRoutes);
app.use('/api/assistant', messageProcessingRoutes);


// Ruta de health check
app.get('/health', (req, res) => {
  res.success(200, 'Health check');
});

// Swagger UI (DESPUÉS de registrar todas las rutas para auto-discovery)
setupSwagger(app);

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.clientError(404, 'Ruta no encontrada');
});


module.exports = app;
