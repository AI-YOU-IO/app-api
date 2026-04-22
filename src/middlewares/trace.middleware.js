const { randomUUID } = require('crypto');
const { runWithContext } = require('../config/logger/traceContext');
const logger = require('../config/logger/loggerClient');

const traceMiddleware = (req, res, next) => {
    const traceId = randomUUID();
    req.traceId = traceId;
    res.setHeader('X-Trace-Id', traceId);

    runWithContext({ traceId }, () => {
        logger.info(`[trace] ${req.method} ${req.path}`);
        next();
    });
};

module.exports = traceMiddleware;
