var AdbHostClient = require('./lib/client.js');

function createConnection(opts, cb) {
  return new AdbHostClient(opts, cb);
}

module.exports.createConnection = createConnection;
