import { getState as getAMIState, isConnected as isAMIConnected, executeCommand } from '../services/ami.service.js';
import { getState as getARIState, isConnected as isARIConnected } from '../services/ari.service.js';
import tools from '../tools/index.js';
import os from 'os';

export async function getSystemStatus(req, res) {
  try {
    const amiConnected = isAMIConnected();
    const ariConnected = isARIConnected();

    res.json({
      success: true,
      data: {
        ami: {
          connected: amiConnected,
          status: amiConnected ? 'online' : 'offline'
        },
        ari: {
          connected: ariConnected,
          status: ariConnected ? 'online' : 'offline'
        },
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          platform: os.platform(),
          hostname: os.hostname()
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getAsteriskInfo(req, res) {
  try {
    let coreInfo = null;
    let channelCount = null;

    try {
      coreInfo = await executeCommand('core show version');
      channelCount = await executeCommand('core show channels count');
    } catch (err) {
      // AMI not available
    }

    res.json({
      success: true,
      data: {
        version: coreInfo?.output || 'Not available',
        channels: channelCount?.output || 'Not available'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getDashboardData(req, res) {
  try {
    const amiState = getAMIState();
    const ariState = getARIState();

    res.json({
      success: true,
      data: {
        activeCalls: amiState.activeCalls.length + ariState.channels.length,
        registeredExtensions: amiState.extensions.length,
        amiConnected: isAMIConnected(),
        ariConnected: isARIConnected(),
        recentEvents: [
          ...amiState.lastEvents.slice(0, 10),
          ...ariState.lastEvents.slice(0, 10)
        ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getEvents(req, res) {
  try {
    const { source, limit = 50 } = req.query;
    const amiState = getAMIState();
    const ariState = getARIState();

    let events = [];

    if (!source || source === 'all') {
      events = [
        ...amiState.lastEvents.map(e => ({ ...e, source: 'ami' })),
        ...ariState.lastEvents.map(e => ({ ...e, source: 'ari' }))
      ];
    } else if (source === 'ami') {
      events = amiState.lastEvents.map(e => ({ ...e, source: 'ami' }));
    } else if (source === 'ari') {
      events = ariState.lastEvents.map(e => ({ ...e, source: 'ari' }));
    }

    // Sort by timestamp and limit
    events = events
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      data: events
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function executeAMICommand(req, res) {
  try {
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'Command is required'
      });
    }

    const result = await executeCommand(command);

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

/**
 * GET /api/system/tools
 * Get all available tool names grouped by category
 */
export async function getTools(req, res) {
  try {
    const { category } = req.query;

    // Si se especifica una categoría, devolver solo esa
    if (category && tools[category]) {
      const names = tools[category].map(tool =>
        tool.toolName || tool.temporaryTool?.modelToolName
      ).filter(Boolean);

      return res.json({
        success: true,
        category,
        count: names.length,
        tools: names
      });
    }

    // Devolver todas las tools agrupadas por categoría (solo nombres)
    const allTools = {};
    for (const [cat, toolsList] of Object.entries(tools)) {
      allTools[cat] = toolsList.map(tool =>
        tool.toolName || tool.temporaryTool?.modelToolName
      ).filter(Boolean);
    }

    res.json({
      success: true,
      categories: Object.keys(tools),
      tools: allTools
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
