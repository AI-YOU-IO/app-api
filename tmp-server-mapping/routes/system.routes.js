import { Router } from 'express';
import {
  getSystemStatus,
  getAsteriskInfo,
  getDashboardData,
  getEvents,
  executeAMICommand,
  getTools,
} from '../controllers/system.controller.js';

const router = Router();

/**
 * GET /api/system/status
 * Get system status (AMI, ARI, server info)
 */
router.get('/status', getSystemStatus);

/**
 * GET /api/system/asterisk
 * Get Asterisk version and info
 */
router.get('/asterisk', getAsteriskInfo);

/**
 * GET /api/system/dashboard
 * Get dashboard overview data
 */
router.get('/dashboard', getDashboardData);

/**
 * GET /api/system/events
 * Get recent events (AMI/ARI)
 */
router.get('/events', getEvents);

/**
 * POST /api/system/command
 * Execute an AMI command
 */
router.post('/command', executeAMICommand);

/**
 * GET /api/system/tools
 * Get all available tools
 * Query params: ?category=generica|auna|bitel|viva|encuesta
 */
router.get('/tools', getTools);

export default router;
