import { Router } from 'express';
import {
  getAllExtensions,
  getExtension,
  createExtension,
  updateExtension,
  deleteExtension,
  getExtensionStatus
} from '../controllers/extensions.controller.js';

const router = Router();

/**
 * GET /api/extensions
 * Get all extensions
 */
router.get('/', getAllExtensions);

/**
 * GET /api/extensions/:number
 * Get a specific extension
 */
router.get('/:number', getExtension);

/**
 * POST /api/extensions
 * Create a new extension
 */
router.post('/', createExtension);

/**
 * PUT /api/extensions/:number
 * Update an extension
 */
router.put('/:number', updateExtension);

/**
 * DELETE /api/extensions/:number
 * Delete an extension
 */
router.delete('/:number', deleteExtension);

/**
 * GET /api/extensions/:number/status
 * Get real-time status from Asterisk
 */
router.get('/:number/status', getExtensionStatus);

export default router;
