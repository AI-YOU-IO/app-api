const EnvioMasivoWhatsappModel = require("../../models/envioMasivoWhatsapp.model.js");
const EnvioPersonaModel = require("../../models/envioBase.model.js");
const PlantillaWhatsappModel = require("../../models/plantillaWhatsapp.model.js");
const FormatoCampoPlantillaModel = require("../../models/formatoCampoPlantilla.model.js");
const BaseNumeroDetalleModel = require("../../models/baseNumeroDetalle.model.js");
const whatsappGraphService = require("../../services/whatsapp/whatsappGraph.service.js");
const Persona = require("../../models/persona.model.js");
const Chat = require("../../models/chat.model.js");
const Mensaje = require("../../models/mensaje.model.js");
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

            // Obtener mapeo de campos de la plantilla (variables → campos)
            const formatoCampoPlantillaModel = new FormatoCampoPlantillaModel();
            const camposPlantilla = await formatoCampoPlantillaModel.getAllByPlantilla(plantilla.id);

            // Detectar parámetros en el body de la plantilla ({{1}}, {{2}}, etc.)
            const bodyParams = plantilla.body ? (plantilla.body.match(/\{\{\d+\}\}/g) || []) : [];
            const numBodyParams = new Set(bodyParams).size;

            // Columnas directas de base_numero_detalle
            const DIRECT_COLUMNS = ['telefono', 'nombre', 'correo', 'tipo_documento', 'numero_documento'];

            // Obtener las bases asociadas al envío
            const envioBaseRecords = await EnvioPersonaModel.getByEnvioMasivo(id);
            logger.info(`[envioMasivoWhatsapp.controller.js] Envio ${id}: ${envioBaseRecords.length} bases, ${camposPlantilla.length} campos mapeados, ${numBodyParams} params en plantilla`);

            if (envioBaseRecords.length === 0) {
                return res.status(400).json({ msg: "No hay bases asociadas a este envío" });
            }

            // Actualizar estado del envio masivo (en proceso de envio)
            await EnvioMasivoWhatsappModel.updateEstado(id, 'entregado', userId);

            let cantidadExitosos = 0;
            let cantidadFallidos = 0;
            const baseNumeroDetalleModel = new BaseNumeroDetalleModel();

            for (const eb of envioBaseRecords) {
                // Solo procesar bases pendientes
                if (eb.estado !== 'pendiente') {
                    continue;
                }

                try {
                    // Obtener todos los registros de base_numero_detalle de esta base
                    const detalles = await baseNumeroDetalleModel.getAllByBaseNumeroSinPaginar(eb.id_base);
                    logger.info(`[envioMasivoWhatsapp.controller.js] Base ${eb.id_base}: ${detalles.length} registros`);

                    for (const detalle of detalles) {
                        const celular = detalle.telefono;
                        if (!celular) {
                            cantidadFallidos++;
                            continue;
                        }

                        try {
                            // Construir components resolviendo variables desde los campos mapeados
                            const components = [];

                            if (camposPlantilla.length > 0 && numBodyParams > 0) {
                                // Resolver variables usando el mapeo de campos
                                const bodyParameters = camposPlantilla.map((campo) => {
                                    const nombreCampo = campo.nombre_campo;
                                    let valor = '';

                                    if (DIRECT_COLUMNS.includes(nombreCampo)) {
                                        // Campo es una columna directa de base_numero_detalle
                                        valor = detalle[nombreCampo] || '';
                                    } else if (detalle.json_adicional) {
                                        // Buscar en json_adicional
                                        const jsonData = typeof detalle.json_adicional === 'string'
                                            ? JSON.parse(detalle.json_adicional)
                                            : detalle.json_adicional;
                                        valor = jsonData?.[nombreCampo] || '';
                                    }

                                    return { type: 'text', text: String(valor) || '' };
                                });
                                components.push({ type: 'body', parameters: bodyParameters });
                            } else if (numBodyParams > 0) {
                                // Sin mapeo de campos, fallback: usar nombre para {{1}}
                                const bodyParameters = [];
                                for (let p = 0; p < numBodyParams; p++) {
                                    const valor = p === 0 ? (detalle.nombre || 'Cliente') : '';
                                    bodyParameters.push({ type: 'text', text: valor });
                                }
                                components.push({ type: 'body', parameters: bodyParameters });
                            }

                            await whatsappGraphService.enviarPlantilla(
                                idEmpresa,
                                celular,
                                plantilla.name,
                                plantilla.language || 'es',
                                components
                            );

                            cantidadExitosos++;

                            // Actualizar persona y registrar mensaje en BD
                            try {
                                let personaBd = await Persona.selectByCelular(celular, idEmpresa);
                                if (!personaBd) {
                                    personaBd = await Persona.createPersona({
                                        id_estado: 1,
                                        celular: celular,
                                        nombre_completo: detalle.nombre || null,
                                        id_empresa: idEmpresa,
                                        usuario_registro: userId
                                    });
                                    if (!personaBd || !personaBd.id) {
                                        personaBd = await Persona.selectByCelular(celular, idEmpresa);
                                    }
                                }

                                if (personaBd && personaBd.id) {
                                    await Persona.updatePersona(personaBd.id, {
                                        id_ref_base_num_detalle: detalle.id,
                                        usuario_actualizacion: userId
                                    });

                                    let chat = await Chat.findByPersona(personaBd.id);
                                    if (!chat) {
                                        const chatId = await Chat.create({
                                            id_empresa: idEmpresa,
                                            id_persona: personaBd.id,
                                            usuario_registro: userId
                                        });
                                        chat = { id: chatId };
                                    }

                                    // Reemplazar {{1}}, {{2}}, etc. con los valores reales enviados
                                    let contenidoMensaje = plantilla.body || `[Envío masivo] Plantilla: ${plantilla.name}`;
                                    const bodyComp = components.find(c => c.type === 'body');
                                    if (bodyComp && bodyComp.parameters) {
                                        bodyComp.parameters.forEach((param, i) => {
                                            contenidoMensaje = contenidoMensaje.replace(`{{${i + 1}}}`, param.text);
                                        });
                                    }

                                    await Mensaje.create({
                                        id_chat: chat.id,
                                        contenido: contenidoMensaje,
                                        direccion: "out",
                                        wid_mensaje: null,
                                        tipo_mensaje: "plantilla",
                                        fecha_hora: new Date(),
                                        usuario_registro: userId
                                    });
                                }
                            } catch (personaError) {
                                logger.error(`[envioMasivoWhatsapp.controller.js] Error actualizando persona/mensaje para ${celular}: ${personaError.message}`);
                            }
                        } catch (sendError) {
                            const errorMsg = sendError.response?.data?.error?.message || sendError.message || 'Error desconocido';
                            cantidadFallidos++;
                            logger.error(`[envioMasivoWhatsapp.controller.js] Error enviando a ${celular}: ${errorMsg}`);
                        }

                        // Delay entre mensajes para evitar rate limiting
                        if (DELAY_BETWEEN_MESSAGES > 0) {
                            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));
                        }
                    }

                    // Marcar la base como entregada
                    await EnvioPersonaModel.updateEstado(eb.id, 'entregado', null, userId);
                } catch (baseError) {
                    await EnvioPersonaModel.updateEstado(eb.id, 'cancelado', baseError.message, userId);
                    logger.error(`[envioMasivoWhatsapp.controller.js] Error procesando base ${eb.id_base}: ${baseError.message}`);
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
