const { loggerInit } = require('./loggerInit');
const path = require('path');
const fs = require('fs');

const logDir = process.env.PATH_LOG_DIR || path.join(__dirname, '../../../logs');
fs.mkdirSync(logDir, { recursive: true });

const outputPath = path.join(logDir, 'app-%DATE%.log');

const logger = loggerInit({
    outputPath: outputPath,
    show_logs_console: true
});

module.exports = logger;
