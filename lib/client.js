var util         = require('util');
var ee = require('events').EventEmitter;
var usb = require('usb');
var stream = require('stream');
var USBDevice = require('./usb');

var net          = require('net');
var stream       = require('stream');
var AdbStream    = require('./stream.js');
var AdbPacket    = require('./packet');
var commands = AdbPacket.commands;

function streamFromOpts(opts) {

  var stream;
  if(opts && opts.usb){
    stream = 0;
    var devices = usb.getDeviceList();
    var i;
    for(i = 0; i < devices.length; i++){
      var usb_dev = devices[i];
      var obj = USBDevice.is_adb_available(usb_dev);
      if(obj === null || obj === undefined) continue;
      return new USBDevice(obj);
    }
  }

  if (opts && opts.stream) {
    return stream;
  }
  if (opts && (opts.path || opts.host || opts.port)) {
    if (opts.path) {
      stream = net.connect(opts.path);
    } else {
      if (opts.host && !opts.port) {
         opts.port = 5555;
      }
      stream = net.connect(opts.port, opts.host);
    }
    return stream;
  }

  // TODO: throw exception
  return null;
}

function AdbHostClient(opts) {
  if (!(this instanceof AdbHostClient)) return new AdbHostClient(opts);
  ee.call(this);
  var self = this;
  self._stream = streamFromOpts(opts);
  if(!self._stream){
    throw new Error("Unable to find appropriate device");
  }
  self._packet = null;
  self._waitHeader = true;
  self._nextStreamId = 12345;
  self._userStreams = {};
  self._state = 0;

  self._stream.on('readable', function() {
    while(1) {
      if (self._waitHeader) {
        var header = self._stream.read(24);
        if (header) {
          self._packet = AdbPacket.fromBuffer(header);
          if (self._packet.dataLength === 0) {
            self._onPacket();
          } else {
            self._waitHeader = false;
          }
          console.log("HEADER"+ header.toString());
        } else break;
      } else {
        var data = self._stream.read(self._packet.dataLength);
          console.log("DATA"+ data.toString());
        if (data) {
          self._packet.data = data;
          // TODO verify crc integrity here
          // self._packet.checkCRC();
          self._onPacket();
          self._waitHeader = true;
        } else break;
      }
    }
  });

  self._stream.on('connect', function() {
    console.log("CONNECTABLE!");
    self._state = 1;
    self._connected = true;
    // TODO: move version, maxdata, system-identity-string to options + set defaults
    self._writePacket(commands.CNXN, 0x01000000, 4096, "host::");
  });

  return self;
}
util.inherits(AdbHostClient, ee);

AdbHostClient.prototype._writePacket = function(type, arg1, arg2, data) {
  if (!this._connected)
    this._stream.once('connect', this._writePacket.bind(this, type, arg1, arg2, data));
  else {
    var cmd = Buffer(4); cmd.writeUInt32LE(type, 0);
    console.log('WRITE:', cmd.toString(), arg1, arg2, data);
    this._stream.write(new AdbPacket(type, arg1, arg2, data).toBuffer());
  }
}

// dispatch incoming packets
AdbHostClient.prototype._onPacket = function() {
  packet = this._packet;
  console.log('PACKET:', packet.toString());
  var localId;
  var userStream;
  switch(packet.command) {
    case commands.WRTE:
      console.log("~~~~> WRTE");
      localId = packet.arg2;
      userStream = this._userStreams[localId];
      // TODO if (!stream)
      userStream.push(packet.data);
      // TODO handle user stream backpressure.
      this._writePacket(commands.OKAY, userStream.localId(), userStream.remoteId());
      break;
    case commands.OKAY:
      console.log("~~~~> OKAY");
      console.log('OKAY: ', packet.arg1, packet.arg2);
      localId = packet.arg2;
      userStream = this._userStreams[localId];
      if (userStream._remoteId === -1) { // this is OK reply to OPEN
        userStream._remoteId = packet.arg1;
        this.emit('_CNXN'); // TODO: is there 'open' event in Stream2 ?
      }
      // TODO: handle backpressure
      break;
    case commands.CNXN:
      console.log("~~~~> CNXN");
      this._hostVersion = packet.arg1;
      this._hostMaxData = packet.arg2;
      this._banner = packet.data.toString().split(':');
      this._state = 2;
      this.emit('connect');
      break;
    case commands.CLSE:
      console.log("~~~~> CLSE");
      localId = packet.arg2;
      userStream = this._userStreams[localId];
      userStream.end();
      delete this._userStreams[localId];
      break;
    default:
      console.log("~~~~> UNKNOWN COMMAND == "+packet.command);

      // TODO: handle AUTH
  }
}

AdbHostClient.prototype._open = function(path, id) {
  this._writePacket(commands.OPEN, id, 0, path);
}

AdbHostClient.prototype.createStream = function(path) {
  var self = this;
  var userStream = new AdbStream(self);
  self._userStreams[userStream.localId()] = userStream;
  if (self._state != 2) {
    self.once('connect', function() {
      console.log("opening stream after connect");
      self._open(path, userStream.localId());
    });
  } else
      self._open(path, userStream.localId());
  return userStream;
}

module.exports = AdbHostClient;

