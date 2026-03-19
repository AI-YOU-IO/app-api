const { pool } = require("../config/dbConnection.js");

class ConfiguracionWhatsappModel {

    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getAll() {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id, id_empresa, app_id, numero_telefono_id, clave_secreta,
                        token_whatsapp, waba_id, phone_number, token_expiration,
                        estado_registro, usuario_registro, fecha_registro,
                        fecha_actualizacion, usuario_actualizacion
                 FROM configuracion_whatsapp
                 WHERE estado_registro = 1`
            );
            return rows;
        } catch (error) {
            throw new Error(`Error al obtener configuraciones WhatsApp: ${error.message}`);
        }
    }

    async getById(id) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id, id_empresa, app_id, numero_telefono_id, clave_secreta,
                        token_whatsapp, waba_id, phone_number, token_expiration,
                        estado_registro, usuario_registro, fecha_registro,
                        fecha_actualizacion, usuario_actualizacion
                 FROM configuracion_whatsapp
                 WHERE id = ? AND estado_registro = 1`,
                [id]
            );
            return rows[0] || null;
        } catch (error) {
            throw new Error(`Error al obtener configuración WhatsApp por ID: ${error.message}`);
        }
    }

    async getByEmpresaId(idEmpresa) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id, id_empresa, app_id, numero_telefono_id, clave_secreta,
                        token_whatsapp, waba_id, phone_number, token_expiration,
                        estado_registro, usuario_registro, fecha_registro,
                        fecha_actualizacion, usuario_actualizacion
                 FROM configuracion_whatsapp
                 WHERE id_empresa = ? AND estado_registro = 1`,
                [idEmpresa]
            );
            return rows[0] || null;
        } catch (error) {
            throw new Error(`Error al obtener configuración WhatsApp por empresa: ${error.message}`);
        }
    }

    async getByPhoneNumberId(phoneNumberId) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT id, id_empresa, app_id, numero_telefono_id, clave_secreta,
                        token_whatsapp, waba_id, phone_number, token_expiration,
                        estado_registro, usuario_registro, fecha_registro,
                        fecha_actualizacion, usuario_actualizacion
                 FROM configuracion_whatsapp
                 WHERE numero_telefono_id = ? AND estado_registro = 1`,
                [phoneNumberId]
            );
            return rows[0] || null;
        } catch (error) {
            throw new Error(`Error al obtener configuración WhatsApp por numero_telefono_id: ${error.message}`);
        }
    }

    async create({ id_empresa, app_id, numero_telefono_id, clave_secreta, token_whatsapp, waba_id, phone_number, token_expiration, usuario_registro }) {
        try {
            const [result] = await this.connection.execute(
                `INSERT INTO configuracion_whatsapp
                    (id_empresa, app_id, numero_telefono_id, clave_secreta,
                     token_whatsapp, waba_id, phone_number, token_expiration,
                     estado_registro, usuario_registro, fecha_registro)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)`,
                [id_empresa, app_id, numero_telefono_id, clave_secreta,
                 token_whatsapp, waba_id, phone_number, token_expiration,
                 usuario_registro]
            );
            return result.insertId;
        } catch (error) {
            throw new Error(`Error al crear configuración WhatsApp: ${error.message}`);
        }
    }

    async update(id, { app_id, numero_telefono_id, clave_secreta, token_whatsapp, waba_id, phone_number, token_expiration, usuario_actualizacion }) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE configuracion_whatsapp SET
                    app_id = ?, numero_telefono_id = ?, clave_secreta = ?,
                    token_whatsapp = ?, waba_id = ?, phone_number = ?,
                    token_expiration = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                 WHERE id = ? AND estado_registro = 1`,
                [app_id, numero_telefono_id, clave_secreta,
                 token_whatsapp, waba_id, phone_number, token_expiration,
                 usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al actualizar configuración WhatsApp: ${error.message}`);
        }
    }

    async delete(id, usuario_actualizacion = null) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE configuracion_whatsapp SET estado_registro = 0,
                    usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [usuario_actualizacion, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar configuración WhatsApp: ${error.message}`);
        }
    }
}

module.exports = new ConfiguracionWhatsappModel();
