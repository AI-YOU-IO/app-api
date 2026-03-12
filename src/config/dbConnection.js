const mysql = require('mysql2/promise');
const logger = require('./logger/loggerClient');

// Validar variables de entorno requeridas
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    logger.error(`[dbConnection.js] Faltan variables de entorno requeridas: ${missingVars.join(', ')}`);
    process.exit(1);
}

// Configuración optimizada para alta carga de escrituras y lecturas
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 20, //  Más conexiones simultáneas
    maxIdle: 20, // max idle connections, igual que connectionLimit
    idleTimeout: 60000, // idle connections timeout, en milisegundos
    queueLimit: 0, // Sin límite en la cola
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: 'utf8mb4', // Soporte completo para Unicode,
    // Como string las fechas DATE/DATETIME
    dateStrings: true,
    timezone: "-05:00"
});

// Función para verificar conexión
const testConnection = async () => {
    try {
        // Usar una consulta simple para verificar la conexión
        await pool.execute('SELECT 1');
        logger.info(`[dbConnection.js] ✅ Conexión a MySQL verificada correctamente. BD: ${process.env.DB_NAME}`);
    } catch (error) {
        throw new Error('[dbConnection.js] ❌ Error verificando conexión a MySQL:', error.message);
    }
};

module.exports = {
    pool,
    testConnection
};
