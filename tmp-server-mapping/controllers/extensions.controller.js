import { getState, executeCommand } from '../services/ami.service.js';

// In-memory storage for simulated extensions
const extensions = new Map();

// Initialize with some sample data
extensions.set('1001', { number: '1001', name: 'Recepción', context: 'internal', status: 'unknown' });
extensions.set('1002', { number: '1002', name: 'Ventas', context: 'internal', status: 'unknown' });
extensions.set('1003', { number: '1003', name: 'Soporte', context: 'internal', status: 'unknown' });

export async function getAllExtensions(req, res) {
  try {
    const amiState = getState();
    const extensionList = Array.from(extensions.values());

    // Merge with real AMI status if available
    for (const ext of extensionList) {
      const amiExt = amiState.extensions.find(e => e.peer && e.peer.includes(ext.number));
      if (amiExt) {
        ext.status = amiExt.status;
        ext.address = amiExt.address;
      }
    }

    res.json({
      success: true,
      data: extensionList
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getExtension(req, res) {
  try {
    const { number } = req.params;
    const extension = extensions.get(number);

    if (!extension) {
      return res.status(404).json({
        success: false,
        error: 'Extension not found'
      });
    }

    // Try to get real status from AMI
    try {
      const result = await executeCommand(`pjsip show endpoint ${number}`);
      if (result && result.output) {
        extension.amiInfo = result.output;
      }
    } catch (err) {
      // AMI not available, continue with stored data
    }

    res.json({
      success: true,
      data: extension
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function createExtension(req, res) {
  try {
    const { number, name, context } = req.body;

    if (!number || !name) {
      return res.status(400).json({
        success: false,
        error: 'Number and name are required'
      });
    }

    if (extensions.has(number)) {
      return res.status(409).json({
        success: false,
        error: 'Extension already exists'
      });
    }

    const extension = {
      number,
      name,
      context: context || 'internal',
      status: 'unknown',
      createdAt: new Date().toISOString()
    };

    extensions.set(number, extension);

    res.status(201).json({
      success: true,
      data: extension
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function updateExtension(req, res) {
  try {
    const { number } = req.params;
    const { name, context } = req.body;

    if (!extensions.has(number)) {
      return res.status(404).json({
        success: false,
        error: 'Extension not found'
      });
    }

    const extension = extensions.get(number);

    if (name) extension.name = name;
    if (context) extension.context = context;
    extension.updatedAt = new Date().toISOString();

    extensions.set(number, extension);

    res.json({
      success: true,
      data: extension
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function deleteExtension(req, res) {
  try {
    const { number } = req.params;

    if (!extensions.has(number)) {
      return res.status(404).json({
        success: false,
        error: 'Extension not found'
      });
    }

    extensions.delete(number);

    res.json({
      success: true,
      message: 'Extension deleted'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getExtensionStatus(req, res) {
  try {
    const { number } = req.params;

    const result = await executeCommand(`pjsip show endpoint ${number}`);

    res.json({
      success: true,
      data: {
        number,
        output: result.output || result
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
