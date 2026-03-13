const { pool } = require("../config/dbConnection.js");

// Función para obtener fecha en formato MySQL con zona horaria Lima, Perú
const getFechaLima = () => {
    const options = {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-CA', options);
    const parts = formatter.formatToParts(new Date());
    const get = (type) => parts.find(p => p.type === type)?.value || '00';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
};

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
                WHERE l.id_campania_ejecucion = ? AND l.estado_registro = 1
                ORDER BY l.fecha_registro DESC`,
                [id_campania_ejecucion]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener llamadas por ejecucion: ${error.message}`);
        }
    }

    async getNextCodigoLlamada(id_empresa) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT COALESCE(MAX(codigo_llamada), 0) + 1 as next_codigo
                FROM llamada
                WHERE id_empresa = ?
                FOR UPDATE`,
                [id_empresa]
            );
            return rows[0].next_codigo;
        } catch (error) {
            throw new Error(`Error al obtener siguiente codigo de llamada: ${error.message}`);
        }
    }

    async create({ id_empresa, id_campania, id_base_numero, id_base_numero_detalle, id_campania_ejecucion, provider_call_id, usuario_registro = null }) {
        try {
            const codigo_llamada = await this.getNextCodigoLlamada(id_empresa);

            // Fecha inicio con zona horaria Lima, Perú (UTC-5) en formato MySQL
            const fecha_inicio = getFechaLima();

            const [result] = await this.connection.execute(
                `INSERT INTO llamada
                (id_empresa, id_campania, id_base_numero, id_base_numero_detalle, id_campania_ejecucion, provider_call_id, codigo_llamada, id_estado_llamada, fecha_inicio, estado_registro, usuario_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?, 1, ?)`,
                [
                    id_empresa,
                    id_campania,
                    id_base_numero,
                    id_base_numero_detalle || null,
                    id_campania_ejecucion || null,
                    provider_call_id,
                    codigo_llamada,
                    fecha_inicio,
                    usuario_registro
                ]
            );
            return result.insertId;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Ya existe una llamada con ese provider_call_id');
            }
            throw new Error(`Error al crear llamada: ${error.message}`);
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
                WHERE provider_call_id = ?`,
                [id_estado_llamada, fecha_fin, provider_call_id]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar estado de llamada: ${err.message}`);
        }
    }

    async actualizarArchivoLlamada(id, archivo_llamada) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET archivo_llamada = ?,
                    id_estado_llamada = 3,
                    fecha_fin = NOW()
                WHERE id = ?`,
                [archivo_llamada, id]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar archivo de llamada: ${err.message}`);
        }
    }

    async actualizarMetadataUltravox(id, { id_ultravox_call, metadata_ultravox_call, fecha_fin, duracion_seg }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET id_ultravox_call = COALESCE(?, id_ultravox_call),
                    metadata_ultravox_call = COALESCE(?, metadata_ultravox_call),
                    fecha_fin = COALESCE(?, fecha_fin),
                    duracion_seg = ?,
                    id_estado_llamada = 4
                WHERE id = ?`,
                [
                    id_ultravox_call || null,
                    metadata_ultravox_call || null,
                    fecha_fin || null,
                    duracion_seg !== null && duracion_seg !== undefined ? duracion_seg : null,
                    id
                ]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar metadata ultravox: ${err.message}`);
        }
    }

    async actualizarAudioLlamadaPorProvider(provider_call_id, { archivo_llamada, id_ultravox_call, metadata_ultravox_call }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE llamada
                SET archivo_llamada = COALESCE(?, archivo_llamada),
                    id_ultravox_call = COALESCE(?, id_ultravox_call),
                    metadata_ultravox_call = COALESCE(?, metadata_ultravox_call)
                WHERE provider_call_id = ?`,
                [
                    archivo_llamada || null,
                    id_ultravox_call || null,
                    metadata_ultravox_call ? JSON.stringify(metadata_ultravox_call) : null,
                    provider_call_id
                ]
            );
            return result.affectedRows > 0;
        } catch (err) {
            throw new Error(`Error al actualizar audio de llamada: ${err.message}`);
        }
    }
}

module.exports = LlamadaModel;
