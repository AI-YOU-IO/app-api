const EnvioMasivoWhatsappModel = require("../../models/envioMasivoWhatsapp.model.js");
const EnvioPersonaModel = require("../../models/envioBase.model.js");
const PlantillaWhatsappModel = require("../../models/plantillaWhatsapp.model.js");
const FormatoCampoPlantillaModel = require("../../models/formatoCampoPlantilla.model.js");
const whatsappGraphService = require("../../services/whatsapp/whatsappGraph.service.js");
const Persona = require("../../models/persona.model.js");
const Chat = require("../../models/chat.model.js");
const Mensaje = require("../../models/mensaje.model.js");
const logger = require('../../config/logger/loggerClient.js');

/**
 * Extrae el texto del body desde el array/string de components
 */
function extraerBodyDeComponents(components) {
    let comps = components;
    if (typeof comps === 'string') {
        try { comps = JSON.parse(comps); } catch { return ''; }
    }
    if (!Array.isArray(comps)) return '';
    const bodyComp = comps.find(c => (c.type || '').toUpperCase() === 'BODY');
    return bodyComp?.text || '';
}

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

    async validarEnvio(req, res) {
        try {
            const { id } = req.params;
            const { idEmpresa } = req.user || {};
            const warnings = [];

            const envio = await EnvioMasivoWhatsappModel.getById(id);
            if (!envio) {
                return res.status(404).json({ msg: "Envío masivo no encontrado" });
            }

            const plantilla = await PlantillaWhatsappModel.getById(envio.id_plantilla);
            if (!plantilla) {
                return res.status(400).json({ msg: "La plantilla asociada no fue encontrada" });
            }

            // Extraer body desde components y detectar parámetros
            const plantillaBody = extraerBodyDeComponents(plantilla.components);
            const bodyParams = plantillaBody ? (plantillaBody.match(/\{\{\d+\}\}/g) || []) : [];
            const numBodyParams = new Set(bodyParams).size;

            // Verificar si tiene parámetros pero no tiene campos mapeados
            const formatoCampoPlantillaModel = new FormatoCampoPlantillaModel();
            const camposPlantilla = await formatoCampoPlantillaModel.getAllByPlantilla(plantilla.id);

            if (numBodyParams > 0 && camposPlantilla.length === 0) {
                warnings.push({
                    tipo: 'sin_campos',
                    mensaje: `La plantilla tiene ${numBodyParams} variable(s) (${bodyParams.join(', ')}) pero no tiene campos mapeados. El envío fallará.`,
                    severidad: 'error'
                });
            } else if (numBodyParams > 0 && camposPlantilla.length < numBodyParams) {
                warnings.push({
                    tipo: 'campos_incompletos',
                    mensaje: `La plantilla tiene ${numBodyParams} variable(s) pero solo ${camposPlantilla.length} campo(s) mapeado(s). Las variables sin mapeo quedarán vacías y fallarán.`,
                    severidad: 'error'
                });
            }

            // Verificar datos faltantes en las bases
            if (camposPlantilla.length > 0) {
                const DIRECT_COLUMNS = ['telefono', 'nombre', 'correo', 'tipo_documento', 'numero_documento'];
                const envioBaseRecords = await EnvioPersonaModel.getByEnvioMasivo(id);
                const registrosPendientes = envioBaseRecords.filter(eb => eb.estado === 'pendiente');

                const camposFaltantes = {};
                for (const campo of camposPlantilla) {
                    camposFaltantes[campo.nombre_campo] = 0;
                }

                for (const eb of registrosPendientes) {
                    for (const campo of camposPlantilla) {
                        const nombreCampo = campo.nombre_campo;
                        let valor = '';

                        if (DIRECT_COLUMNS.includes(nombreCampo)) {
                            valor = eb[`detalle_${nombreCampo}`] || '';
                        } else if (eb.detalle_json_adicional) {
                            const jsonData = typeof eb.detalle_json_adicional === 'string'
                                ? JSON.parse(eb.detalle_json_adicional)
                                : eb.detalle_json_adicional;
                            valor = jsonData?.[nombreCampo] || '';
                        }

                        if (!String(valor).trim()) {
                            camposFaltantes[nombreCampo]++;
                        }
                    }
                }

                const totalRegistros = registrosPendientes.length;
                for (const [campo, faltantes] of Object.entries(camposFaltantes)) {
                    if (faltantes > 0) {
                        warnings.push({
                            tipo: 'datos_faltantes',
                            campo,
                            faltantes,
                            total: totalRegistros,
                            mensaje: `El campo "${campo}" está vacío en ${faltantes} de ${totalRegistros} registro(s). Estos envíos fallarán.`,
                            severidad: faltantes === totalRegistros ? 'error' : 'warning'
                        });
                    }
                }
            }

            return res.status(200).json({
                success: true,
                data: {
                    warnings,
                    tiene_errores: warnings.some(w => w.severidad === 'error'),
                    plantilla_name: plantilla.name,
                    num_params: numBodyParams,
                    num_campos: camposPlantilla.length
                }
            });
        } catch (error) {
            logger.error(`[envioMasivoWhatsapp.controller.js] Error al validar envío: ${error.message}`);
            return res.status(500).json({ msg: "Error al validar envío masivo" });
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

            // Extraer body desde components y detectar parámetros ({{1}}, {{2}}, etc.)
            const plantillaBody = extraerBodyDeComponents(plantilla.components);
            const bodyParams = plantillaBody ? (plantillaBody.match(/\{\{\d+\}\}/g) || []) : [];
            const numBodyParams = new Set(bodyParams).size;

            // Columnas directas de base_numero_detalle
            const DIRECT_COLUMNS = ['telefono', 'nombre', 'correo', 'tipo_documento', 'numero_documento'];

            // Obtener las bases asociadas al envío
            const envioBaseRecords = await EnvioPersonaModel.getByEnvioMasivo(id);
            logger.info(`[envioMasivoWhatsapp.controller.js] Envio ${id}: ${envioBaseRecords.length} registros, ${camposPlantilla.length} campos mapeados, ${numBodyParams} params en plantilla`);

            if (envioBaseRecords.length === 0) {
                return res.status(400).json({ msg: "No hay registros asociados a este envío" });
            }

            // Actualizar estado del envio masivo (en proceso)
            await EnvioMasivoWhatsappModel.updateEstado(id, 'en_proceso', userId);

            // Responder inmediatamente al frontend
            res.status(200).json({
                msg: "Envío masivo iniciado",
                data: { id, estado: 'en_proceso' }
            });

            // Procesar envío en background
            let cantidadExitosos = 0;
            let cantidadFallidos = 0;

            for (const eb of envioBaseRecords) {
                // Solo procesar registros pendientes
                if (eb.estado !== 'pendiente') {
                    continue;
                }

                try {
                    // eb.id_base ahora apunta a base_numero_detalle.id
                    // Los datos del detalle ya vienen en el JOIN del query
                    const detalle = {
                        id: eb.id_base,
                        telefono: eb.detalle_telefono,
                        nombre: eb.detalle_nombre,
                        correo: eb.detalle_correo,
                        tipo_documento: eb.detalle_tipo_documento,
                        numero_documento: eb.detalle_numero_documento,
                        json_adicional: eb.detalle_json_adicional
                    };

                    let celular = (detalle.telefono || '').trim().replace(/[\s\-\(\)\+]/g, '');
                    if (celular.startsWith('0')) celular = celular.substring(1);
                    if (celular.length <= 9 && celular.length > 0) celular = '51' + celular;
                    if (!celular) {
                        cantidadFallidos++;
                        await EnvioPersonaModel.updateEstado(eb.id, 'cancelado', 'Sin número de teléfono', userId);
                        await EnvioMasivoWhatsappModel.updateContadores(id, cantidadExitosos, cantidadFallidos);
                        continue;
                    }

                    try {
                        // Construir components resolviendo variables desde los campos mapeados
                        const components = [];

                        if (camposPlantilla.length > 0 && numBodyParams > 0) {
                            // Construir parámetros en orden, asegurando que haya uno por cada {{N}}
                            const bodyParameters = [];
                            const parametrosVacios = [];
                            for (let p = 0; p < numBodyParams; p++) {
                                const campo = camposPlantilla[p];
                                let valor = '';

                                if (campo) {
                                    const nombreCampo = campo.nombre_campo;
                                    if (DIRECT_COLUMNS.includes(nombreCampo)) {
                                        valor = detalle[nombreCampo] || '';
                                    } else if (detalle.json_adicional) {
                                        const jsonData = typeof detalle.json_adicional === 'string'
                                            ? JSON.parse(detalle.json_adicional)
                                            : detalle.json_adicional;
                                        valor = jsonData?.[nombreCampo] || '';
                                    }
                                }

                                if (!String(valor).trim()) {
                                    parametrosVacios.push(`{{${p + 1}}}${campo ? ` (${campo.nombre_campo})` : ''}`);
                                }
                                bodyParameters.push({ type: 'text', text: String(valor) });
                            }

                            // Si hay parámetros vacíos, saltar este registro
                            if (parametrosVacios.length > 0) {
                                const errorMsg = `Parámetros vacíos: ${parametrosVacios.join(', ')}`;
                                cantidadFallidos++;
                                await EnvioPersonaModel.updateEstado(eb.id, 'cancelado', errorMsg, userId);
                                await EnvioMasivoWhatsappModel.updateContadores(id, cantidadExitosos, cantidadFallidos);
                                logger.warn(`[envioMasivoWhatsapp.controller.js] ${celular}: ${errorMsg}`);
                                continue;
                            }

                            components.push({ type: 'body', parameters: bodyParameters });
                        } else if (numBodyParams > 0) {
                            const bodyParameters = [];
                            const parametrosVacios = [];
                            for (let p = 0; p < numBodyParams; p++) {
                                const valor = p === 0 ? (detalle.nombre || '') : '';
                                if (!valor) parametrosVacios.push(`{{${p + 1}}}`);
                                bodyParameters.push({ type: 'text', text: valor });
                            }

                            if (parametrosVacios.length > 0) {
                                const errorMsg = `Parámetros vacíos: ${parametrosVacios.join(', ')}`;
                                cantidadFallidos++;
                                await EnvioPersonaModel.updateEstado(eb.id, 'cancelado', errorMsg, userId);
                                await EnvioMasivoWhatsappModel.updateContadores(id, cantidadExitosos, cantidadFallidos);
                                logger.warn(`[envioMasivoWhatsapp.controller.js] ${celular}: ${errorMsg}`);
                                continue;
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
                        await EnvioPersonaModel.updateEstado(eb.id, 'entregado', null, userId);

                        // Actualizar persona y registrar mensaje en BD
                        try {
                            // Buscar o crear persona
                            let personaBd = await Persona.selectByCelular(celular, idEmpresa);
                            if (!personaBd) {
                                try {
                                    personaBd = await Persona.createPersona({
                                        id_estado: 1,
                                        celular: celular,
                                        nombre_completo: detalle.nombre || null,
                                        id_empresa: idEmpresa,
                                        usuario_registro: userId
                                    });
                                } catch (createErr) {
                                    logger.warn(`[envioMasivoWhatsapp.controller.js] Error creando persona ${celular}, reintentando busqueda: ${createErr.message}`);
                                }
                                // Siempre re-buscar si create falló o retornó vacío
                                if (!personaBd || !personaBd.id) {
                                    personaBd = await Persona.selectByCelular(celular, idEmpresa);
                                }
                            }

                            if (!personaBd || !personaBd.id) {
                                logger.error(`[envioMasivoWhatsapp.controller.js] No se pudo obtener/crear persona para ${celular}`);
                            } else {
                                await Persona.updatePersona(personaBd.id, {
                                    id_ref_base_num_detalle: detalle.id,
                                    usuario_actualizacion: userId
                                });

                                // Buscar o crear chat
                                let chat = await Chat.findByPersona(personaBd.id);
                                if (!chat) {
                                    const chatId = await Chat.create({
                                        id_empresa: idEmpresa,
                                        id_persona: personaBd.id,
                                        usuario_registro: userId
                                    });
                                    if (chatId) {
                                        chat = { id: chatId };
                                    }
                                }

                                if (!chat || !chat.id) {
                                    logger.error(`[envioMasivoWhatsapp.controller.js] No se pudo obtener/crear chat para persona ${personaBd.id} (${celular})`);
                                } else {
                                    let contenidoMensaje = plantillaBody || `[Envío masivo] Plantilla: ${plantilla.name}`;
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
                            }
                        } catch (personaError) {
                            logger.error(`[envioMasivoWhatsapp.controller.js] Error persona/chat/mensaje para ${celular}: ${personaError.message}`);
                        }
                    } catch (sendError) {
                        const errorMsg = sendError.response?.data?.error?.message || sendError.message || 'Error desconocido';
                        cantidadFallidos++;
                        await EnvioPersonaModel.updateEstado(eb.id, 'cancelado', errorMsg, userId);
                        logger.error(`[envioMasivoWhatsapp.controller.js] Error enviando a ${celular}: ${errorMsg}`);
                    }

                    // Actualizar contadores en BD progresivamente
                    await EnvioMasivoWhatsappModel.updateContadores(id, cantidadExitosos, cantidadFallidos);

                    // Delay entre mensajes para evitar rate limiting
                    if (DELAY_BETWEEN_MESSAGES > 0) {
                        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));
                    }
                } catch (baseError) {
                    cantidadFallidos++;
                    await EnvioPersonaModel.updateEstado(eb.id, 'cancelado', baseError.message, userId);
                    await EnvioMasivoWhatsappModel.updateContadores(id, cantidadExitosos, cantidadFallidos);
                    logger.error(`[envioMasivoWhatsapp.controller.js] Error procesando detalle ${eb.id_base}: ${baseError.message}`);
                }
            }

            // Actualizar contadores y estado final según resultados
            await EnvioMasivoWhatsappModel.updateContadores(id, cantidadExitosos, cantidadFallidos);

            let estadoFinal = 'entregado';
            if (cantidadExitosos === 0 && cantidadFallidos > 0) {
                estadoFinal = 'cancelado';
            } else if (cantidadFallidos > 0) {
                estadoFinal = 'pendiente';
            }
            await EnvioMasivoWhatsappModel.updateEstado(id, estadoFinal, userId);

            logger.info(`[envioMasivoWhatsapp.controller.js] Envío masivo ${id} completado: ${cantidadExitosos} exitosos, ${cantidadFallidos} fallidos, estado: ${estadoFinal}`);

        } catch (error) {
            logger.error(`[envioMasivoWhatsapp.controller.js] Error al ejecutar envío masivo: ${error.message}`);
            // Marcar como cancelado si falla el proceso
            try {
                await EnvioMasivoWhatsappModel.updateEstado(req.params.id, 'cancelado', req.user?.userId);
            } catch (_) {}
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
