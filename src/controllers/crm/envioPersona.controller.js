const EnvioPersonaModel = require("../../models/envioPersona.model.js");
const logger = require('../../config/logger/loggerClient.js');

class EnvioPersonaController {
    async listAll(req, res) {
        try {
            const { id_envio_masivo } = req.query;
            const envios = await EnvioPersonaModel.getAll(id_envio_masivo);
            return res.status(200).json({ data: envios });
        } catch (error) {
            logger.error(`[envioPersona.controller.js] Error al listar envíos persona: ${error.message}`);
            return res.status(500).json({ msg: "Error al listar envíos persona" });
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const envio = await EnvioPersonaModel.getById(id);

            if (!envio) {
                return res.status(404).json({ msg: "Envío persona no encontrado" });
            }

            return res.status(200).json({ data: envio });
        } catch (error) {
            logger.error(`[envioPersona.controller.js] Error al obtener envío persona: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener envío persona" });
        }
    }

    async getByEnvioMasivo(req, res) {
        try {
            const { id_envio_masivo } = req.params;
            const envios = await EnvioPersonaModel.getByEnvioMasivo(id_envio_masivo);
            return res.status(200).json({ data: envios });
        } catch (error) {
            logger.error(`[envioPersona.controller.js] Error al obtener envíos por envío masivo: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener envíos por envío masivo" });
        }
    }

    async create(req, res) {
        try {
            const { userId } = req.user || {};
            const { id_envio_masivo, id_persona, estado, fecha_envio, id_campania_ejecucion } = req.body;

            if (!id_envio_masivo) {
                return res.status(400).json({ msg: "El envío masivo es requerido" });
            }

            const id = await EnvioPersonaModel.create({
                id_envio_masivo,
                id_persona,
                estado,
                fecha_envio,
                id_campania_ejecucion,
                usuario_registro: userId
            });

            return res.status(201).json({ data: { id }, msg: "Envío persona creado correctamente" });
        } catch (error) {
            logger.error(`[envioPersona.controller.js] Error al crear envío persona: ${error.message}`);
            return res.status(500).json({ msg: "Error al crear envío persona" });
        }
    }

    async bulkCreate(req, res) {
        try {
            const { userId } = req.user || {};
            const { id_envio_masivo, personas } = req.body;

            if (!id_envio_masivo) {
                return res.status(400).json({ msg: "El envío masivo es requerido" });
            }

            if (!personas || !Array.isArray(personas) || personas.length === 0) {
                return res.status(400).json({ msg: "Debe proporcionar al menos una persona" });
            }

            logger.info(`[envioPersona.controller.js] bulkCreate: id_envio_masivo=${id_envio_masivo}, personas=${personas.length}`);
            const result = await EnvioPersonaModel.bulkCreate(id_envio_masivo, personas, userId);
            logger.info(`[envioPersona.controller.js] bulkCreate resultado: total=${result.total}, errores=${result.errores.length}`);
            if (result.errores.length > 0) {
                logger.error(`[envioPersona.controller.js] bulkCreate errores: ${JSON.stringify(result.errores)}`);
            }

            return res.status(201).json({ data: result, msg: `${result.total} envíos persona creados correctamente` });
        } catch (error) {
            logger.error(`[envioPersona.controller.js] Error en carga masiva: ${error.message}`);
            return res.status(500).json({ msg: "Error en carga masiva de envíos persona" });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const { userId } = req.user || {};

            const updated = await EnvioPersonaModel.update(id, {
                ...req.body,
                usuario_actualizacion: userId
            });

            if (!updated) {
                return res.status(404).json({ msg: "Envío persona no encontrado" });
            }

            return res.status(200).json({ msg: "Envío persona actualizado correctamente" });
        } catch (error) {
            logger.error(`[envioPersona.controller.js] Error al actualizar envío persona: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar envío persona" });
        }
    }

    async updateEstado(req, res) {
        try {
            const { id } = req.params;
            const { estado, error_mensaje } = req.body;
            const { userId } = req.user || {};

            if (!estado) {
                return res.status(400).json({ msg: "El estado es requerido" });
            }

            const updated = await EnvioPersonaModel.updateEstado(id, estado, error_mensaje, userId);

            if (!updated) {
                return res.status(404).json({ msg: "Envío persona no encontrado" });
            }

            return res.status(200).json({ msg: "Estado actualizado correctamente" });
        } catch (error) {
            logger.error(`[envioPersona.controller.js] Error al actualizar estado: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar estado" });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const { userId } = req.user || {};

            const deleted = await EnvioPersonaModel.delete(id, userId);

            if (!deleted) {
                return res.status(404).json({ msg: "Envío persona no encontrado" });
            }

            return res.status(200).json({ msg: "Envío persona eliminado correctamente" });
        } catch (error) {
            logger.error(`[envioPersona.controller.js] Error al eliminar envío persona: ${error.message}`);
            return res.status(500).json({ msg: "Error al eliminar envío persona" });
        }
    }
}

module.exports = new EnvioPersonaController();
