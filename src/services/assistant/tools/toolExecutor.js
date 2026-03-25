const PagoService = require("../../pago/pago.service");
const { pool } = require("../../../config/dbConnection");
const logger = require("../../../config/logger/loggerClient");

class ToolExecutor {

    constructor(persona = null) {
        this.lastEnlaceUrl = null;
        this.persona = persona;
    }

    async execute(toolName, args) {
        switch (toolName) {
            case "obtenerLinkPago":
                return this._obtenerLinkPago(args);
            case "obtenerLinkCambio":
                return this._obtenerLinkCambio(args);
            case "tipificarConversacion":
                return this._tipificarConversacion(args);
            default:
                logger.warn(`[ToolExecutor] Tool desconocido: ${toolName}`);
                return JSON.stringify({ error: `Tool desconocido: ${toolName}` });
        }
    }

    async _obtenerLinkPago({grupo_familiar}) {
        logger.info("[ToolExecutor] obtenerLinkPago");
        const enlace = await PagoService.generarLinkPago(grupo_familiar, this.persona.celular);
        if (!enlace) return JSON.stringify({ error: "No se pudo generar el grupo_familiarenlace de pago" });
        this.lastEnlaceUrl = enlace;
        return JSON.stringify({ enlace });
    }

    async _obtenerLinkCambio({grupo_familiar}) {
        logger.info("[ToolExecutor] obtenerLinkCambio");
        const enlace = await PagoService.generarLinkCambio(grupo_familiar, this.persona.celular);
        if (!enlace) return JSON.stringify({ error: "No se pudo generar el enlace de cambio de tarjeta" });
        this.lastEnlaceUrl = enlace;
        return JSON.stringify({ enlace });
    }

    async _tipificarConversacion({id_tipificacion}) {
        logger.info(`[ToolExecutor] tipificarConversacion: tipificacion=${id_tipificacion}, persona=${this.persona?.id}`);
        if (!this.persona?.id) {
            return JSON.stringify({ error: "No se pudo identificar la persona para tipificar" });
        }
        try {
            await pool.query(
                `UPDATE persona SET id_tipificacion = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $2`,
                [id_tipificacion, this.persona.id]
            );
            return JSON.stringify({ success: true, message: "Tipificacion actualizada correctamente" });
        } catch (error) {
            logger.error(`[ToolExecutor] Error al tipificar: ${error.message}`);
            return JSON.stringify({ error: "Error al actualizar tipificacion" });
        }
    }
}

module.exports = ToolExecutor;
