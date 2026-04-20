import { getState as getAMIState, hangupChannel as amiHangup, originateUltravoxCall, redirectCall } from '../services/ami.service.js';
import { createAudioSession, getAllAudioSessions, addToQueue, addToQueueBatch, getQueueSize, setCampaignConfig, getCampaignConfig, isWithinSchedule } from '../services/external-media.service.js';
import { getState as getARIState, hangupChannel as ariHangup, playSound } from '../services/ari.service.js';
import { speak, hangup, getAllBotSessions } from '../services/call.service.js';

// Mutex para evitar race condition en límite de canales
const channelLocks = new Map(); // empresaId-plataforma -> Promise

async function acquireChannelLock(empresaId, plataforma) {
  const key = `${empresaId}-${plataforma}`;
  while (channelLocks.has(key)) {
    await channelLocks.get(key);
  }
  let releaseLock;
  const lockPromise = new Promise(resolve => { releaseLock = resolve; });
  channelLocks.set(key, lockPromise);
  return () => {
    channelLocks.delete(key);
    releaseLock();
  };
}

export async function getActiveCalls(req, res) {
  try {
    const amiState = getAMIState();
    const ariState = getARIState();

    // Combine calls from both AMI and ARI
    const calls = [
      ...amiState.activeCalls.map(call => ({ ...call, source: 'ami' })),
      ...ariState.channels.map(channel => ({ ...channel, source: 'ari' }))
    ];

    res.json({
      success: true,
      data: calls
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getCallDetails(req, res) {
  try {
    const { id } = req.params;
    const amiState = getAMIState();
    const ariState = getARIState();

    // Search in AMI calls
    let call = amiState.activeCalls.find(c => c.uniqueid === id);
    if (call) {
      return res.json({
        success: true,
        data: { ...call, source: 'ami' }
      });
    }

    // Search in ARI channels
    call = ariState.channels.find(c => c.id === id);
    if (call) {
      return res.json({
        success: true,
        data: { ...call, source: 'ari' }
      });
    }

    res.status(404).json({
      success: false,
      error: 'Call not found'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function hangupCall(req, res) {
  try {
    const { id } = req.params;
    const { source } = req.query;

    let result;

    if (source === 'ari') {
      result = await ariHangup(id);
    } else {
      result = await amiHangup(id);
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function speakOnCall(req, res) {
  try {
    const { id } = req.params;
    const { text, voice } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    const result = await speak(id, text, { voice });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function playSoundOnCall(req, res) {
  try {
    const { id } = req.params;
    const { sound } = req.body;

    if (!sound) {
      return res.status(400).json({
        success: false,
        error: 'Sound file path is required'
      });
    }

    const result = await playSound(id, sound);

    res.json({
      success: true,
      data: {
        playbackId: result.id
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getBotSessions(req, res) {
  try {
    const sessions = getAllBotSessions();

    res.json({
      success: true,
      data: sessions
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Originate a call with Ultravox AI using AudioSocket/External Media
 * POST /api/calls/ultravox
 * Body: { destination, data }
 */
export async function makeUltravoxCall(req, res) {
  try {
    const backend = `https://${req.headers['x-origin-service']}`;
    const { destination, data, extras, _ref } = req.body;

    // Debug: ver qué contiene data
    console.log(`[Ultravox] data recibido:`, JSON.stringify(data), `id_llamada: ${data?.id_llamada}`);

    if (!destination) {
      return res.status(400).json({
        success: false,
        error: 'Destination number is required'
      });
    }

    // Obtener ID de campaña, plataforma y configuración de horarios
    const campaniaId = extras?.id_campania || null;
    const configLlamadas = extras?.config_llamadas || null;
    const plataforma = extras?.plataforma || 'DEFAULT';
    const empresaId = extras?.empresa?.id;

    // Guardar configuración de la campaña si existe
    if (campaniaId && configLlamadas && empresaId) {
      setCampaignConfig(campaniaId, configLlamadas, empresaId, plataforma);
    }

    // Verificar si está dentro del horario permitido
    const dentroDeHorario = isWithinSchedule(configLlamadas);

    // Si está fuera de horario, encolar directamente
    if (!dentroDeHorario && empresaId) {
      const queuePosition = addToQueue(empresaId, plataforma, {
        destination,
        data,
        extras,
        _ref,
        url: backend
      }, campaniaId);

      return res.status(202).json({
        success: true,
        data: {
          queued: true,
          queuePosition,
          reason: 'outside_schedule',
          plataforma,
          message: `Llamada encolada en posición ${queuePosition} (fuera de horario)`
        }
      });
    }

    // Validar límite de canales simultáneos (con mutex para evitar race condition)
    let releaseLock = null;
    if (extras?.canal && empresaId) {
      releaseLock = await acquireChannelLock(empresaId, plataforma);

      const llamadasActivas = getAllAudioSessions(empresaId, plataforma).length;
      if (llamadasActivas >= extras.canal) {
        releaseLock(); // Liberar el lock antes de retornar
        // Encolar la llamada en lugar de rechazarla
        const queuePosition = addToQueue(empresaId, plataforma, {
          destination,
          data,
          extras,
          _ref,
          url: backend
        }, campaniaId);

        return res.status(202).json({
          success: true,
          data: {
            queued: true,
            queuePosition,
            activeCalls: llamadasActivas,
            maxCalls: extras.canal,
            plataforma,
            message: `Llamada encolada en posición ${queuePosition}`
          }
        });
      }
    }

    // Originate the call - this generates the channelId
    const trunk = extras?.trunk || 'svip_bitel';
    const prefijoTroncal = extras?.prefijo_troncal || null;
    const result = await originateUltravoxCall(
      destination,
      empresaId,
      data?.id_llamada,
      trunk,
      prefijoTroncal
    );

    // Now pre-create the audio session with the SAME channelId that Asterisk will use
    await createAudioSession(result.channelId, {
      destination: result.destination,
      data: data,
      extras: extras,
      _ref,
      record: result.record,
      recordDate: result.recordDate,
      url: backend
    });

    // Liberar el lock después de crear la sesión
    if (releaseLock) releaseLock();

    res.json({
      success: true,
      data: {
        ...result,
        plataforma,
        mode: 'ultravox-audiosocket'
      }
    });

  } catch (error) {
    // Liberar el lock en caso de error
    if (releaseLock) releaseLock();
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Originate multiple calls with Ultravox AI (batch)
 * POST /api/calls/ultravox/batch
 * Body: { calls: [{ destination, data }], extras }
 */
export async function makeUltravoxCallBatch(req, res) {
  try {
    const backend = `https://${req.headers['x-origin-service']}`;
    const { calls, extras } = req.body;

    if (!calls || !Array.isArray(calls) || calls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'calls array is required and must not be empty'
      });
    }

    const campaniaId = extras?.id_campania || null;
    const configLlamadas = extras?.config_llamadas || null;
    const plataforma = extras?.plataforma || 'DEFAULT';
    const empresaId = extras?.empresa?.id;
    const canal = extras?.canal || 10;

    // Guardar configuración de la campaña si existe
    if (campaniaId && configLlamadas && empresaId) {
      setCampaignConfig(campaniaId, configLlamadas, empresaId, plataforma);
    }

    // Preparar todas las llamadas para encolar en batch
    const callsToQueue = calls
      .filter(call => call.destination)
      .map(call => ({
        destination: call.destination,
        data: call.data,
        extras,
        _ref: call._ref,
        url: backend
      }));

    // Encolar todas de una vez (eficiente)
    const encoladas = addToQueueBatch(empresaId, plataforma, callsToQueue, campaniaId);

    res.json({
      success: true,
      total: calls.length,
      encoladas,
      mensaje: `${encoladas} llamadas encoladas para procesar`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get all active audio sessions (Ultravox calls)
 * GET /api/calls/ultravox/sessions/:id?plataforma=APP
 */
export async function getUltravoxSessions(req, res) {
  try {
    const { id } = req.params;
    const { plataforma } = req.query;
    const sessions = getAllAudioSessions(id, plataforma);

    res.json({
      success: true,
      data: sessions
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function redirectThroughAsterisk(req, res) {
  try {
    const { id } = req.params;
    const result = await redirectCall(id);

    res.status(200).json({
      success: true,
      data: {
        ...result,
        mode: "Redireccionamiento"
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
