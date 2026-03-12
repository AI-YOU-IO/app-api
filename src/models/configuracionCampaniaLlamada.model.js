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

    async upsert({ id_campania, dias_llamada, hora_inicio, hora_fin, max_intentos, intervalo_reintento, horarios_por_dia, usuario }) {
        try {
            // Verificar si ya existe configuración para esta campaña
            const existing = await this.getByCampaniaId(id_campania);

            // Convertir horarios_por_dia a JSON string si viene como objeto
            const horariosPorDiaStr = horarios_por_dia ?
                (typeof horarios_por_dia === 'string' ? horarios_por_dia : JSON.stringify(horarios_por_dia)) : null;

            if (existing) {
                // UPDATE
                const [result] = await this.connection.execute(
                    `UPDATE configuracion_campania_llamada
                     SET dias_llamada = ?, hora_inicio = ?, hora_fin = ?, max_intentos = ?,
                         intervalo_reintento = ?, horarios_por_dia = ?, usuario_actualizacion = ?, fecha_actualizacion = NOW()
                     WHERE id_campania = ?`,
                    [dias_llamada, hora_inicio, hora_fin, max_intentos, intervalo_reintento || 60, horariosPorDiaStr, usuario || null, id_campania]
                );
                return { id: existing.id, updated: true };
            } else {
                // INSERT
                const [result] = await this.connection.execute(
                    `INSERT INTO configuracion_campania_llamada
                     (id_campania, dias_llamada, hora_inicio, hora_fin, max_intentos, intervalo_reintento, horarios_por_dia, estado_registro, usuario_registro)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
                    [id_campania, dias_llamada, hora_inicio, hora_fin, max_intentos, intervalo_reintento || 60, horariosPorDiaStr, usuario || null]
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
                `UPDATE configuracion_campania_llamada SET estado_registro = 0, fecha_actualizacion = NOW() WHERE id_campania = ?`,
                [id_campania]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`Error al eliminar configuración: ${error.message}`);
        }
    }
}

module.exports = ConfiguracionCampaniaLlamadaModel;
