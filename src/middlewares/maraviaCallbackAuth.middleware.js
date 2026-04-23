/**
 * Middleware para autenticar callbacks entrantes desde el PHP de Maravia.
 * Valida el header Authorization: Bearer <MARAVIA_CALLBACK_KEY>
 */

const validateMaraviaCallback = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = authHeader.slice(7);

  if (!process.env.MARAVIA_CALLBACK_KEY || token !== process.env.MARAVIA_CALLBACK_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  next();
};

module.exports = { validateMaraviaCallback };
