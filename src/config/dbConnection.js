const { Pool } = require('pg');
const logger = require('./logger/loggerClient');

// Validar variables de entorno requeridas
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    logger.error(`[dbConnection.js] Faltan variables de entorno requeridas: ${missingVars.join(', ')}`);
    process.exit(1);
}

// Configuración optimizada para PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    max: 20, // Máximo de conexiones simultáneas
    idleTimeoutMillis: 60000, // Timeout para conexiones idle
    connectionTimeoutMillis: 10000, // Timeout para conexión
    ssl: {
        rejectUnauthorized: false // Para conexiones a RDS
    }
});

// Función para verificar conexión
const testConnection = async () => {
    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        logger.info(`[dbConnection.js] ✅ Conexión a PostgreSQL verificada correctamente. BD: ${process.env.DB_NAME}`);
    } catch (error) {
        throw new Error(`[dbConnection.js] ❌ Error verificando conexión a PostgreSQL: ${error.message}`);
    }
};

// Wrapper para mantener compatibilidad con mysql2 (execute -> query)
const execute = async (sql, params = []) => {
    // Convertir placeholders de MySQL (?) a PostgreSQL ($1, $2, ...)
    let paramIndex = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

    const result = await pool.query(pgSql, params);
    return [result.rows, result];
};

// Wrapper del pool con método execute compatible
const poolWrapper = {
    query: pool.query.bind(pool),
    execute: execute,
    connect: pool.connect.bind(pool),
    end: pool.end.bind(pool),
    on: pool.on.bind(pool)
};

module.exports = {
    pool: poolWrapper,
    testConnection
};
