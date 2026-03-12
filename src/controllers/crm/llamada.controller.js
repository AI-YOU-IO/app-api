const LlamadaModel = require("../../models/llamada.model.js");
const logger = require('../../config/logger/loggerClient.js');
const llamadaService = require('../../services/llamada/llamada.service.js');

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

    async getById(req, res) {
        try {
            const { id } = req.params;
            const llamadaModel = new LlamadaModel();
            const llamada = await llamadaModel.getById(id);

            if (!llamada) {
                return res.status(404).json({ msg: "Llamada no encontrada" });
            }

            return res.status(200).json({ data: llamada });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al obtener llamada por ID: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener llamada" });
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

    async getByCampaniaEjecucion(req, res) {
        try {
            const { idCampaniaEjecucion } = req.params;
            const llamadaModel = new LlamadaModel();
            const llamadas = await llamadaModel.getByCampaniaEjecucion(idCampaniaEjecucion);
            return res.status(200).json({ data: llamadas });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al obtener llamadas por ejecucion: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener llamadas por ejecucion" });
        }
    }

    async create(req, res) {
        try {
            const { idEmpresa, userId } = req.user;
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
                provider_call_id,
                usuario_registro: userId
            });

            return res.status(201).json({ msg: "Llamada creada exitosamente", data: { id } });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al crear llamada: ${error.message}`);
            return res.status(500).json({ msg: "Error al crear llamada" });
        }
    }

    async actualizarTipificacion(req, res) {
        try {
            const { provider_call_id, id_tipificacion_llamada } = req.body;

            if (!provider_call_id || !id_tipificacion_llamada) {
                return res.status(400).json({ msg: "Los campos provider_call_id e id_tipificacion_llamada son requeridos" });
            }

            const llamadaModel = new LlamadaModel();
            await llamadaModel.actualizarTipificacion(provider_call_id, id_tipificacion_llamada);

            return res.status(200).json({ msg: "Tipificacion actualizada exitosamente" });
        } catch (error) {
            logger.error(`[llamada.controller.js] Error al actualizar tipificacion: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar tipificacion" });
        }
    }
}

module.exports = new LlamadaController();
