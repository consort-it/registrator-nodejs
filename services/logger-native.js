/** Logger Service using winston */
var winston = require('winston');
var logger;

if (process.env.ENV !== 'test') {

  logger = new (winston.Logger)({
      transports: [
        new (winston.transports.Console)({
          level: process.env.LOG_LEVEL,
          json: false,
          colorize: true,
          formatter: (args) => {
             var logMessage = new Date().toISOString().replace('.',',') + " " + args.level.toUpperCase() + " " + process.env.SVC_NAME + " " + process.env.SVC_BUILD +
                              " " + args.message;
             return logMessage;
          }
        })
      ]
    });
} else {
    // while testing, log only to file, leaving stdout free for unit test status messages
    logger = new (winston.Logger)({
        transports: [
            new (winston.transports.File)({ filename: 'unit-test.log' })
        ]
    });
}

module.exports = logger;
