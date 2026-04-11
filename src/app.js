const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const setupSwagger = require('./config/swagger');

const messageProcessingRoutes = require('./routes/messageProcessing.route.js');
const { responseHandler } = require('./middlewares/response.middleware.js');
const authMiddleware = require('./middlewares/auth.middleware.js');
const usuarioRoutes = require("./routes/crm/usuario.route.js");
// const auditoriaRoutes = require("./routes/crm/auditoria.route.js"); // TODO: Archivo no existe
const configuracionRoutes = require("./routes/crm/configuracion.route.js");
const llamadaRoutes = require("./routes/crm/llamada.route.js");
const personaRoutes = require("./routes/crm/persona.route.js");
const reportesCrmRoutes = require("./routes/crm/reportes.route.js");
const transcripcionRoutes = require("./routes/crm/transcripcion.route.js");
const pagoRoutes = require("./routes/pago.routes.js");
const consumoIndicadoresRoutes = require("./routes/crm/consumo_indicadores.route.js");
const whatsappRoutes = require("./routes/plantillaWhatsapp.route.js");
const tipificacionLlamadaRoutes = require("./routes/tipificacion_llamada.route.js");
const clientesRoutes = require("./routes/crm/clientes.route.js");
const contactosRoutes = require("./routes/crm/contactos.route.js");
const contactoRoutes = require("./routes/crm/contacto.route.js");
const adminRoutes = require("./routes/admin.route.js");
const ConfiguracionController = require("./controllers/crm/configuracion.controller.js");
const whatsappEmbeddedRoutes = require("./routes/whatsappEmbedded.route.js");
const sandboxRoutes = require("./routes/sandbox.route.js");
const configuracionWhatsappRoutes = require("./routes/configuracionWhatsapp.route.js");
const toolRoutes = require("./routes/tool.route.js");
const asteriskRoutes = require("./routes/asterisk.route.js");
const envioMasivoWhatsappRoutes = require("./routes/crm/envioMasivoWhatsapp.route.js");
const envioPersonaRoutes = require("./routes/crm/envioBase.route.js");
const n8nEnvioMasivoRoutes = require("./routes/crm/n8nEnvioMasivo.route.js");
const n8nEmpresaRoutes = require("./routes/crm/n8nEmpresa.route.js");
const n8nMensajeVistoRoutes = require("./routes/crm/n8nMensajeVisto.route.js");
const n8nRecuperacionRoutes = require("./routes/crm/n8nRecuperacion.route.js");
const analisisSentimientoRoutes = require("./routes/crm/analisisSentimiento.route.js");
const kpiRoutes = require("./routes/kpi.route.js");
const ticketRoutes = require("./routes/crm/ticket.route.js");
const ticketExternoRoutes = require("./routes/crm/ticketExterno.route.js");
const systemRoutes = require("./routes/system.route.js");

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
app.use("/api/crm/tools", pagoRoutes, llamadaRoutes, whatsappRoutes);
app.use("/api/sandbox", sandboxRoutes);
app.use("/api/asterisk", asteriskRoutes);
app.use("/api/n8n", n8nEnvioMasivoRoutes);
app.use("/api/n8n", n8nEmpresaRoutes);
app.use("/api/n8n", n8nMensajeVistoRoutes);
app.use("/api/n8n", n8nRecuperacionRoutes);
app.post("/api/crm/tipificaciones", ConfiguracionController.createTipificacion);
// Rutas protegidas del CRM (requieren auth)
app.use("/api/crm", authMiddleware, configuracionRoutes, llamadaRoutes, tipificacionLlamadaRoutes, personaRoutes, whatsappRoutes, transcripcionRoutes, configuracionWhatsappRoutes, consumoIndicadoresRoutes, analisisSentimientoRoutes);
app.use("/api/crm/clientes", authMiddleware, clientesRoutes);
app.use("/api/crm/contactos", authMiddleware, contactosRoutes);
app.use("/api/crm/contacto", authMiddleware, contactoRoutes);
app.use("/api/crm/reportes", authMiddleware, reportesCrmRoutes);
app.use("/api/crm/admin", authMiddleware, adminRoutes);
app.use("/api/crm/admin/tools", authMiddleware, toolRoutes);
app.use("/api/crm", authMiddleware, whatsappEmbeddedRoutes);
app.use("/api/crm", authMiddleware, envioMasivoWhatsappRoutes, envioPersonaRoutes);
app.use('/api/assistant', messageProcessingRoutes);
app.use('/api/kpi', authMiddleware, kpiRoutes);
app.use("/api/crm", authMiddleware, ticketRoutes);
app.use("/api/tickets-ext", ticketExternoRoutes);
app.use("/api/system", authMiddleware, systemRoutes);


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
