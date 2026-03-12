const { Router } = require("express");
const TranscripcionModel = require("../../models/transcripcion.model");

const router = Router();
const model = new TranscripcionModel();

router.get("/transcripciones/:idLlamada", async (req, res) => {
  try {
    const { idLlamada } = req.params;
    const transcripciones = await model.getAll(idLlamada);

    return res.success(200, 'Transcripciones obtenidas', transcripciones);
  } catch (err) {
    return res.serverError(500, 'Error al obtener transcripciones');
  }
});

router.post("/transcripcion", async (req, res) => {
  try {
    const { idLlamada, speaker, texto } = req.body;
    const id = await model.createTranscripcion({ idLlamada, speaker, texto });

    return res.success(200, 'Transcripcion guardada exitosamente', { id });
  } catch (err) {
    return res.serverError(500, 'Error al guardar transcripcion');
  }
});


module.exports = router;
