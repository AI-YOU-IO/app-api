const PromptAsistenteModel = require("../../models/promptAsistente.model");
const logger = require("../../config/logger/loggerClient");

const _cache = {};
const promptModel = new PromptAsistenteModel();

async function getPromptByEmpresa(id_empresa) {
    if (_cache[id_empresa]) return _cache[id_empresa];

    const record = await promptModel.getByEmpresa(id_empresa);
    if (!record || !record.prompt_sistema) {
        throw new Error(`No se encontró prompt_asistente para la empresa ${id_empresa}`);
    }

    _cache[id_empresa] = record.prompt_sistema;
    logger.info(`[promptCache] Prompt cargado desde BD para empresa ${id_empresa}`);
    return _cache[id_empresa];
}

async function buildSystemPrompt({ persona, timestamp, id_empresa }) {
    const template = await getPromptByEmpresa(id_empresa);
    logger.info(`[promptCache] Datos persona ${JSON.stringify(persona)}`);

    return template
        .replace("{{datos}}", JSON.stringify(persona))
        .replace("{{timestamp}}", timestamp);
}

function clearCache(id_empresa) {
    if (id_empresa) {
        delete _cache[id_empresa];
    } else {
        Object.keys(_cache).forEach(k => delete _cache[k]);
    }
}

module.exports = { buildSystemPrompt, clearCache };
