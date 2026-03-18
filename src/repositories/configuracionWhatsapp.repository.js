const { pool } = require('../config/dbConnection.js');
const logger = require('../config/logger/loggerClient.js');

class ConfiguracionWhatsappRepository {
  async upsertByEmpresaId(idEmpresa, data) {
    try {
      const [existing] = await pool.execute(
        'SELECT id FROM configuracion_whatsapp WHERE id_empresa = ?',
        [idEmpresa]
      );

      if (existing.length > 0) {
        await pool.execute(
          `UPDATE configuracion_whatsapp SET
            app_id = ?, numero_telefono_id = ?, clave_secreta = ?,
            token_whatsapp = ?, waba_id = ?, phone_number = ?,
            token_expiration = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
          WHERE id_empresa = ?`,
          [
            data.app_id, data.numero_telefono_id, data.clave_secreta,
            data.token_whatsapp, data.waba_id, data.phone_number,
            data.token_expiration, data.usuario_actualizacion, idEmpresa
          ]
        );
      } else {
        await pool.execute(
          `INSERT INTO configuracion_whatsapp
            (id_empresa, app_id, numero_telefono_id, clave_secreta,
             token_whatsapp, waba_id, phone_number, token_expiration,
             usuario_registro, fecha_registro)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            idEmpresa, data.app_id, data.numero_telefono_id, data.clave_secreta,
            data.token_whatsapp, data.waba_id, data.phone_number,
            data.token_expiration, data.usuario_registro
          ]
        );
      }
    } catch (error) {
      logger.error(`[ConfiguracionWhatsappRepository] Error upsert: ${error.message}`);
      throw error;
    }
  }

  async findByEmpresaId(idEmpresa) {
    return this.getByEmpresaId(idEmpresa);
  }

  async getByEmpresaId(idEmpresa) {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM configuracion_whatsapp WHERE id_empresa = ?',
        [idEmpresa]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error(`[ConfiguracionWhatsappRepository] Error get: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new ConfiguracionWhatsappRepository();
