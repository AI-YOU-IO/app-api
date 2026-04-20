import { Router } from 'express';
import {
  getActiveCalls,
  getCallDetails,
  hangupCall,
  speakOnCall,
  playSoundOnCall,
  getBotSessions,
  makeUltravoxCall,
  makeUltravoxCallBatch,
  getUltravoxSessions,
  redirectThroughAsterisk
} from '../controllers/calls.controller.js';

const router = Router();

/**
 * GET /api/calls
 * Get all active calls
 */
router.get('/', getActiveCalls);

/**
 * GET /api/calls/sessions
 * Get all active bot sessions
 */
router.get('/sessions', getBotSessions);

/**
 * POST /api/calls/ultravox
 * Originate a new call with Ultravox AI using AudioSocket/External Media
 * Body: { destination, callerId, systemPrompt, greeting }
 */
router.post('/ultravox', makeUltravoxCall);

/**
 * POST /api/calls/ultravox/batch
 * Originate multiple calls with Ultravox AI
 * Body: { calls: [{ destination, data }], extras }
 */
router.post('/ultravox/batch', makeUltravoxCallBatch);

router.get("/transfer/:id", redirectThroughAsterisk);

/**
 * GET /api/calls/ultravox/sessions
 * Get all active Ultravox audio sessions
 */
router.get('/ultravox/sessions/:id', getUltravoxSessions);

/**
 * GET /api/calls/:id
 * Get details of a specific call
 */
router.get('/:id', getCallDetails);

/**
 * POST /api/calls/:id/hangup
 * Hangup a call
 */
router.post('/:id/hangup', hangupCall);

/**
 * POST /api/calls/:id/speak
 * Speak text on a call using TTS
 */
router.post('/:id/speak', speakOnCall);

/**
 * POST /api/calls/:id/play
 * Play a sound file on a call
 */
router.post('/:id/play', playSoundOnCall);

export default router;
