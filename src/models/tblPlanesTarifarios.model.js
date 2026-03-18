const { pool } = require("../config/dbConnection.js");

class TblPlanesTarifariosModel {

    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    /**
     * Obtiene todos los planes tarifarios activos
     * @param {number|null} id_empresa - ID de la empresa para filtrar
     * @returns {Promise<Array>} - Array de planes tarifarios
     */
    async getAllActivos(id_empresa = null) {
        try {
            let query = 'SELECT * FROM catalogo WHERE estado_registro = 1';
            const params = [];

            if (id_empresa) {
                query += ' AND id_empresa = ?';
                params.push(id_empresa);
            }

            query += ' ORDER BY precio_promocional ASC';

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener planes activos: ${error.message}`);
        }
    }

    /**
     * Obtiene todos los planes tarifarios (activos e inactivos)
     * @param {number|null} id_empresa - ID de la empresa para filtrar
     * @returns {Promise<Array>} - Array de planes tarifarios
     */
    async getAll(id_empresa = null) {
        try {
            let query = 'SELECT * FROM catalogo WHERE 1=1';
            const params = [];

            if (id_empresa) {
                query += ' AND id_empresa = ?';
                params.push(id_empresa);
            }

            query += ' ORDER BY precio_promocional ASC';

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener planes: ${error.message}`);
        }
    }

    async getPlanPrincipal(id_empresa = null) {
        try {
            let query = 'SELECT * FROM catalogo WHERE principal = 1';
            const params = [];

            if (id_empresa) {
                query += ' AND id_empresa = ?';
                params.push(id_empresa);
            }

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener planes: ${error.message}`);
        }
    }

    /**
     * Obtiene planes por tipo (prepago, postpago o portabilidad)
     * @param {string} nombre - Nombre del plan
     * @param {number|null} id_empresa - ID de la empresa para filtrar
     * @returns {Promise<number>} - ID del plan
     */
    async getIdByNombre(nombre, id_empresa = null) {
        try {
            let query = 'SELECT * FROM catalogo WHERE nombre = ?';
            const params = [nombre];

            if (id_empresa) {
                query += ' AND id_empresa = ?';
                params.push(id_empresa);
            }

            const [rows] = await this.connection.execute(query, params);
            return rows[0]?.id;
        } catch (error) {
            throw new Error(`Error al obtener planes por tipo: ${error.message}`);
        }
    }

    /**
     * Obtiene planes de portabilidad activos (ordenados del más caro al más barato para mostrar el Premium primero)
     * @param {number|null} id_empresa - ID de la empresa para filtrar
     * @returns {Promise<Array>} - Array de planes de portabilidad
     */
    async getPlanesPortabilidad(id_empresa = null) {
        try {
            let query = 'SELECT * FROM catalogo WHERE tipo_plan = "portabilidad" AND estado_registro = 1';
            const params = [];

            if (id_empresa) {
                query += ' AND id_empresa = ?';
                params.push(id_empresa);
            }

            query += ' ORDER BY precio_promocional DESC';

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener planes de portabilidad: ${error.message}`);
        }
    }

    /**
     * Obtiene un plan tarifario por ID
     * @param {number} id - ID del plan
     * @returns {Promise<Object|null>} - Objeto del plan o null si no existe
     */
    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM catalogo WHERE id = ?',
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener plan por ID: ${error.message}`);
        }
    }

    /**
     * Crea un nuevo item en el catálogo
     * @param {Object} plan - Datos del item
     * @returns {Promise<number>} - ID del item creado
     */
    async create({
        nombre,
        precio_regular,
        precio_promocional = null,
        descripcion = null,
        principal = 1,
        imagen_url = null,
        estado_registro = 1,
        id_empresa = null
    }) {
        try {
            // Asegurar que no haya undefined - convertir a null
            const params = [
                nombre,
                precio_regular,
                precio_promocional ?? null,
                descripcion ?? null,
                principal ?? 1,
                imagen_url ?? null,
                estado_registro ?? 1,
                id_empresa ?? null
            ];

            const [result] = await this.connection.execute(
                `INSERT INTO catalogo
                (nombre, precio_regular, precio_promocional, descripcion, principal, imagen_url, estado_registro, id_empresa)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                params
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear item: ${error.message}`);
        }
    }

    /**
     * Actualiza un item del catálogo
     * @param {number} id - ID del item
     * @param {Object} plan - Datos a actualizar
     * @returns {Promise<boolean>} - true si se actualizó correctamente
     */
    async update(id, {
        nombre,
        precio_regular,
        precio_promocional,
        descripcion,
        principal,
        imagen_url,
        usuario_actualizacion = null
    }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE catalogo
                SET nombre = ?, precio_regular = ?, precio_promocional = ?, descripcion = ?, principal = ?, imagen_url = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [nombre, precio_regular, precio_promocional, descripcion, principal, imagen_url, usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar item: ${error.message}`);
        }
    }

    /**
     * Desactiva un item del catálogo (soft delete)
     * @param {number} id - ID del item
     * @returns {Promise<boolean>} - true si se desactivó correctamente
     */
    async softDelete(id, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE catalogo SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?',
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al desactivar item: ${error.message}`);
        }
    }

}

module.exports = TblPlanesTarifariosModel;
