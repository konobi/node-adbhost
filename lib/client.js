var util         = require('util');
var ee = require('events').EventEmitter;
var usb = require('usb');
var stream = require('stream');
var USBDevice = require('./usb');
var link = require('./link');

var net          = require('net');
var stream       = require('stream');
var AdbStream    = require('./stream.js');
var AdbPacket    = require('./packet');
var commands = AdbPacket.commands;

function streamFromOpts(opts) {

  /*
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
  */

  var stream;
  if (opts && opts.host){
    stream = new link({
      host: opts.host,
      port: opts.port,
      key_path: opts.key_path,
      pub_key_path: opts.pub_key_path
    });

    return stream;
  } else if (opts && opts.usb) {

  }

  /*
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
  */

  // TODO: throw exception
  return null;
}

function AdbHostClient(opts, cb) {
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

  self._stream.connect(function(err){
    if(err){
      throw err;
    }
    console.log("CONNECTABLE!");
    self._state = 1;

    self._stream.on('data', function(data) {
      console.dir("---> recieving data from downstream");
      console.dir(data);
      self._onPacket(data);
    });
    self._stream.on('AUTH', function(){
      cb(self);
    });
  });

  return self;
}
util.inherits(AdbHostClient, ee);

AdbHostClient.prototype._writePacket = function(type, arg1, arg2, data) {
    var cmd = Buffer(4);
    cmd.writeUInt32LE(type, 0);
    console.log('WRITE:', cmd.toString(), arg1, arg2, data);
    this._stream.write(new AdbPacket(type, arg1, arg2, data).toBuffer());
};

// dispatch incoming packets
AdbHostClient.prototype._onPacket = function(packet) {
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
      break;
    case commands.CLSE:
      console.log("~~~~> CLSE");
      localId = packet.arg2;
      userStream = this._userStreams[localId];
      userStream.end();
      delete this._userStreams[localId];
      break;
    default:
      console.log("~~~~> UNKNOWN COMMAND == "+packet.cmd);

  }
};

AdbHostClient.prototype._open = function(path, id) {
  this._writePacket(commands.OPEN, id, 0, path);
};

AdbHostClient.prototype.createStream = function(path) {
  var self = this;
  var userStream = new AdbStream(self);
  self._userStreams[userStream.localId()] = userStream;
  self._open(path, userStream.localId());
  return userStream;
}

module.exports = AdbHostClient;

