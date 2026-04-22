const PagoService = require("../../pago/pago.service");
const JetPotService = require("../../jetpot/jetpot.service");
const { pool } = require("../../../config/dbConnection");
const logger = require("../../../config/logger/loggerClient");

class ToolExecutor {

    constructor(persona = null, chatId) {
        this.lastEnlaceUrl = null;
        this.persona = persona;
        this.chatId = chatId;
    }

    async execute(toolName, args) {
        logger.info(`[Tool] ${toolName}`, { args: args ?? {} });
        switch (toolName) {
            case "obtenerLinkPago":
                return this._obtenerLinkPago(args);
            case "obtenerLinkCambio":
                return this._obtenerLinkCambio(args);
            case "tipificarConversacion":
                return this._tipificarConversacion(args);
            case "agregarListaNegra":
                return this._agregarListaNegra();
            case "derivarAsesor":
                return this._derivarAsesor(args);
            default:
                logger.warn(`[ToolExecutor] Tool desconocido: ${toolName}`);
                return JSON.stringify({ error: `Tool desconocido: ${toolName}` });
        }
    }

    async _obtenerLinkPago() {
        let grupo_familiar = "";
        const raw = this.persona?.json_adicional;
        if (raw) {
            try {
                const data = typeof raw === "string" ? JSON.parse(raw) : raw;
                grupo_familiar = data?.grupo_familiar || "";
            } catch (e) {
                logger.warn(`[ToolExecutor] json_adicional inválido: ${e.message}`);
            }
        }

        if (!grupo_familiar) {
            return JSON.stringify({ error: "No se encontró grupo_familiar en el contexto de la persona" });
        }

        let enlace = null;
        let errorDetalle = null;

        try {
            enlace = await PagoService.generarLinkPago(grupo_familiar, this.persona.celular, this.chatId, this.persona?.id);
            if (!enlace) errorDetalle = "El servicio no devolvió un enlace";
        } catch (err) {
            errorDetalle = err.message || "Error desconocido al generar el enlace de pago";
            logger.error('[ToolExecutor] Error en obtenerLinkPago', { stack: err.stack });
        }

        if (!enlace) return JSON.stringify({ error: errorDetalle });

        this.lastEnlaceUrl = enlace;
        return JSON.stringify({ enlace });
    }

    async _obtenerLinkCambio() {
        let grupo_familiar = "";
        const raw = this.persona?.json_adicional;
        if (raw) {
            try {
                const data = typeof raw === "string" ? JSON.parse(raw) : raw;
                grupo_familiar = data?.grupo_familiar || "";
            } catch (e) {
                logger.warn(`[ToolExecutor] json_adicional inválido: ${e.message}`);
            }
        }

        if (!grupo_familiar) {
            return JSON.stringify({ error: "No se encontró grupo_familiar en el contexto de la persona" });
        }

        let enlace = null;
        try {
            enlace = await PagoService.generarLinkCambio(grupo_familiar, this.persona.celular, this.chatId, this.persona?.id);
        } catch (err) {
            logger.error('[ToolExecutor] Error en obtenerLinkCambio', { stack: err.stack });
        }

        if (!enlace) return JSON.stringify({ error: "No se pudo generar el enlace de cambio de tarjeta" });
        this.lastEnlaceUrl = enlace;
        return JSON.stringify({ enlace });
    }

    async _agregarListaNegra() {
        if (!this.persona?.id) {
            return JSON.stringify({ error: "No se pudo identificar la persona" });
        }
        try {
            logger.info('[Query] agregarListaNegra', {
                query: 'UPDATE persona SET lista_negra = true WHERE id = $1',
                params: [this.persona.id]
            });
            await pool.query(
                `UPDATE persona SET lista_negra = true, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1`,
                [this.persona.id]
            );
            logger.info('[Response] agregarListaNegra', { personaId: this.persona.id });
            return JSON.stringify({ success: true, message: "Persona agregada a lista negra" });
        } catch (error) {
            logger.error('[ToolExecutor] Error al agregar a lista negra', { stack: error.stack });
            return JSON.stringify({ error: "Error al agregar a lista negra" });
        }
    }

    async _derivarAsesor({ motivo }) {
        if (!this.persona?.id) {
            return JSON.stringify({ error: "No se pudo identificar la persona" });
        }

        let grupo_familiar = "";
        const raw = this.persona?.json_adicional;
        if (raw) {
            try {
                const data = typeof raw === "string" ? JSON.parse(raw) : raw;
                grupo_familiar = data?.grupo_familiar || "";
            } catch (e) {
                logger.warn(`[ToolExecutor] json_adicional inválido: ${e.message}`);
            }
        }

        try {
            await JetPotService.enviarEscalacion({
                nombre_cliente: this.persona.nombre_completo || "Sin nombre",
                telefono_cliente: this.persona.celular || "Sin número",
                motivo,
                grupo_familiar
            });
            return JSON.stringify({ success: true, message: "Derivación enviada al asesor" });
        } catch (error) {
            logger.error('[ToolExecutor] Error al derivar asesor', { stack: error.stack });
            return JSON.stringify({ error: "Error al enviar la derivación" });
        }
    }

    async _tipificarConversacion({id_tipificacion}) {
        if (!this.persona?.id) {
            return JSON.stringify({ error: "No se pudo identificar la persona para tipificar" });
        }
        try {
            logger.info('[Query] tipificarConversacion', {
                query: 'UPDATE persona SET id_tipificacion = $1 WHERE id = $2',
                params: [id_tipificacion, this.persona.id]
            });
            await pool.query(
                `UPDATE persona SET id_tipificacion = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $2`,
                [id_tipificacion, this.persona.id]
            );
            logger.info('[Response] tipificarConversacion', { personaId: this.persona.id, id_tipificacion });
            return JSON.stringify({ success: true, message: "Tipificacion actualizada correctamente" });
        } catch (error) {
            logger.error('[ToolExecutor] Error al tipificar', { stack: error.stack });
            return JSON.stringify({ error: "Error al actualizar tipificacion" });
        }
    }
}

module.exports = ToolExecutor;
