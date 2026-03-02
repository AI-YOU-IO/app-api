const LlamadaModel = require("../../models/llamada.model.js");
const logger = require('../../config/logger/loggerClient.js');

class LlamadaController {
    async getAll(req, res) {
        try {
            const { idEmpresa } = req.user;
            const llamadaModel = new LlamadaModel();
            const llamadas = await llamadaModel.getAll(idEmpresa);
            return res.status(200).json({ data: llamadas });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al obtener llamadas: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener llamadas" });
        }
    }

    async getByProviderCallId(req, res) {
        try {
            const { providerCallId } = req.params;
            const llamadaModel = new LlamadaModel();
            const llamada = await llamadaModel.getByProviderCallId(providerCallId);

            if (!llamada) {
                return res.status(404).json({ msg: "Llamada no encontrada" });
            }

            return res.status(200).json({ data: llamada });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al obtener llamada por provider_call_id: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener llamada" });
        }
    }

    async getByCampania(req, res) {
        try {
            const { idCampania } = req.params;
            const llamadaModel = new LlamadaModel();
            const llamadas = await llamadaModel.getByCampania(idCampania);
            return res.status(200).json({ data: llamadas });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al obtener llamadas por campania: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener llamadas por campania" });
        }
    }

    async create(req, res) {
        try {
            const { idEmpresa } = req.user;
            const { id_campania, id_base_numero, id_base_numero_detalle, provider_call_id } = req.body;

            if (!id_campania || !id_base_numero || !provider_call_id) {
                return res.status(400).json({ msg: "Los campos id_campania, id_base_numero y provider_call_id son requeridos" });
            }

            const llamadaModel = new LlamadaModel();
            const id = await llamadaModel.create({
                id_empresa: idEmpresa,
                id_campania,
                id_base_numero,
                id_base_numero_detalle,
                provider_call_id
            });

            return res.status(201).json({ msg: "Llamada creada exitosamente", data: { id } });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al crear llamada: ${error.message}`);
            return res.status(500).json({ msg: error.message || "Error al crear llamada" });
        }
    }

    async actualizarTipificacion(req, res) {
        try {
            const { id, id_tipificacion_llamada } = req.body;

            const llamadaModel = new LlamadaModel();
            await llamadaModel.actualizarTipificacion(id, id_tipificacion_llamada);

            return res.status(201).json({ msg: "Llamada creada exitosamente", data: { id } });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al crear llamada: ${error.message}`);
            return res.status(500).json({ msg: error.message || "Error al crear llamada" });
        }
    }
}

module.exports = new LlamadaController();
