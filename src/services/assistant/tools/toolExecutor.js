const PagoService = require("../../pago/pago.service");
const logger = require("../../../config/logger/loggerClient");

class ToolExecutor {

    constructor() {
        this.lastEnlaceUrl = null;
    }

    async execute(toolName, args) {
        switch (toolName) {
            case "obtenerLinkPago":
                return this._obtenerLinkPago(args);
            case "obtenerLinkCambio":
                return this._obtenerLinkCambio(args);
            default:
                logger.warn(`[ToolExecutor] Tool desconocido: ${toolName}`);
                return JSON.stringify({ error: `Tool desconocido: ${toolName}` });
        }
    }

    async _obtenerLinkPago({grupo_familiar}) {
        logger.info("[ToolExecutor] obtenerLinkPago");
        const enlace = await PagoService.generarLinkPago(grupo_familiar);
        if (!enlace) return JSON.stringify({ error: "No se pudo generar el enlace de pago" });
        this.lastEnlaceUrl = enlace;
        return JSON.stringify({ enlace });
    }

    async _obtenerLinkCambio({grupo_familiar}) {
        logger.info("[ToolExecutor] obtenerLinkCambio");
        const enlace = await PagoService.generarLinkCambio(grupo_familiar);
        if (!enlace) return JSON.stringify({ error: "No se pudo generar el enlace de cambio de tarjeta" });
        this.lastEnlaceUrl = enlace;
        return JSON.stringify({ enlace });
    }
}

module.exports = ToolExecutor;
