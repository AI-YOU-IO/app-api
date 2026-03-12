const ToolModel = require("../models/tool.model.js");
const logger = require('../config/logger/loggerClient.js');

class ToolController {
    // ==================== TOOLS ====================
    async getAll(req, res) {
        try {
            const { empresaId } = req.user || {};
            const toolModel = new ToolModel();
            const tools = await toolModel.getAll(empresaId);
            return res.success(200, 'Tools obtenidos correctamente', tools);
        } catch (error) {
            logger.error(`[tool.controller.js] Error al obtener tools: ${error.message}`);
            return res.serverError(500, 'Error al obtener tools');
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;
            const toolModel = new ToolModel();
            const tool = await toolModel.getById(id);
            if (!tool) {
                return res.clientError(404, 'Tool no encontrado');
            }
            return res.success(200, 'Tool obtenido correctamente', tool);
        } catch (error) {
            logger.error(`[tool.controller.js] Error al obtener tool: ${error.message}`);
            return res.serverError(500, 'Error al obtener tool');
        }
    }

    async getByIdWithParametros(req, res) {
        try {
            const { id } = req.params;
            const toolModel = new ToolModel();
            const tool = await toolModel.getByIdWithParametros(id);
            if (!tool) {
                return res.clientError(404, 'Tool no encontrado');
            }
            return res.success(200, 'Tool con parámetros obtenido correctamente', tool);
        } catch (error) {
            logger.error(`[tool.controller.js] Error al obtener tool con parámetros: ${error.message}`);
            return res.serverError(500, 'Error al obtener tool con parámetros');
        }
    }

    async create(req, res) {
        try {
            const { userId, empresaId } = req.user || {};
            const toolModel = new ToolModel();
            const id = await toolModel.create({
                ...req.body,
                id_empresa: empresaId,
                usuario_registro: userId
            });
            return res.success(201, 'Tool creado exitosamente', { id });
        } catch (error) {
            logger.error(`[tool.controller.js] Error al crear tool: ${error.message}`);
            if (error.message.includes('Ya existe')) {
                return res.clientError(400, error.message);
            }
            return res.serverError(500, 'Error al crear tool');
        }
    }

    async update(req, res) {
        try {
            const { userId } = req.user || {};
            const { id } = req.params;
            const toolModel = new ToolModel();
            const updated = await toolModel.update(id, {
                ...req.body,
                usuario_actualizacion: userId
            });
            if (!updated) {
                return res.clientError(404, 'Tool no encontrado');
            }
            return res.success(200, 'Tool actualizado exitosamente');
        } catch (error) {
            logger.error(`[tool.controller.js] Error al actualizar tool: ${error.message}`);
            if (error.message.includes('Ya existe')) {
                return res.clientError(400, error.message);
            }
            return res.serverError(500, 'Error al actualizar tool');
        }
    }

    async delete(req, res) {
        try {
            const { userId } = req.user || {};
            const { id } = req.params;
            const toolModel = new ToolModel();
            const deleted = await toolModel.delete(id, userId);
            if (!deleted) {
                return res.clientError(404, 'Tool no encontrado');
            }
            return res.success(200, 'Tool eliminado exitosamente');
        } catch (error) {
            logger.error(`[tool.controller.js] Error al eliminar tool: ${error.message}`);
            return res.serverError(500, 'Error al eliminar tool');
        }
    }

    // ==================== PARÁMETROS ====================
    async getParametros(req, res) {
        try {
            const { id } = req.params;
            const toolModel = new ToolModel();
            const parametros = await toolModel.getParametros(id);
            return res.success(200, 'Parámetros obtenidos correctamente', parametros);
        } catch (error) {
            logger.error(`[tool.controller.js] Error al obtener parámetros: ${error.message}`);
            return res.serverError(500, 'Error al obtener parámetros');
        }
    }

    async addParametro(req, res) {
        try {
            const { id } = req.params;
            const toolModel = new ToolModel();
            const parametroId = await toolModel.addParametro({
                id_tool: id,
                ...req.body
            });
            return res.success(201, 'Parámetro agregado exitosamente', { id: parametroId });
        } catch (error) {
            logger.error(`[tool.controller.js] Error al agregar parámetro: ${error.message}`);
            return res.serverError(500, 'Error al agregar parámetro');
        }
    }

    async updateParametro(req, res) {
        try {
            const { id, parametroId } = req.params;
            const toolModel = new ToolModel();
            const updated = await toolModel.updateParametro(parametroId, req.body);
            if (!updated) {
                return res.clientError(404, 'Parámetro no encontrado');
            }
            return res.success(200, 'Parámetro actualizado exitosamente');
        } catch (error) {
            logger.error(`[tool.controller.js] Error al actualizar parámetro: ${error.message}`);
            return res.serverError(500, 'Error al actualizar parámetro');
        }
    }

    async deleteParametro(req, res) {
        try {
            const { parametroId } = req.params;
            const toolModel = new ToolModel();
            const deleted = await toolModel.deleteParametro(parametroId);
            if (!deleted) {
                return res.clientError(404, 'Parámetro no encontrado');
            }
            return res.success(200, 'Parámetro eliminado exitosamente');
        } catch (error) {
            logger.error(`[tool.controller.js] Error al eliminar parámetro: ${error.message}`);
            return res.serverError(500, 'Error al eliminar parámetro');
        }
    }

    async updateParametros(req, res) {
        try {
            const { id } = req.params;
            const { parametros } = req.body;
            const toolModel = new ToolModel();
            await toolModel.updateParametros(id, parametros);
            return res.success(200, 'Parámetros actualizados exitosamente');
        } catch (error) {
            logger.error(`[tool.controller.js] Error al actualizar parámetros: ${error.message}`);
            return res.serverError(500, 'Error al actualizar parámetros');
        }
    }
}

module.exports = new ToolController();
