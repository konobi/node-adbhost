var net = require('net');
var fs = require('fs');
var sign = require('mincrypt');
var stream = require('stream');
var util = require('util');
var USBDevice = require('./usb');
var usb = require('usb');

var ADB_HEADER_LENGTH = 24;
var CMD_SYNC = 0x434e5953;
var CMD_CNXN = 0x4e584e43;
var CONNECT_VERSION = 0x01000000;
var CONNECT_MAXDATA = 4096;
var CONNECT_PAYLOAD = 'host::\x00';
var CMD_AUTH = 0x48545541;
var AUTH_TYPE_TOKEN = 1;
var AUTH_TYPE_SIGNATURE = 2;
var AUTH_TYPE_RSA_PUBLIC = 3;
var CMD_OPEN = 0x4e45504f;
var CMD_OKAY = 0x59414b4f;
var CMD_CLSE = 0x45534c43;
var CMD_WRTE = 0x45545257;

var crc = function(buff) {
  if (!buff)
    return 0;
  var res = 0;
  for (var i=0; i < buff.length; ++i) {
    res = (res + buff[i]) & 0xFFFFFFFF;
  }
  return res;
}
//var priv_key = fs.readFileSync("/Users/scott/.android/adbkey").toString();

function get_signed (key_path, data) {
  return sign(key_path, data);
}

function generateMessage (cmd, arg0, arg1, payload) {
    var payload_buf = (!Buffer.isBuffer(payload)) ? new Buffer(payload) : payload;
    var message_len = (payload !== null) ? ADB_HEADER_LENGTH + payload_buf.length : ADB_HEADER_LENGTH;
    var message = new Buffer(message_len);

    message.writeUInt32LE(cmd, 0);
    message.writeUInt32LE(arg0, 4);
    message.writeUInt32LE(arg1, 8);

    if (payload !== null) {
      message.writeUInt32LE(payload_buf.length, 12);
      message.writeUInt32LE(crc(payload_buf), 16);
    } else {
      message.writeUInt32LE(0, 12);
      message.writeUInt32LE(0, 16);
    }

    var magic = 0xFFFFFFFF - cmd;
    message.writeUInt32LE(magic, 20);

    if (payload !== null) {
      payload_buf.copy(message, 24);
    }

    return message;
}

fromBuffer = function(buffer) {
  var command = buffer.readUInt32LE(0);
  var arg1 = buffer.readUInt32LE(4);
  var arg2 = buffer.readUInt32LE(8);
  var dataLength = buffer.readUInt32LE(12);
  var dataCRC = buffer.readUInt32LE(16);
  var magic = buffer.readUInt32LE(20);
  var packet = {};
  packet.command = command;
  packet.arg1 = arg1;
  packet.arg2 = arg2;
  packet.dataLength = dataLength;
  packet.dataCRC = dataCRC;
  var c = Buffer(4);
  c.writeUInt32LE(command, 0);
  packet.cmd = c.toString();
  packet.data = buffer.slice(24, (24 + dataLength));
  return packet;
}

var AdbLinkStream = function(opts){
  var self = this;
  stream.Duplex.call(self, { objectMode: true });

  self.tried_priv_key = false;
  self.key_path = opts.key_path;
  self.pub_key = fs.readFileSync(opts.pub_key_path);

  self.host = opts.host;
  self.port = opts.port;

  self.chunks = new Buffer('');
  self.pkts = [];

  console.log("ullo");
  if(opts.host) {
    self.type = 'tcp';
  } else if (opts.usb) {
    self.type = 'usb';
  } else {
    return;
  }

  return self;
}
util.inherits(AdbLinkStream, stream.Duplex);

AdbLinkStream.prototype._read = function(size) {
  var self = this;

  var pkt;
  for(pkt in self.pkts){
    if(self.pkts.hasOwnProperty(pkt)){
      self.push(self.pkts.shift(pkt));
    }
  }
  self.push(null);
}

AdbLinkStream.prototype._write = function(pkt, enc, next) {
  var self = this;
  console.log("We wrote a pkt... length: "+pkt.length);
  var ret = this.con.write(pkt);
  next();
  return ret;
}

AdbLinkStream.prototype.connect = function (cb) {
  var self = this;
  if(self.type == 'usb') {
    var list = usb.getDeviceList();
    for (x=0;x<list.length;x++){
      var dev = list[x];
      var obj = USBDevice.is_adb_available(dev);
      if(obj !== null){
        self.con = new USBDevice(obj);
        self.con.on('connect', function(){
          console.log("connected // usb");
          self.connected = true;
          self.init();
          cb(null, self);
        });
        break;
      }
    }
  } else if (self.type == 'tcp') {
    var socket = new net.Socket();
    socket.setNoDelay(true);
    self.con = socket.connect(self.port, self.host, function(){
      console.log("connected");
      self.connected = true;
      self.init();
      cb(null, self);
    });
  }
}

AdbLinkStream.prototype.init = function() {
  var self = this;

  var adb_connect = generateMessage(CMD_CNXN, CONNECT_VERSION, CONNECT_MAXDATA, CONNECT_PAYLOAD);
  self.con.write(adb_connect);

  self.con.on('end', function() {
    console.log('client disconnected');
    self.connected = false;
  });

  self.con.on('data', function(data) {

    if(!Buffer.isBuffer(self.chunks)){
      self.chunks = new Buffer('');
    }
    self.chunks = Buffer.concat([self.chunks, data]);

    if(self.chunks.length >= ADB_HEADER_LENGTH){
      var data_len = data.readUInt32LE(12);
      self.chunks_length_to_read = ADB_HEADER_LENGTH + data_len;
    }

    if(self.chunks.length >= self.chunks_length_to_read){
      var pkt_buf = self.chunks.slice(0, self.chunks_length_to_read);
      if(self.chunks.length > self.chunks_length_to_read){
        self.chunks = self.chunks.slice((self.chunks_length_to_read + 1));
        self.chunks_length_to_read = 0;
      } else {
        self.chunks = new Buffer('');
      }
      var pkt = fromBuffer(pkt_buf);
      //console.dir(pkt);
      switch(pkt.cmd) {
        case 'AUTH':
          self.handle_auth(pkt);
          break;
        case 'CNXN':
          self.handle_cnxn(pkt);
          break;
        default:
          console.log("==//==> got pkt of type:\n", pkt);
          self.pkt = pkt;
          break;
      }
    }

  });

  self.con.on('readable', function() {
    console.log(self.type+" connection says readable");
  });

}

AdbLinkStream.prototype.handle_auth = function(pkt) {
  var self = this;
  console.log("AUTH(type: "+pkt.arg1+", "+pkt.arg2+", data: '"+ pkt.data.toString('hex')+"'");

  if(self.tried_priv_key == false) {
    var sig_buf = get_signed(self.key_path, pkt.data);
    var msg = generateMessage(CMD_AUTH, AUTH_TYPE_SIGNATURE, 0, sig_buf);
    console.log(msg.toString('hex'));
    self.con.write(msg);
    self.tried_priv_key = true;
  } else {
    buf = new Buffer(self.pub_key.length + 1);
    self.pub_key.copy(buf);
    buf[ -1 ] = 0;
    var msg = generateMessage(CMD_AUTH, AUTH_TYPE_RSA_PUBLIC, 0, buf);
    self.con.write(msg);
    self.tried_priv_key = false;
  }

}

AdbLinkStream.prototype.handle_cnxn = function(pkt) {
  var self = this;
  //var buf = new Buffer("shell: ls\x00")
  //var msg = generateMessage(CMD_OPEN, "1", 0, buf)
  //self.con.write(msg);
  self.emit("AUTH");
  console.log("AUTHORIZED");
}

/*
var link = new AdbLinkStream( {
  host: '172.16.10.122',
  port: 5555,
  key_path: "/Users/scott/.android/adbkey",
  pub_key_path: "/Users/scott/.android/adbkey.pub"
});
link.connect(function(err){
  if(err){
    throw err;
  }
});
*/

module.exports = AdbLinkStream;

/*
var con = socket.connect(5555, '172.16.10.122', function (){
  console.log('connected');
  con.write(adb_connect);
  //con.write('000chost:version', 'utf8', function(err){
  //  if(err) throw err;
  //  var foo = con.read(4);
  //  console.log("---> " + foo);
  //  console.dir(foo);
  //});
});

var tried_priv_key = false;
con.on('data', function(data){
  var pkt = fromBuffer(data);
  switch(pkt.cmd) {
    case 'AUTH':
      console.log("AUTH(type: "+pkt.arg1+", "+pkt.arg2+", data: '"+ pkt.data.toString('hex')+"'");
      if(tried_priv_key == false) {
        var sig_buf = get_signed(pkt.data);
        console.log("---> token: '"+pkt.data.toString('hex')+"'... signature: '"+sig_buf.toString('hex')+"'");
        console.log("---> "+pkt.data.length);
        var msg = generateMessage(CMD_AUTH, AUTH_TYPE_SIGNATURE, 0, sig_buf);
        con.write(msg);
        tried_priv_key = true;
      } else {
        buf = new Buffer(pub_key.length + 1);
        pub_key.copy(buf);
        buf[ -1 ] = 0;
        var msg = generateMessage(CMD_AUTH, AUTH_TYPE_RSA_PUBLIC, 0, buf);
        con.write(msg);
        tried_priv_key = false;
      }
      break;
    case 'CNXN':
      var buf = new Buffer("shell: ls\x00")
      var msg = generateMessage(CMD_OPEN, "1", 0, buf)
      con.write(msg);
    default:
      console.dir(pkt);
      console.log(pkt.data.toString());
  }
});

*/


