const EnvioBaseModel = require("../../models/envioBase.model.js");
const logger = require('../../config/logger/loggerClient.js');

class EnvioBaseController {
    async listAll(req, res) {
        try {
            const { id_envio_masivo } = req.query;
            const envios = await EnvioBaseModel.getAll(id_envio_masivo);
            return res.status(200).json({ data: envios });
        } catch (error) {
            logger.error(`[envioBase.controller.js] Error al listar envíos base: ${error.message}`);
            return res.status(500).json({ msg: "Error al listar envíos base" });
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const envio = await EnvioBaseModel.getById(id);

            if (!envio) {
                return res.status(404).json({ msg: "Envío base no encontrado" });
            }

            return res.status(200).json({ data: envio });
        } catch (error) {
            logger.error(`[envioBase.controller.js] Error al obtener envío base: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener envío base" });
        }
    }

    async getByEnvioMasivo(req, res) {
        try {
            const { id_envio_masivo } = req.params;
            const envios = await EnvioBaseModel.getByEnvioMasivo(id_envio_masivo);
            return res.status(200).json({ data: envios });
        } catch (error) {
            logger.error(`[envioBase.controller.js] Error al obtener envíos por envío masivo: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener envíos por envío masivo" });
        }
    }

    async create(req, res) {
        try {
            const { userId } = req.user || {};
            const { id_base, id_envio_masivo, estado, fecha_envio } = req.body;

            if (!id_envio_masivo) {
                return res.status(400).json({ msg: "El envío masivo es requerido" });
            }

            const id = await EnvioBaseModel.create({
                id_base,
                id_envio_masivo,
                estado,
                fecha_envio,
                usuario_registro: userId
            });

            return res.status(201).json({ data: { id }, msg: "Envío base creado correctamente" });
        } catch (error) {
            logger.error(`[envioBase.controller.js] Error al crear envío base: ${error.message}`);
            return res.status(500).json({ msg: "Error al crear envío base" });
        }
    }

    async bulkCreate(req, res) {
        try {
            const { userId } = req.user || {};
            const { id_envio_masivo, bases } = req.body;

            if (!id_envio_masivo) {
                return res.status(400).json({ msg: "El envío masivo es requerido" });
            }

            if (!bases || !Array.isArray(bases) || bases.length === 0) {
                return res.status(400).json({ msg: "Debe proporcionar al menos una base" });
            }

            logger.info(`[envioBase.controller.js] bulkCreate: id_envio_masivo=${id_envio_masivo}, bases=${bases.length}`);
            const result = await EnvioBaseModel.bulkCreate(id_envio_masivo, bases, userId);
            logger.info(`[envioBase.controller.js] bulkCreate resultado: total=${result.total}, errores=${result.errores.length}`);
            if (result.errores.length > 0) {
                logger.error(`[envioBase.controller.js] bulkCreate errores: ${JSON.stringify(result.errores)}`);
            }

            return res.status(201).json({ data: result, msg: `${result.total} envíos base creados correctamente` });
        } catch (error) {
            logger.error(`[envioBase.controller.js] Error en carga masiva: ${error.message}`);
            return res.status(500).json({ msg: "Error en carga masiva de envíos base" });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const { userId } = req.user || {};

            const updated = await EnvioBaseModel.update(id, {
                ...req.body,
                usuario_actualizacion: userId
            });

            if (!updated) {
                return res.status(404).json({ msg: "Envío base no encontrado" });
            }

            return res.status(200).json({ msg: "Envío base actualizado correctamente" });
        } catch (error) {
            logger.error(`[envioBase.controller.js] Error al actualizar envío base: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar envío base" });
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

            const updated = await EnvioBaseModel.updateEstado(id, estado, error_mensaje, userId);

            if (!updated) {
                return res.status(404).json({ msg: "Envío base no encontrado" });
            }

            return res.status(200).json({ msg: "Estado actualizado correctamente" });
        } catch (error) {
            logger.error(`[envioBase.controller.js] Error al actualizar estado: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar estado" });
        }
    }

    async syncByEnvioMasivo(req, res) {
        try {
            const { id_envio_masivo } = req.params;
            const { bases } = req.body;
            const { userId } = req.user || {};

            if (!bases || !Array.isArray(bases)) {
                return res.status(400).json({ msg: "Debe proporcionar las bases" });
            }

            // Desactivar bases actuales
            await EnvioBaseModel.deleteByEnvioMasivo(id_envio_masivo, userId);

            // Crear las nuevas
            if (bases.length > 0) {
                const result = await EnvioBaseModel.bulkCreate(id_envio_masivo, bases, userId);
                return res.status(200).json({ data: result, msg: "Bases sincronizadas correctamente" });
            }

            return res.status(200).json({ data: { total: 0, errores: [] }, msg: "Bases sincronizadas correctamente" });
        } catch (error) {
            logger.error(`[envioBase.controller.js] Error al sincronizar bases: ${error.message}`);
            return res.status(500).json({ msg: "Error al sincronizar bases" });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const { userId } = req.user || {};

            const deleted = await EnvioBaseModel.delete(id, userId);

            if (!deleted) {
                return res.status(404).json({ msg: "Envío base no encontrado" });
            }

            return res.status(200).json({ msg: "Envío base eliminado correctamente" });
        } catch (error) {
            logger.error(`[envioBase.controller.js] Error al eliminar envío base: ${error.message}`);
            return res.status(500).json({ msg: "Error al eliminar envío base" });
        }
    }
}

module.exports = new EnvioBaseController();
