const winston = require('winston');
require('winston-daily-rotate-file');
const { getContext } = require('./traceContext');

const customTimestamp = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hour = now.getHours().toString().padStart(2, '0');
  const minute = now.getMinutes().toString().padStart(2, '0');
  const second = now.getSeconds().toString().padStart(2, '0');
  return `${day}-${month}-${year} / ${hour}:${minute}:${second}`;
};

// Inyecta el contexto de traza activo en cada línea de log
const contextFormat = winston.format((info) => {
    const ctx = getContext();
    if (ctx.traceId) Object.assign(info, ctx);
    return info;
})();

const loggerInit = ({outputPath, show_logs_console = true} = {}) => {

  const transports = [
    new winston.transports.DailyRotateFile({
        filename: outputPath || 'app-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        maxSize: '20m',
        zippedArchive: true
    })
  ];

  if(show_logs_console){
    transports.push(new winston.transports.Console({format: winston.format.simple()}));
  }

  const level = 'info';

  return winston.createLogger({
    level: level,
    format: winston.format.combine(
      contextFormat,
      winston.format.timestamp({ format: customTimestamp }),
      winston.format.json()
    ),
    transports: transports
  });
}


module.exports = { loggerInit };
