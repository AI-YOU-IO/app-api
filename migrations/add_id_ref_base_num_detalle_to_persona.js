/**
 * Migración: Agregar campo id_ref_base_num_detalle a tabla persona
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Ejecutando migración: Agregar id_ref_base_num_detalle a persona...');

        await client.query(`
            ALTER TABLE persona
            ADD COLUMN IF NOT EXISTS id_ref_base_num_detalle INTEGER REFERENCES base_numero_detalle(id)
        `);

        console.log('Migración completada exitosamente.');
    } catch (error) {
        console.error('Error en migración:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

migrate().catch(console.error);
