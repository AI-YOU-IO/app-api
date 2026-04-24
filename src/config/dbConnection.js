const { Pool, types } = require('pg');
const logger = require('./logger/loggerClient');

// TIMESTAMP WITHOUT TIMEZONE (OID 1114): retorna string ISO sin Z para que el
// frontend lo trate como hora Lima local, sin conversión UTC automática
types.setTypeParser(1114, str => str ? str.replace(' ', 'T') : null);

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
    max: 20,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    ssl: {
        rejectUnauthorized: false // Para conexiones a RDS
    }
});

// Manejar errores de conexiones idle en el pool
pool.on('error', (err) => {
    logger.error(`[dbConnection.js] Error inesperado en conexión idle del pool: ${err.message}`);
});

// Fijar timezone Lima en cada conexión para que CURRENT_TIMESTAMP y los
// timestamps devueltos por el driver usen la misma hora que el usuario ve
pool.on('connect', (client) => {
    client.query("SET timezone = 'America/Lima'");
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

// Wrapper para mantener compatibilidad con mysql2 (execute/query -> pg query)
const executeQuery = async (sql, params = [], retries = 1) => {
    // Convertir placeholders de MySQL (?) a PostgreSQL ($1, $2, ...)
    let paramIndex = 0;
    let pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

    // Convertir INSERT IGNORE a INSERT ... ON CONFLICT DO NOTHING
    pgSql = pgSql.replace(/INSERT IGNORE INTO/gi, 'INSERT INTO');
    const isInsertIgnore = /INSERT IGNORE/i.test(sql);
    if (isInsertIgnore) {
        // Agregar ON CONFLICT DO NOTHING al final del INSERT (antes del RETURNING si existe)
        if (!pgSql.includes('ON CONFLICT')) {
            pgSql = pgSql.replace(/(VALUES\s*\([^)]+\))/i, '$1 ON CONFLICT DO NOTHING');
        }
    }

    // Para INSERT, agregar RETURNING id si no existe
    const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
    if (isInsert && !pgSql.toLowerCase().includes('returning')) {
        pgSql = pgSql.trim().replace(/;?\s*$/, ' RETURNING id');
    }

    let result;
    try {
        result = await pool.query(pgSql, params);
    } catch (error) {
        // Reintentar si la conexión se terminó inesperadamente
        if (retries > 0 && (error.message.includes('Connection terminated unexpectedly') || error.message.includes('connection terminated'))) {
            logger.warn(`[dbConnection.js] Conexión perdida, reintentando query...`);
            return executeQuery(sql, params, retries - 1);
        }
        throw error;
    }

    // Mapear propiedades de MySQL a PostgreSQL
    const mysqlCompatResult = {
        ...result,
        affectedRows: result.rowCount,
        insertId: result.rows && result.rows.length > 0 ? result.rows[0].id : null
    };

    // mysql2 retorna [rows, fields] para SELECTs, pero [ResultSetHeader, undefined] para INSERT/UPDATE/DELETE.
    // Los models hacen `const [result] = ...` y esperan:
    //   - SELECTs: result = rows
    //   - INSERT/UPDATE/DELETE: result = { insertId, affectedRows }
    const isSelect = /^\s*(SELECT|WITH)\b/i.test(sql);
    if (isSelect) {
        return [result.rows, mysqlCompatResult];
    }
    return [mysqlCompatResult, undefined];
};

// Wrapper del pool con métodos execute y query compatibles
const poolWrapper = {
    query: executeQuery,
    execute: executeQuery,
    connect: pool.connect.bind(pool),
    end: pool.end.bind(pool),
    on: pool.on.bind(pool)
};

module.exports = {
    pool: poolWrapper,
    testConnection
};
