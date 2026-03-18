const { Router } = require("express");
const TranscripcionModel = require("../../models/transcripcion.model");

const router = Router();
const model = new TranscripcionModel();

// Obtener transcripciones por provider_call_id
router.get("/transcripciones/:providerCallId", async (req, res) => {
  try {
    const { providerCallId } = req.params;
    const transcripciones = await model.getByProviderCallId(providerCallId);

    return res.success(200, 'Transcripciones obtenidas', transcripciones);
  } catch (err) {
    console.error('Error al obtener transcripciones:', err);
    return res.serverError(500, 'Error al obtener transcripciones');
  }
});

// Obtener transcripciones por id_llamada
router.get("/transcripciones/llamada/:idLlamada", async (req, res) => {
  try {
    const { idLlamada } = req.params;
    const transcripciones = await model.getByLlamada(idLlamada);

    return res.success(200, 'Transcripciones obtenidas', transcripciones);
  } catch (err) {
    console.error('Error al obtener transcripciones por llamada:', err);
    return res.serverError(500, 'Error al obtener transcripciones');
  }
});

// Crear transcripcion usando provider_call_id
router.post("/transcripcion", async (req, res) => {
  try {
    const { provider_call_id, speaker, texto, ordinal } = req.body;

    if (!provider_call_id) {
      return res.error(400, 'provider_call_id es requerido');
    }

    // Obtener id_llamada a partir del provider_call_id
    const idLlamada = await model.getIdLlamadaByProviderCallId(provider_call_id);

    if (!idLlamada) {
      return res.error(404, 'No se encontro llamada con ese provider_call_id');
    }

    const id = await model.create({
      id_llamada: idLlamada,
      speaker,
      texto,
      ordinal
    });

    return res.success(200, 'Transcripcion guardada exitosamente', { id });
  } catch (err) {
    console.error('Error al guardar transcripcion:', err);
    return res.serverError(500, 'Error al guardar transcripcion');
  }
});

// Crear multiples transcripciones (bulk)
router.post("/transcripciones/bulk", async (req, res) => {
  try {
    const { provider_call_id, transcripciones } = req.body;

    if (!provider_call_id) {
      return res.error(400, 'provider_call_id es requerido');
    }

    if (!transcripciones || !Array.isArray(transcripciones)) {
      return res.error(400, 'transcripciones debe ser un array');
    }

    // Obtener id_llamada a partir del provider_call_id
    const idLlamada = await model.getIdLlamadaByProviderCallId(provider_call_id);

    if (!idLlamada) {
      return res.error(404, 'No se encontro llamada con ese provider_call_id');
    }

    const ids = [];
    for (let i = 0; i < transcripciones.length; i++) {
      const t = transcripciones[i];
      const id = await model.create({
        id_llamada: idLlamada,
        speaker: t.speaker,
        texto: t.texto,
        ordinal: t.ordinal || i + 1
      });
      ids.push(id);
    }

    return res.success(200, 'Transcripciones guardadas exitosamente', { ids, count: ids.length });
  } catch (err) {
    console.error('Error al guardar transcripciones:', err);
    return res.serverError(500, 'Error al guardar transcripciones');
  }
});

module.exports = router;
