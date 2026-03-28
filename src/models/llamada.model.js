const { pool } = require("../config/dbConnection.js");

class LlamadaModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll(id_empresa) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT l.*,
                        tl.nombre as tipificacion_llamada_nombre, tl.color as tipificacion_llamada_color,
                        ca.nombre as campania_nombre,
                        bnd.telefono, bnd.nombre as contacto_nombre, bnd.numero_documento,
                        ce.id as id_campania_ejecucion_rel,
                        el.nombre as estado_llamada_nombre, el.color as estado_llamada_color
                FROM llamada l
                LEFT JOIN tipificacion_llamada tl ON tl.id = l.id_tipificacion_llamada
                LEFT JOIN campania ca ON ca.id = l.id_campania
                LEFT JOIN base_numero_detalle bnd ON bnd.id = l.id_base_numero_detalle
                LEFT JOIN campania_ejecucion ce ON ce.id = l.id_campania_ejecucion
                LEFT JOIN estado_llamada el ON el.id = l.id_estado_llamada
                WHERE l.id_empresa = ? AND l.estado_registro = 1
                ORDER BY l.fecha_registro DESC`,
                [id_empresa]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener llamadas: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT l.*,
                        tl.nombre as tipificacion_llamada_nombre, tl.color as tipificacion_llamada_color,
                        ca.nombre as campania_nombre,
                        bnd.telefono, bnd.nombre as contacto_nombre, bnd.numero_documento,
                        ce.id as id_campania_ejecucion_rel,
                        el.nombre as estado_llamada_nombre, el.color as estado_llamada_color
                FROM llamada l
                LEFT JOIN tipificacion_llamada tl ON tl.id = l.id_tipificacion_llamada
                LEFT JOIN campania ca ON ca.id = l.id_campania
                LEFT JOIN base_numero_detalle bnd ON bnd.id = l.id_base_numero_detalle
                LEFT JOIN campania_ejecucion ce ON ce.id = l.id_campania_ejecucion
                LEFT JOIN estado_llamada el ON el.id = l.id_estado_llamada
                WHERE l.id = ? AND l.estado_registro = 1`,
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener llamada por ID: ${error.message}`);
        }
    }

    async getByProviderCallId(provider_call_id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM llamada
                WHERE provider_call_id = ? AND estado_registro = 1`,
                [provider_call_id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener llamada por provider_call_id: ${error.message}`);
        }
    }

    /**
     * Normaliza un teléfono quitando prefijos 51 y 021
     */
    normalizarTelefono(telefono) {
        let limpio = String(telefono).replace(/\D/g, '');
        // Quitar 51 al inicio (código país Perú)
        if (limpio.startsWith('51') && limpio.length > 9) {
            limpio = limpio.slice(2);
        }
        // Quitar 021 al inicio (código área Lima alternativo)
        if (limpio.startsWith('021')) {
            limpio = limpio.slice(3);
        }
        // Quitar 01 al inicio (código área Lima)
        if (limpio.startsWith('01') && limpio.length > 9) {
            limpio = limpio.slice(2);
        }
        return limpio;
    }

    /**
     * Busca una llamada pendiente (sin provider_call_id) por teléfono y campaña.
     * Usado para vincular llamadas creadas en batch con el channelId cuando inician.
     */
    async getPendientePorTelefonoCampania(telefono, id_campania) {
        try {
            // Normalizar teléfono de entrada
            const telefonoBase = this.normalizarTelefono(telefono);

            const [rows] = await this.connection.execute(
                `SELECT l.* FROM llamada l
                INNER JOIN base_numero_detalle bnd ON bnd.id = l.id_base_numero_detalle
                WHERE l.id_campania = $1
                AND l.provider_call_id IS NULL
                AND l.id_estado_llamada = 1
                AND l.estado_registro = 1
                AND (
                    -- Comparar el teléfono normalizado (últimos 9 dígitos)
                    RIGHT(REGEXP_REPLACE(bnd.telefono, '\\D', '', 'g'), 9) = RIGHT($2, 9)
                )
                ORDER BY l.fecha_registro DESC
                LIMIT 1`,
                [id_campania, telefonoBase]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener llamada pendiente: ${error.message}`);
        }
    }

    /**
     * Actualiza el provider_call_id de una llamada
     */
    async actualizarProviderCallId(id, provider_call_id) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada SET provider_call_id = ? WHERE id = ?`,
                [provider_call_id, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar provider_call_id: ${error.message}`);
        }
    }

    async getConfigByProviderCallId(provider_call_id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT l.id, l.id_empresa, l.id_campania, l.provider_call_id,
                        e.nombre_comercial as empresa_nombre, e.canal,
                        c.nombre as campania_nombre, c.id_plantilla, c.id_voz,
                        p.prompt, p.nombre as plantilla_nombre,
                        v.voice_code,
                        bnd.telefono, bnd.nombre as contacto_nombre, bnd.numero_documento, bnd.json_adicional
                FROM llamada l
                INNER JOIN empresa e ON e.id = l.id_empresa
                INNER JOIN campania c ON c.id = l.id_campania
                LEFT JOIN plantilla p ON p.id = c.id_plantilla
                LEFT JOIN voz v ON v.id = c.id_voz
                LEFT JOIN base_numero_detalle bnd ON bnd.id = l.id_base_numero_detalle
                WHERE l.provider_call_id = ? AND l.estado_registro = 1`,
                [provider_call_id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener config de llamada: ${error.message}`);
        }
    }

    async getByCampania(id_campania) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM llamada
                WHERE id_campania = ? AND estado_registro = 1
                ORDER BY fecha_registro DESC`,
                [id_campania]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener llamadas por campania: ${error.message}`);
        }
    }

    async getByCampaniaEjecucion(id_campania_ejecucion) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT 
                    l.*,
                    tl.nombre AS tipificacion_llamada_nombre,
                    tl.color AS tipificacion_llamada_color,
            
                    vt.nombre_nivel_1,
                    vt.nombre_nivel_2,
                    vt.nombre_nivel_3,
                    vt.nombre_tipificacion,
            
                    ca.nombre AS campania_nombre,
                    bnd.telefono,
                    bnd.nombre AS contacto_nombre,
                    bnd.numero_documento,
                    ce.id AS id_campania_ejecucion_rel,
                    el.nombre AS estado_llamada_nombre,
                    el.color AS estado_llamada_color,
                    (
                        SELECT COUNT(*)::integer
                        FROM transcripcion t
                        WHERE t.id_llamada = l.id
                          AND t.estado_registro = 1
                    ) AS tiene_transcripcion
                FROM llamada l
                LEFT JOIN tipificacion_llamada tl
                    ON tl.id = l.id_tipificacion_llamada
                LEFT JOIN public.vw_tipificacion_llamada_mapeada vt
                    ON vt.id_tipificacion::text = l.id_tipificacion_llamada::text
                   AND vt.id_empresa::text = l.id_empresa::text
                LEFT JOIN campania ca
                    ON ca.id = l.id_campania
                LEFT JOIN base_numero_detalle bnd
                    ON bnd.id = l.id_base_numero_detalle
                LEFT JOIN campania_ejecucion ce
                    ON ce.id = l.id_campania_ejecucion
                LEFT JOIN estado_llamada el
                    ON el.id = l.id_estado_llamada
                WHERE l.id_campania_ejecucion = ?
                  AND l.estado_registro = 1
                ORDER BY l.fecha_registro DESC`,
                [id_campania_ejecucion]
            );
            return rows;
        } catch (error) {
            console.error('❌ Error real en getByCampaniaEjecucion:', error);
            throw new Error(`Error al obtener llamadas por ejecucion: ${error.message}`);
        }
    }

    async getNextCodigoLlamada(id_empresa) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT COALESCE(MAX(codigo_llamada), 0) + 1 as next_codigo
                FROM llamada
                WHERE id_empresa = ?`,
                [id_empresa]
            );
            return rows[0].next_codigo;
        } catch (error) {
            throw new Error(`Error al obtener siguiente codigo de llamada: ${error.message}`);
        }
    }

    async create({ id_empresa, id_campania, id_base_numero, id_base_numero_detalle, id_campania_ejecucion, provider_call_id, usuario_registro = null }) {
        try {
            console.log(`[llamada.create] Iniciando - id_empresa: ${id_empresa}, id_campania: ${id_campania}, id_base_numero: ${id_base_numero}`);
            const codigo_llamada = await this.getNextCodigoLlamada(id_empresa);
            console.log(`[llamada.create] codigo_llamada: ${codigo_llamada}`);

            // Estado 1 = Pendiente, fecha_inicio = NULL (Asterisk enviará ANSWER para setear estado 2 y fecha_inicio)
            const [rows] = await this.connection.execute(
                `INSERT INTO llamada
                (id_empresa, id_campania, id_base_numero, id_base_numero_detalle, id_campania_ejecucion, provider_call_id, codigo_llamada, id_estado_llamada, fecha_inicio, fecha_registro, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, CURRENT_TIMESTAMP, 1, ?)
                RETURNING id`,
                [
                    id_empresa,
                    id_campania,
                    id_base_numero,
                    id_base_numero_detalle || null,
                    id_campania_ejecucion || null,
                    provider_call_id,
                    codigo_llamada,
                    usuario_registro
                ]
            );
            const id_llamada = rows[0]?.id;
            console.log(`[llamada.create] INSERT result - id_llamada: ${id_llamada}, codigo_llamada: ${codigo_llamada}`);
            return id_llamada;
        } catch (error) {
            if (error.code === '23505') {
                throw new Error('Ya existe una llamada con ese provider_call_id');
            }
            throw new Error(`Error al crear llamada: ${error.message}`);
        }
    }

    /**
     * Crea múltiples llamadas en una sola operación (bulk insert)
     * Luego hace SELECT para obtener los IDs generados
     * @param {Array} llamadas - Array de objetos con datos de llamada
     * @param {number} idEjecucion - ID de la ejecución para filtrar el SELECT
     * @returns {Array} Array de objetos { id_llamada, id_base_numero_detalle }
     */
    async bulkCreate(llamadas, idEjecucion) {
        if (!llamadas || llamadas.length === 0) return [];

        try {
            const id_empresa = llamadas[0].id_empresa;

            // Obtener el siguiente código base
            const [codigoRows] = await this.connection.execute(
                `SELECT COALESCE(MAX(codigo_llamada), 0) as max_codigo FROM llamada WHERE id_empresa = ?`,
                [id_empresa]
            );
            let nextCodigo = (codigoRows[0]?.max_codigo || 0) + 1;

            // Construir INSERT múltiple con placeholders PostgreSQL
            const values = [];
            const params = [];
            let paramIndex = 0;
            const detalleIds = [];

            for (const llamada of llamadas) {
                const placeholders = [];
                for (let j = 0; j < 8; j++) {
                    placeholders.push(`$${++paramIndex}`);
                }
                values.push(`(${placeholders.join(', ')})`);
                params.push(
                    llamada.id_empresa,
                    llamada.id_campania,
                    llamada.id_base_numero,
                    llamada.id_base_numero_detalle || null,
                    llamada.id_campania_ejecucion || null,
                    nextCodigo++,
                    1, // id_estado_llamada = Pendiente
                    llamada.usuario_registro || null
                );
                detalleIds.push(llamada.id_base_numero_detalle);
            }

            // 1. INSERT masivo sin RETURNING
            const sqlInsert = `
                INSERT INTO llamada
                (id_empresa, id_campania, id_base_numero, id_base_numero_detalle, id_campania_ejecucion, codigo_llamada, id_estado_llamada, usuario_registro)
                VALUES ${values.join(', ')}
            `;

            await this.connection.query(sqlInsert, params);

            // 2. SELECT para obtener los IDs de las llamadas recién creadas
            const placeholdersSelect = detalleIds.map((_, i) => `$${i + 2}`).join(',');
            const sqlSelect = `
                SELECT id, id_base_numero_detalle
                FROM llamada
                WHERE id_campania_ejecucion = $1
                AND id_estado_llamada = 1
                AND estado_registro = 1
                AND id_base_numero_detalle IN (${placeholdersSelect})
            `;

            const [rows] = await this.connection.query(sqlSelect, [idEjecucion, ...detalleIds]);

            console.log(`[llamada.bulkCreate] Insertadas y recuperadas ${rows.length} llamadas`);

            // Retornar array con id_llamada y id_base_numero_detalle para mapear
            return rows.map(row => ({
                id_llamada: row.id,
                id_base_numero_detalle: row.id_base_numero_detalle
            }));
        } catch (error) {
            console.error(`[llamada.bulkCreate] Error:`, error.message);
            throw new Error(`Error en bulk create de llamadas: ${error.message}`);
        }
    }

    async iniciarLlamada(provider_call_id) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET id_estado_llamada = 2,
                    fecha_inicio = CURRENT_TIMESTAMP
                WHERE provider_call_id = ? AND id_estado_llamada = 1`,
                [provider_call_id]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al iniciar llamada: ${err.message}`);
        }
    }

    async actualizarTipificacion(provider_call_id, id_tipificacion_llamada) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada SET id_tipificacion_llamada = ? WHERE provider_call_id = ?`,
                [id_tipificacion_llamada, provider_call_id]
            );

            return true;
        } catch (err) {
            throw new Error(`Error al actualizar tipificacion de llamada: ${err.message}`);
        }
    }

    async actualizarEstadoLlamada(provider_call_id, id_estado_llamada, fecha_fin = null) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET id_estado_llamada = ?,
                    fecha_fin = COALESCE(?, fecha_fin)
                WHERE provider_call_id = ? AND id_estado_llamada <> 3`,
                [id_estado_llamada, fecha_fin, provider_call_id]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar estado de llamada: ${err.message}`);
        }
    }

    async actualizarEstadoLlamadaDirecto(provider_call_id, id_estado_llamada) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET id_estado_llamada = ?
                WHERE provider_call_id = ?`,
                [id_estado_llamada, provider_call_id]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar estado de llamada: ${err.message}`);
        }
    }

    async actualizarEstadoNoContesta(provider_call_id, id_estado_llamada_asterisk) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET id_estado_llamada = 3,
                    id_estado_llamada_asterisk = ?
                WHERE provider_call_id = ?`,
                [id_estado_llamada_asterisk, provider_call_id]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar estado no contesta: ${err.message}`);
        }
    }

    async actualizarEstadoTerminada(provider_call_id) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET id_estado_llamada = 4,
                    fecha_fin = CURRENT_TIMESTAMP
                WHERE provider_call_id = ?`,
                [provider_call_id]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar estado terminada: ${err.message}`);
        }
    }

    async actualizarArchivoLlamada(id, archivo_llamada) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET archivo_llamada = ?,
                    id_estado_llamada = 3,
                    fecha_fin = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [archivo_llamada, id]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar archivo de llamada: ${err.message}`);
        }
    }

    async actualizarMetadataUltravox(id, { id_ultravox_call, metadata_ultravox_call }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET id_ultravox_call = COALESCE(?, id_ultravox_call),
                    metadata_ultravox_call = COALESCE(?, metadata_ultravox_call)
                WHERE id = ?`,
                [
                    id_ultravox_call || null,
                    metadata_ultravox_call || null,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar metadata ultravox: ${err.message}`);
        }
    }

    async actualizarEstadoAsterisk(provider_call_id, { id_estado_llamada_asterisk, id_estado_llamada, duracion_seg, fecha_fin }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET id_estado_llamada_asterisk = ?,
                    id_estado_llamada = ?,
                    fecha_inicio = COALESCE(fecha_inicio, CURRENT_TIMESTAMP),
                    duracion_seg = COALESCE(?, duracion_seg),
                    fecha_fin = COALESCE(?, fecha_fin)
                WHERE provider_call_id = ?`,
                [
                    id_estado_llamada_asterisk,
                    id_estado_llamada,
                    duracion_seg !== null && duracion_seg !== undefined ? duracion_seg : null,
                    fecha_fin || null,
                    provider_call_id
                ]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar estado asterisk: ${err.message}`);
        }
    }

    async actualizarAudioLlamadaPorProvider(provider_call_id, { archivo_llamada, id_ultravox_call, metadata_ultravox_call, id_estado_llamada_asterisk, duracion_seg }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET archivo_llamada = COALESCE(?, archivo_llamada),
                    id_ultravox_call = COALESCE(?, id_ultravox_call),
                    metadata_ultravox_call = COALESCE(?, metadata_ultravox_call),
                    id_estado_llamada_asterisk = COALESCE(?, id_estado_llamada_asterisk),
                    duracion_seg = COALESCE(?, duracion_seg)
                WHERE provider_call_id = ?`,
                [
                    archivo_llamada || null,
                    id_ultravox_call || null,
                    metadata_ultravox_call ? JSON.stringify(metadata_ultravox_call) : null,
                    id_estado_llamada_asterisk || null,
                    duracion_seg !== null && duracion_seg !== undefined ? duracion_seg : null,
                    provider_call_id
                ]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar audio de llamada: ${err.message}`);
        }
    }
    /**
     * Verifica si todas las llamadas de una ejecución ya terminaron (tienen fecha_fin o estado terminal)
     * @param {number} id_campania_ejecucion
     * @returns {Object} { total, terminadas, pendientes, completada: boolean }
     */
    async verificarEjecucionCompletada(id_campania_ejecucion) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT
                    COUNT(*)::integer as total,
                    COUNT(CASE WHEN fecha_fin IS NOT NULL OR id_estado_llamada IN (3, 4) THEN 1 END)::integer as terminadas,
                    COUNT(CASE WHEN fecha_fin IS NULL AND id_estado_llamada NOT IN (3, 4) THEN 1 END)::integer as pendientes
                FROM llamada
                WHERE id_campania_ejecucion = ? AND estado_registro = 1`,
                [id_campania_ejecucion]
            );

            const stats = rows[0];
            return {
                total: stats.total,
                terminadas: stats.terminadas,
                pendientes: stats.pendientes,
                completada: stats.total > 0 && stats.pendientes === 0
            };
        } catch (error) {
            throw new Error(`Error al verificar ejecución completada: ${error.message}`);
        }
    }

    /**
     * Obtiene estadísticas de llamadas de una ejecución
     * @param {number} id_campania_ejecucion
     * @returns {Object} { total, exitosas, fallidas, pendientes }
     */
    async getEstadisticasEjecucion(id_campania_ejecucion) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT
                    COUNT(*)::integer as total,
                    COUNT(CASE WHEN id_estado_llamada = 4 THEN 1 END)::integer as exitosas,
                    COUNT(CASE WHEN id_estado_llamada = 3 THEN 1 END)::integer as fallidas,
                    COUNT(CASE WHEN id_estado_llamada IN (1, 2) THEN 1 END)::integer as pendientes
                FROM llamada
                WHERE id_campania_ejecucion = ? AND estado_registro = 1`,
                [id_campania_ejecucion]
            );
            return rows[0];
        } catch (error) {
            throw new Error(`Error al obtener estadísticas de ejecución: ${error.message}`);
        }
    }
}

module.exports = LlamadaModel;
