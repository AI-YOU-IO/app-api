/**
 * Middleware para autenticar llamadas desde n8n usando API Key
 * Se espera el header X-Cron-Key o query param cron_key
 */

const N8N_API_KEY = process.env.N8N_API_KEY;

const validateN8nApiKey = (req, res, next) => {
  const apiKey = req.headers['x-auna-cron-key'] || req.query.cron_key;

  if (!apiKey || apiKey !== N8N_API_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  next();
};

module.exports = { validateN8nApiKey };
