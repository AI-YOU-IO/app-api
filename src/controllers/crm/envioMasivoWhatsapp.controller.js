const EnvioMasivoWhatsappModel = require("../../models/envioMasivoWhatsapp.model.js");
const EnvioPersonaModel = require("../../models/envioPersona.model.js");
const PlantillaWhatsappModel = require("../../models/plantillaWhatsapp.model.js");
const whatsappGraphService = require("../../services/whatsapp/whatsappGraph.service.js");
const logger = require('../../config/logger/loggerClient.js');

const DELAY_BETWEEN_MESSAGES = 500;

class EnvioMasivoWhatsappController {
    async listAll(req, res) {
        try {
            const { idEmpresa } = req.user || {};
            const envios = await EnvioMasivoWhatsappModel.getAll(idEmpresa);
            return res.status(200).json({ data: envios });
        } catch (error) {
            logger.error(`[envioMasivoWhatsapp.controller.js] Error al listar envíos masivos: ${error.message}`);
            return res.status(500).json({ msg: "Error al listar envíos masivos" });
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const envio = await EnvioMasivoWhatsappModel.getById(id);

            if (!envio) {
                return res.status(404).json({ msg: "Envío masivo no encontrado" });
            }

            return res.status(200).json({ data: envio });
        } catch (error) {
            logger.error(`[envioMasivoWhatsapp.controller.js] Error al obtener envío masivo: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener envío masivo" });
        }
    }

    async getWithPersonas(req, res) {
        try {
            const { id } = req.params;
            const envio = await EnvioMasivoWhatsappModel.getById(id);

            if (!envio) {
                return res.status(404).json({ msg: "Envío masivo no encontrado" });
            }

            const personas = await EnvioPersonaModel.getByEnvioMasivo(id);
            envio.personas = personas;

            return res.status(200).json({ data: envio });
        } catch (error) {
            logger.error(`[envioMasivoWhatsapp.controller.js] Error al obtener envío con personas: ${error.message}`);
            return res.status(500).json({ msg: "Error al obtener envío masivo con personas" });
        }
    }

    async create(req, res) {
        try {
            const { userId, idEmpresa } = req.user || {};
            const { id_plantilla, titulo, descripcion, cantidad, fecha_envio, estado_envio } = req.body;

            if (!id_plantilla) {
                return res.status(400).json({ msg: "La plantilla es requerida" });
            }

            const id = await EnvioMasivoWhatsappModel.create({
                id_empresa: idEmpresa,
                id_plantilla,
                titulo,
                descripcion,
                cantidad,
                fecha_envio,
                estado_envio,
                usuario_registro: userId
            });

            logger.info(`[envioMasivoWhatsapp.controller.js] Envío masivo creado con id: ${id}`);
            return res.status(201).json({ data: { id }, msg: "Envío masivo creado correctamente" });
        } catch (error) {
            logger.error(`[envioMasivoWhatsapp.controller.js] Error al crear envío masivo: ${error.message}`);
            return res.status(500).json({ msg: "Error al crear envío masivo" });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const { userId } = req.user || {};

            const updated = await EnvioMasivoWhatsappModel.update(id, {
                ...req.body,
                usuario_actualizacion: userId
            });

            if (!updated) {
                return res.status(404).json({ msg: "Envío masivo no encontrado" });
            }

            return res.status(200).json({ msg: "Envío masivo actualizado correctamente" });
        } catch (error) {
            logger.error(`[envioMasivoWhatsapp.controller.js] Error al actualizar envío masivo: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar envío masivo" });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const { userId } = req.user || {};

            const deleted = await EnvioMasivoWhatsappModel.delete(id, userId);

            if (!deleted) {
                return res.status(404).json({ msg: "Envío masivo no encontrado" });
            }

            return res.status(200).json({ msg: "Envío masivo eliminado correctamente" });
        } catch (error) {
            logger.error(`[envioMasivoWhatsapp.controller.js] Error al eliminar envío masivo: ${error.message}`);
            return res.status(500).json({ msg: "Error al eliminar envío masivo" });
        }
    }

    async ejecutarEnvio(req, res) {
        try {
            const { id } = req.params;
            const { idEmpresa, userId } = req.user || {};

            // Obtener el envio masivo
            const envio = await EnvioMasivoWhatsappModel.getById(id);
            if (!envio) {
                return res.status(404).json({ msg: "Envío masivo no encontrado" });
            }

            // Obtener la plantilla para saber name y language
            const plantilla = await PlantillaWhatsappModel.getById(envio.id_plantilla);
            if (!plantilla) {
                return res.status(400).json({ msg: "La plantilla asociada no fue encontrada" });
            }

            // Obtener los envio_persona pendientes
            const envioPersonas = await EnvioPersonaModel.getByEnvioMasivo(id);
            logger.info(`[envioMasivoWhatsapp.controller.js] Envio ${id}: encontradas ${envioPersonas.length} personas`);
            if (envioPersonas.length === 0) {
                return res.status(400).json({ msg: "No hay personas asociadas a este envío" });
            }

            // Actualizar estado del envio masivo a enviado (en proceso de envio)
            await EnvioMasivoWhatsappModel.updateEstado(id, 'enviado', userId);

            let cantidadExitosos = 0;
            let cantidadFallidos = 0;

            for (const ep of envioPersonas) {
                // Solo procesar los que estan pendientes
                if (ep.estado !== 'pendiente') {
                    if (ep.estado === 'enviado' || ep.estado === 'entregado') cantidadExitosos++;
                    if (ep.estado === 'cancelado') cantidadFallidos++;
                    continue;
                }

                const celular = ep.persona_celular;
                if (!celular) {
                    await EnvioPersonaModel.updateEstado(ep.id, 'cancelado', 'Sin número de celular', userId);
                    cantidadFallidos++;
                    continue;
                }

                try {
                    await whatsappGraphService.enviarPlantilla(
                        idEmpresa,
                        celular,
                        plantilla.name,
                        plantilla.language || 'es'
                    );

                    await EnvioPersonaModel.updateEstado(ep.id, 'enviado', null, userId);
                    cantidadExitosos++;
                } catch (error) {
                    const errorMsg = error.response?.data?.error?.message || error.message || 'Error desconocido';
                    await EnvioPersonaModel.updateEstado(ep.id, 'cancelado', errorMsg, userId);
                    cantidadFallidos++;
                    logger.error(`[envioMasivoWhatsapp.controller.js] Error enviando a ${celular}: ${errorMsg}`);
                }

                // Delay entre mensajes para evitar rate limiting
                if (DELAY_BETWEEN_MESSAGES > 0) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));
                }
            }

            // Actualizar contadores y estado final
            await EnvioMasivoWhatsappModel.updateContadores(id, cantidadExitosos, cantidadFallidos);
            await EnvioMasivoWhatsappModel.updateEstado(id, 'entregado', userId);

            logger.info(`[envioMasivoWhatsapp.controller.js] Envío masivo ${id} completado: ${cantidadExitosos} exitosos, ${cantidadFallidos} fallidos`);

            return res.status(200).json({
                msg: "Envío masivo ejecutado",
                data: { cantidadExitosos, cantidadFallidos }
            });
        } catch (error) {
            logger.error(`[envioMasivoWhatsapp.controller.js] Error al ejecutar envío masivo: ${error.message}`);
            return res.status(500).json({ msg: "Error al ejecutar envío masivo" });
        }
    }

    async updateEstado(req, res) {
        try {
            const { id } = req.params;
            const { estado_envio } = req.body;
            const { userId } = req.user || {};

            if (!estado_envio) {
                return res.status(400).json({ msg: "El estado de envío es requerido" });
            }

            const updated = await EnvioMasivoWhatsappModel.updateEstado(id, estado_envio, userId);

            if (!updated) {
                return res.status(404).json({ msg: "Envío masivo no encontrado" });
            }

            return res.status(200).json({ msg: "Estado actualizado correctamente" });
        } catch (error) {
            logger.error(`[envioMasivoWhatsapp.controller.js] Error al actualizar estado: ${error.message}`);
            return res.status(500).json({ msg: "Error al actualizar estado" });
        }
    }
}

module.exports = new EnvioMasivoWhatsappController();
