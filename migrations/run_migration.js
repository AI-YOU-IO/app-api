/**
 * Script para ejecutar migraciones SQL
 * Uso: node migrations/run_migration.js migrations/add_estado_llamada_asterisk.sql
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

async function runMigration(sqlFile) {
    const filePath = path.resolve(sqlFile);

    if (!fs.existsSync(filePath)) {
        console.error(`❌ Archivo no encontrado: ${filePath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`🔄 Ejecutando migración: ${sqlFile}`);
    console.log('---');

    try {
        await pool.query(sql);
        console.log('✅ Migración ejecutada exitosamente');
    } catch (error) {
        console.error('❌ Error en migración:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

const sqlFile = process.argv[2];
if (!sqlFile) {
    console.log('Uso: node migrations/run_migration.js <archivo.sql>');
    process.exit(1);
}

runMigration(sqlFile);
