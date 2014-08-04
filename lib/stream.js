var util         = require('util');
var stream       = require('stream');
var packet       = require('./packet.js');
var commands     = packet.commands;

function AdbStream(conn) {
  stream.Duplex.call(this);
  this._conn = conn;
  conn._nextStreamId += 1;
  this._localId = conn._nextStreamId;
  this._remoteId = -1;
}
util.inherits(AdbStream, stream.Duplex);

AdbStream.prototype.localId = function() { return this._localId; };

AdbStream.prototype.remoteId = function() { return this._remoteId; };

AdbStream.prototype._write = function(data, encoding, cb) {
  console.log('WRITE CALLED!:', data.toString());
  if (this._remoteId != -1) {
    this._conn._writePacket(commands.WRTE, this._localId, this._remoteId, data);
  } else {
    var self = this;
    this.on('_CNXN', function() {
      self._conn._writePacket(commands.WRTE, 0, self._remoteId, data);
    });
  }
  // TODO: wait for OKAY?
  cb();
};

AdbStream.prototype._read = function(n) {
  console.log('READ CALLED', n);
};

module.exports = AdbStream;
