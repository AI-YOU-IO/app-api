require('dotenv/config');

const app = require('./app.js');

const connectDB = require('./config/dbConnection');
const { connectRedis } = require('./config/redis');

const logger = require('./config/logger/loggerClient');
const { iniciarCronSentimiento } = require('./cron/analisisSentimiento.cron.js');

const PORT = process.env.PORT || 3000;

// Iniciar servidor
const startServer = async () => {
  // Probar conexión a la base de datos
  try {
    await connectDB.testConnection();
  } catch (error) {
    logger.error(`[server.js] ⚠️ MySQL no disponible: ${error.message}`);
  }

  // Iniciar servidor aunque falle la conexión
  const server = app.listen(PORT, () => {
    logger.info(`[server.js] 🚀 Server running on http://localhost:${PORT}`);
  });

    // Conectar a Redis
  try {
    await connectRedis();
    logger.info(`[server.js] Redis verificado`);
  } catch (error) {
    logger.error(`[server.js] Redis no disponible: ${error.message}`);
  }

  // Aumentar timeout para uploads grandes (30 minutos)
  server.timeout = 1800000;
  server.keepAliveTimeout = 1800000;
  server.headersTimeout = 1805000;

  // Iniciar cron de análisis de sentimiento
  iniciarCronSentimiento();
};

startServer();
