/* Segun lo que dice nicolas faq ya no se usara, se usara bd vectorial, ft. Fabrizio Diaz */

const { pool } = require("../config/dbConnection.js");

class FaqModel {

    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    /**
     * Obtiene todas las FAQs activas
     * @param {number|null} id_empresa - ID de la empresa para filtrar
     * @returns {Promise<Array>} - Array de FAQs
     */
    async getAllActivas(id_empresa = null) {
        try {
            let query = 'SELECT * FROM faq WHERE activo = 1';
            const params = [];

            if (id_empresa) {
                query += ' AND id_empresa = ?';
                params.push(id_empresa);
            }

            query += ' ORDER BY numero ASC';

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener FAQs activas: ${error.message}`);
        }
    }

    /**
     * Obtiene todas las FAQs (activas e inactivas)
     * @param {number|null} id_empresa - ID de la empresa para filtrar
     * @returns {Promise<Array>} - Array de FAQs
     */
    async getAll(id_empresa = null) {
        try {
            let query = 'SELECT * FROM faq WHERE activo = 1';
            const params = [];

            if (id_empresa) {
                query += ' AND id_empresa = ?';
                params.push(id_empresa);
            }

            query += ' ORDER BY numero ASC';

            const [rows] = await this.connection.execute(query, params);
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener FAQs: ${error.message}`);
        }
    }

    /**
     * Obtiene FAQs por proceso/etapa de venta
     * @param {string} proceso - 'Contacto', 'Toma de datos', 'Oferta', 'Cierre de ventas', 'Cierre de ventas (Contrato)', 'Aceptación'
     * @returns {Promise<Array>} - Array de FAQs del proceso especificado
     */
    async getByProceso(proceso) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM faq WHERE proceso = ? AND activo = 1 ORDER BY numero ASC',
                [proceso]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener FAQs por proceso: ${error.message}`);
        }
    }

    /**
     * Obtiene una FAQ por ID
     * @param {number} id - ID de la FAQ
     * @returns {Promise<Object|null>} - Objeto de la FAQ o null si no existe
     */
    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                'SELECT * FROM faq WHERE id = ?',
                [id]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener FAQ por ID: ${error.message}`);
        }
    }

    /**
     * Busca FAQs por texto en pregunta o respuesta
     * @param {string} texto - Texto a buscar
     * @returns {Promise<Array>} - Array de FAQs que coinciden
     */
    async search(texto) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM faq
                 WHERE activo = 1 AND (pregunta LIKE ? OR respuesta LIKE ?)
                 ORDER BY numero ASC`,
                [`%${texto}%`, `%${texto}%`]
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al buscar FAQs: ${error.message}`);
        }
    }

    /**
     * Crea una nueva FAQ
     * @param {Object} faq - Datos de la FAQ
     * @returns {Promise<number>} - ID de la FAQ creada
     */
    async create({ numero, pregunta, proceso, respuesta, activo = 1, id_empresa = null, usuario_registro = null }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO faq (numero, pregunta, proceso, respuesta, activo, id_empresa, usuario_registro)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [numero, pregunta, proceso, respuesta, activo, id_empresa, usuario_registro]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear FAQ: ${error.message}`);
        }
    }

    /**
     * Actualiza una FAQ
     * @param {number} id - ID de la FAQ
     * @param {Object} faq - Datos a actualizar
     * @returns {Promise<boolean>} - true si se actualizó correctamente
     */
    async update(id, { numero, pregunta, proceso, respuesta, activo, id_empresa = null, usuario_actualizacion = null }) {
        try {
            let query = `UPDATE faq
                 SET numero = ?, pregunta = ?, proceso = ?, respuesta = ?, activo = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                 WHERE id = ?`;
            const params = [numero, pregunta, proceso, respuesta, activo, usuario_actualizacion, id];

            if (id_empresa) {
                query = `UPDATE faq
                 SET numero = ?, pregunta = ?, proceso = ?, respuesta = ?, activo = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                 WHERE id = ? AND id_empresa = ?`;
                params.push(id_empresa);
            }

            const [result] = await this.connection.execute(query, params);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar FAQ: ${error.message}`);
        }
    }

    /**
     * Desactiva una FAQ (soft delete)
     * @param {number} id - ID de la FAQ
     * @returns {Promise<boolean>} - true si se desactivó correctamente
     */
    async softDelete(id) {
        try {
            const [result] = await this.connection.execute(
                'UPDATE faq SET activo = 0 WHERE id = ?',
                [id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al desactivar FAQ: ${error.message}`);
        }
    }

    /**
     * Elimina una FAQ (soft delete)
     * @param {number} id - ID de la FAQ
     * @param {number|null} id_empresa - ID de la empresa
     * @returns {Promise<boolean>} - true si se eliminó correctamente
     */
    async delete(id, id_empresa = null, usuario_actualizacion = null) {
        try {
            let query = 'UPDATE faq SET activo = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?';
            const params = [usuario_actualizacion, id];

            if (id_empresa) {
                query = 'UPDATE faq SET activo = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND id_empresa = ?';
                params.push(id_empresa);
            }

            const [result] = await this.connection.execute(query, params);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar FAQ: ${error.message}`);
        }
    }

    /**
     * Obtiene las FAQs formateadas para el prompt del sistema
     * @returns {Promise<string>} - String con las FAQs formateadas
     */
    async getFaqsFormatted() {
        try {
            const faqs = await this.getAllActivas();

            if (!faqs || faqs.length === 0) {
                return "No hay FAQs disponibles.";
            }

            const faqsFormatted = faqs.map(faq => {
                return `**Pregunta ${faq.numero}** (${faq.proceso}):
P: ${faq.pregunta}
R: ${faq.respuesta}`;
            }).join("\n\n");

            return faqsFormatted;
        } catch (error) {
            throw new Error(`Error al formatear FAQs: ${error.message}`);
        }
    }
}

module.exports = FaqModel;
