require('dotenv').config();
const { pool } = require('../src/config/dbConnection');

async function run() {
  try {
    // 1. Contar registros en link_pago
    const [lp] = await pool.execute(`SELECT COUNT(*)::int AS total FROM link_pago`);
    console.log('\n=== 1) Total registros en link_pago ===');
    console.log(lp[0]);

    // 2. Sample de link_pago
    const [lpSample] = await pool.execute(
      `SELECT id, id_persona, id_empresa, id_chat, link, fecha_registro
       FROM link_pago ORDER BY id DESC LIMIT 5`
    );
    console.log('\n=== 2) Últimos 5 registros de link_pago ===');
    console.table(lpSample);

    // 3. ¿Qué empresas tienen link_pago?
    const [lpEmpresas] = await pool.execute(
      `SELECT id_empresa, COUNT(*)::int AS total
       FROM link_pago
       GROUP BY id_empresa ORDER BY total DESC`
    );
    console.log('\n=== 3) link_pago por empresa ===');
    console.table(lpEmpresas);

    // 4. ¿Cuántas personas tienen id_ref_base_num_detalle?
    const [p1] = await pool.execute(
      `SELECT COUNT(*)::int AS total_personas_con_ref
       FROM persona WHERE id_ref_base_num_detalle IS NOT NULL`
    );
    console.log('\n=== 4) Personas con id_ref_base_num_detalle ===');
    console.log(p1[0]);

    // 5. Personas con link_pago (debería haber intersección)
    const [p2] = await pool.execute(
      `SELECT COUNT(DISTINCT p.id)::int AS personas_con_link
       FROM persona p
       INNER JOIN link_pago lp ON lp.id_persona = p.id AND lp.id_empresa = p.id_empresa`
    );
    console.log('\n=== 5) Personas con link_pago (JOIN por id_persona + id_empresa) ===');
    console.log(p2[0]);

    // 6. Verificar JOIN persona ↔ base_numero_detalle para un envío masivo de wsp
    const [envioIds] = await pool.execute(
      `SELECT id FROM envio_masivo_whatsapp ORDER BY id DESC LIMIT 1`
    );

    if (envioIds.length === 0) {
      console.log('\n⚠️  No hay envios masivos whatsapp para probar.');
    } else {
      const envioId = envioIds[0].id;
      console.log(`\n=== 6) Diagnóstico con envio_masivo_whatsapp id=${envioId} ===`);

      const [diag] = await pool.execute(
        `SELECT
          eb.id AS envio_base_id,
          bnd.id AS bnd_id,
          bnd.telefono,
          bnd.json_adicional IS NOT NULL AS tiene_json,
          (bnd.json_adicional->>'grupo_familiar') AS grupo_familiar,
          p.id AS persona_id,
          p.id_empresa AS persona_empresa,
          p.lista_negra,
          EXISTS(
            SELECT 1 FROM link_pago lp
            WHERE lp.id_persona = p.id AND lp.id_empresa = p.id_empresa
          ) AS se_envio_link
        FROM envio_base eb
        LEFT JOIN base_numero_detalle bnd ON eb.id_base = bnd.id
        LEFT JOIN persona p ON p.id_ref_base_num_detalle = bnd.id
        WHERE eb.id_envio_masivo = $1 AND eb.estado_registro = 1
        LIMIT 10`,
        [envioId]
      );
      console.table(diag);
    }

    // 7. ¿Cuántos registros de persona tienen lista_negra=true?
    const [ln] = await pool.execute(
      `SELECT COUNT(*)::int AS total FROM persona WHERE lista_negra = true`
    );
    console.log('\n=== 7) Personas en lista negra ===');
    console.log(ln[0]);

    // 8. ¿Cuántos base_numero_detalle tienen grupo_familiar en json_adicional?
    const [gf] = await pool.execute(
      `SELECT COUNT(*)::int AS total
       FROM base_numero_detalle
       WHERE json_adicional->>'grupo_familiar' IS NOT NULL
         AND json_adicional->>'grupo_familiar' != ''`
    );
    console.log('\n=== 8) Detalles con grupo_familiar en JSON ===');
    console.log(gf[0]);

    // 9. Sample de grupo_familiar values
    const [gfSample] = await pool.execute(
      `SELECT id, telefono, (json_adicional->>'grupo_familiar') AS grupo_familiar
       FROM base_numero_detalle
       WHERE json_adicional->>'grupo_familiar' IS NOT NULL
       LIMIT 5`
    );
    console.log('\n=== 9) Muestra de grupo_familiar ===');
    console.table(gfSample);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();
