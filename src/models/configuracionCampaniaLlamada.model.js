const { pool } = require("../config/dbConnection.js");

class ConfiguracionCampaniaLlamadaModel {
    constructor(dbConnection = null) {
        this.connection = dbConnection || pool;
    }

    async getByCampaniaId(id_campania) {
        try {
            const [rows] = await this.connection.execute(
                `SELECT * FROM configuracion_campania_llamada WHERE id_campania = ? AND estado_registro = 1`,
                [id_campania]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`Error al obtener configuración: ${error.message}`);
        }
    }

    async upsert({
        id_campania,
        max_intentos,
        intervalo_reintento,
        lunes_horario,
        martes_horario,
        miercoles_horario,
        jueves_horario,
        viernes_horario,
        sabado_horario,
        domingo_horario,
        usuario
    }) {
        try {
            // Verificar si ya existe configuración para esta campaña
            const existing = await this.getByCampaniaId(id_campania);

            if (existing) {
                // UPDATE
                const [result] = await this.connection.execute(
                    `UPDATE configuracion_campania_llamada
                     SET max_intentos = ?, intervalo_reintento = ?,
                         lunes_horario = ?, martes_horario = ?, miercoles_horario = ?,
                         jueves_horario = ?, viernes_horario = ?, sabado_horario = ?, domingo_horario = ?,
                         usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                     WHERE id_campania = ?`,
                    [
                        max_intentos,
                        intervalo_reintento || 60,
                        lunes_horario || null,
                        martes_horario || null,
                        miercoles_horario || null,
                        jueves_horario || null,
                        viernes_horario || null,
                        sabado_horario || null,
                        domingo_horario || null,
                        usuario || null,
                        id_campania
                    ]
                );
                return { id: existing.id, updated: true };
            } else {
                // INSERT
                const [result] = await this.connection.execute(
                    `INSERT INTO configuracion_campania_llamada
                     (id_campania, max_intentos, intervalo_reintento,
                      lunes_horario, martes_horario, miercoles_horario, jueves_horario,
                      viernes_horario, sabado_horario, domingo_horario,
                      estado_registro, usuario_registro)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                    [
                        id_campania,
                        max_intentos,
                        intervalo_reintento || 60,
                        lunes_horario || null,
                        martes_horario || null,
                        miercoles_horario || null,
                        jueves_horario || null,
                        viernes_horario || null,
                        sabado_horario || null,
                        domingo_horario || null,
                        usuario || null
                    ]
                );
                return { id: result.insertId, updated: false };
            }
        } catch (error) {
            throw new Error(`Error al guardar configuración: ${error.message}`);
        }
    }

    async delete(id_campania) {
        try {
            const [result] = await this.connection.execute(
                `UPDATE configuracion_campania_llamada SET estado_registro = 0, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_campania = ?`,
                [id_campania]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar configuración: ${error.message}`);
        }
    }
}

module.exports = ConfiguracionCampaniaLlamadaModel;
