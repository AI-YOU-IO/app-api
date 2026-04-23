require('dotenv').config();
const { pool } = require('../src/config/dbConnection');

async function run() {
  try {
    // Envios masivos whatsapp con al menos 1 registro que tenga link_pago
    const [envios] = await pool.execute(
      `SELECT emw.id, emw.titulo, emw.descripcion, emw.id_empresa, emw.fecha_registro,
              emw.cantidad_exitosos, emw.cantidad_fallidos,
              COUNT(DISTINCT p.id)::int AS personas_con_link
       FROM envio_masivo_whatsapp emw
       INNER JOIN envio_base eb ON eb.id_envio_masivo = emw.id AND eb.estado_registro = 1
       INNER JOIN base_numero_detalle bnd ON bnd.id = eb.id_base
       INNER JOIN persona p ON p.id_ref_base_num_detalle = bnd.id AND p.id_empresa = emw.id_empresa
       INNER JOIN link_pago lp ON lp.id_persona = p.id AND lp.id_empresa = p.id_empresa
       GROUP BY emw.id, emw.titulo, emw.descripcion, emw.id_empresa, emw.fecha_registro,
                emw.cantidad_exitosos, emw.cantidad_fallidos
       ORDER BY personas_con_link DESC, emw.id DESC
       LIMIT 10`
    );

    console.log('\n=== Top 10 envíos masivos WhatsApp con link de pago ===');
    if (envios.length === 0) {
      console.log('⚠️  No hay envíos masivos con link_pago asociado.');
    } else {
      console.table(envios);
    }

    // Ejecuciones de llamadas con link_pago
    const [ejec] = await pool.execute(
      `SELECT ce.id AS ejecucion_id, ca.nombre AS campania_nombre,
              ce.fecha_registro, ca.id_empresa,
              COUNT(DISTINCT p.id)::int AS personas_con_link,
              COUNT(DISTINCT l.id)::int AS total_llamadas
       FROM campania_ejecucion ce
       INNER JOIN campania ca ON ca.id = ce.id_campania
       INNER JOIN llamada l ON l.id_campania_ejecucion = ce.id AND l.estado_registro = 1
       INNER JOIN base_numero_detalle bnd ON bnd.id = l.id_base_numero_detalle
       INNER JOIN persona p ON p.id_ref_base_num_detalle = bnd.id AND p.id_empresa = l.id_empresa
       INNER JOIN link_pago lp ON lp.id_persona = p.id AND lp.id_empresa = p.id_empresa
       GROUP BY ce.id, ca.nombre, ce.fecha_registro, ca.id_empresa
       ORDER BY personas_con_link DESC, ce.id DESC
       LIMIT 10`
    );

    console.log('\n=== Top 10 ejecuciones de llamadas con link de pago ===');
    if (ejec.length === 0) {
      console.log('⚠️  No hay ejecuciones de llamadas con link_pago asociado.');
    } else {
      console.table(ejec);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();
