const axios = require("axios");
const logger = require("../../config/logger/loggerClient");

const JETPOT_API_KEY = process.env.JETPOT_API_KEY || "";
const JETPOT_DESTINATARIO = process.env.JETPOT_DESTINATARIO || "";
logger.info(`[JetPotService] JETPOT_API_KEY cargada: ${JETPOT_API_KEY ? JETPOT_API_KEY.substring(0, 8) + "..." : "NO CONFIGURADA"}`);

class JetPotService {

    constructor() {
        this.client = axios.create({
            baseURL: "https://app.jetpot.io/api/mailing/webhook",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${JETPOT_API_KEY}`
            },
            timeout: 30000
        });
    }

    async enviarEscalacion({ nombre_cliente, telefono_cliente, motivo, grupo_familiar }) {
        logger.info('[Request] enviarEscalacion', {
            body: { nombre_cliente, telefono_cliente, motivo, grupo_familiar }
        });
        try {
            const response = await this.client.post("/transaccional", {
                tipo_evento: "escalacion_asesor",
                destinatario: JETPOT_DESTINATARIO,
                variables: {
                    nombre_cliente,
                    telefono_cliente,
                    motivo,
                    grupo_familiar
                }
            });
            logger.info('[Response] enviarEscalacion', { status: response.status, data: response.data });
            return response.data;
        } catch (error) {
            const status = error.response?.status || "sin respuesta";
            const body = JSON.stringify(error.response?.data || {}).substring(0, 200);
            logger.error(`[JetPotService] Error al enviar escalacion: ${status} - ${body}`);
            throw error;
        }
    }
}

module.exports = new JetPotService();
