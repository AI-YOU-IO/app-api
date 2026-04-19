const { pool } = require("../config/dbConnection.js");
const logger = require('../config/logger/loggerClient.js');

class PersonaModel {

    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                "SELECT * FROM persona WHERE id = ? AND estado_registro = 1",
                [id]
            );
            return rows[0];
        } catch (error) {
            throw new Error(`Error al obtener persona: ${error.message}`);
        }
    }

    async selectByCelular(phone, id_empresa = null) {
        try {
            let query = `SELECT p.id, p.nombre_completo, p.dni, p.celular, p.id_tipificacion, p.id_tipificacion_llamada, p.id_estado, bnd.json_adicional
                FROM persona p
                LEFT JOIN base_numero_detalle bnd ON bnd.id = p.id_ref_base_num_detalle
                WHERE p.celular = ? AND p.estado_registro = 1`;

            const params = [phone];

            if (id_empresa) {
                query += ` AND p.id_empresa = ?`;
                params.push(id_empresa);
            }

            const [rows] = await this.connection.execute(query, params);

            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al buscar registro: ${error.message}`);
        }
    }


    /**
     * Crea un nuevo registro de persona
     */
    async createPersona({ id_estado, celular, id_usuario, id_empresa, usuario_registro, id_tipo_persona = 1, nombre_completo, dni, direccion, id_tipificacion, id_catalogo, id_ref_base_num_detalle }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO persona (id_estado, celular, id_usuario, id_empresa, id_tipo_persona, usuario_registro, usuario_actualizacion, nombre_completo, dni, direccion, id_tipificacion, id_catalogo, id_ref_base_num_detalle)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id_estado, celular, id_usuario || null, id_empresa, id_tipo_persona, usuario_registro, usuario_registro, nombre_completo || null, dni || null, direccion || null, id_tipificacion || null, id_catalogo || null, id_ref_base_num_detalle || null]
            );

            const [rows] = await this.connection.execute(
                `SELECT * FROM persona WHERE id = ? AND estado_registro = 1`,
                [result.insertId]
            );

            return rows[0];
        } catch (error) {
            throw new Error(`Error al crear persona: ${error.message}`);
        }
    }

    static UPDATABLE_FIELDS = [
        'id_estado', 'id_usuario', 'nombre_completo', 'dni', 'direccion',
        'celular', 'id_tipificacion', 'id_empresa', 'id_tipo_persona',
        'id_catalogo', 'fue_prospecto', 'usuario_actualizacion', 'id_ref_base_num_detalle', "lista_negra"
    ];

    // Campos que no pueden ser null en la BD
    static NOT_NULL_FIELDS = ['id_estado', 'id_empresa'];

    // Campos del frontend que se mapean a columnas reales de la BD
    static FIELD_MAP = {
        'id_tipificacion_asesor': 'id_tipificacion',
        'id_asesor': 'id_usuario',
        'id_plan': 'id_catalogo',
    };

    async updatePersona(id, data) {
        try {
            if (!data.usuario_actualizacion) {
                data.usuario_actualizacion = null;
            }

            const fields = [];
            const values = [];
            const resolved = {};

            // Primero campos directos, luego los mapeados los sobreescriben (mayor prioridad)
            for (const [key, value] of Object.entries(data)) {
                const dbKey = PersonaModel.FIELD_MAP[key] || key;
                if (!PersonaModel.UPDATABLE_FIELDS.includes(dbKey)) continue;
                const isMapped = key in PersonaModel.FIELD_MAP;
                // Los campos mapeados tienen prioridad sobre los directos
                if (!(dbKey in resolved) || isMapped) {
                    resolved[dbKey] = value === '' ? null : (value ?? null);
                }
            }

            // Si cambia a Cliente (id_tipo_persona = 2), marcar fue_prospecto automáticamente
            if (parseInt(resolved.id_tipo_persona) === 2 && !('fue_prospecto' in resolved)) {
                const [rows] = await this.connection.execute(
                    'SELECT id_tipo_persona FROM persona WHERE id = ?', [id]
                );
                if (rows[0]?.id_tipo_persona === 1) {
                    resolved.fue_prospecto = 1;
                }
            }

            for (const [dbKey, value] of Object.entries(resolved)) {
                // Omitir campos NOT NULL si el valor es null
                if (value === null && PersonaModel.NOT_NULL_FIELDS.includes(dbKey)) continue;
                fields.push(`${dbKey} = ?`);
                values.push(value);
            }

            if (fields.length === 0) {
                throw new Error('No se proporcionaron campos válidos para actualizar');
            }

            values.push(id);

            const query = `UPDATE persona SET ${fields.join(', ')} WHERE id = ?`;
            const [result] = await this.connection.execute(query, values);

            if (result.affectedRows === 0) {
                throw new Error('Persona no encontrada');
            }

            return true;
        } catch (error) {
            logger.error(`[persona.model.js] Error al actualizar persona: ${error.message}`);
            throw new Error(`Error al actualizar persona: ${error.message}`);
        }
    }

    /**
     * Obtiene todas las personas filtradas por tipo_usuario, con filtros de rol y empresa
     */
    async getAllByTipoUsuario(userId = null, rolId = null, idEmpresa = null) {
        try {
            let query = `
                SELECT p.*,
                       e.nombre as estado_nombre, e.color as estado_color,
                       t.nombre as tipificacion_nombre, t.color as tipificacion_color,
                       t.nombre as tipificacion_asesor_nombre, t.color as tipificacion_asesor_color,
                       c.nombre as plan_nombre,
                       u.username as asesor_nombre
                FROM persona p
                LEFT JOIN estado e ON e.id = p.id_estado
                LEFT JOIN tipificacion t ON t.id = p.id_tipificacion
                LEFT JOIN catalogo c ON c.id = p.id_catalogo
                LEFT JOIN usuario u ON u.id = p.id_usuario
                WHERE p.estado_registro = 1`;
            const params = [];

            if (idEmpresa) {
                query += ' AND p.id_empresa = ?';
                params.push(idEmpresa);
            }

            if (rolId && rolId >= 3 && userId) {
                query += ' AND p.id_usuario = ?';
                params.push(userId);
            }

            query += ' ORDER BY p.fecha_registro DESC';

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener personas: ${error.message}`);
        }
    }

    async getAllClientes(userId = null, rolId = null, idEmpresa = null) {
        try {
            let query = `
                SELECT p.*,
                       e.nombre as estado_nombre, e.color as estado_color,
                       t.nombre as tipificacion_nombre, t.color as tipificacion_color,
                       c.nombre as plan_nombre,
                       u.username as asesor_nombre
                FROM persona p
                LEFT JOIN estado e ON e.id = p.id_estado
                LEFT JOIN tipificacion t ON t.id = p.id_tipificacion
                LEFT JOIN catalogo c ON c.id = p.id_catalogo
                LEFT JOIN usuario u ON u.id = p.id_usuario
                WHERE p.estado_registro = 1
                AND p.id_tipo_persona = 2`;
            const params = [];

            if (idEmpresa) {
                query += ' AND p.id_empresa = ?';
                params.push(idEmpresa);
            }

            if (rolId && rolId >= 3 && userId) {
                query += ' AND p.id_usuario = ?';
                params.push(userId);
            }

            query += ' ORDER BY p.fecha_registro DESC';

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener clientes: ${error.message}`);
        }
    }

    async getListaNegra(idEmpresa = null) {
        try {
            const query = `
                SELECT p.id, p.nombre_completo, p.dni, p.celular, p.direccion,
                       p.lista_negra, p.fecha_registro, p.fecha_actualizacion,
                       e.nombre as estado_nombre, e.color as estado_color,
                       u.username as asesor_nombre
                FROM persona p
                LEFT JOIN estado e ON e.id = p.id_estado
                LEFT JOIN usuario u ON u.id = p.id_usuario
                WHERE p.lista_negra = true AND p.estado_registro = 1
                ORDER BY p.fecha_actualizacion DESC`;

            const [rows] = await this.connection.execute(query, []);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener lista negra: ${error.message}`);
        }
    }

    async getAsignacionesAsesor() {
        try {
            const [rows] = await this.connection.execute(
                'SELECT id_usuario FROM persona WHERE estado_registro = 1 ORDER BY fecha_registro DESC LIMIT 1',
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener asignaciones por tipo: ${error.message}`);
        }
    }
}

module.exports = new PersonaModel();
