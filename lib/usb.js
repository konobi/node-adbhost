var util   = require('util');
var ee     = require('events').EventEmitter;
var usb    = require('usb');
var stream = require('stream');

var USB_VENDOR_IDS = [
  0x18d1, //VENDOR_ID_GOOGLE
  0x8087, //VENDOR_ID_INTEL
  0x0bb4, //VENDOR_ID_HTC
  0x04e8, //VENDOR_ID_SAMSUNG
  0x22b8, //VENDOR_ID_MOTOROLA
  0x1004, //VENDOR_ID_LGE
  0x12D1, //VENDOR_ID_HUAWEI
  0x0502, //VENDOR_ID_ACER
  0x0FCE, //VENDOR_ID_SONY_ERICSSON
  0x0489, //VENDOR_ID_FOXCONN
  0x413c, //VENDOR_ID_DELL
  0x0955, //VENDOR_ID_NVIDIA
  0x091E, //VENDOR_ID_GARMIN_ASUS
  0x04dd, //VENDOR_ID_SHARP
  0x19D2, //VENDOR_ID_ZTE
  0x0482, //VENDOR_ID_KYOCERA
  0x10A9, //VENDOR_ID_PANTECH
  0x05c6, //VENDOR_ID_QUALCOMM
  0x2257, //VENDOR_ID_OTGV
  0x0409, //VENDOR_ID_NEC
  0x04DA, //VENDOR_ID_PMC
  0x0930, //VENDOR_ID_TOSHIBA
  0x1F53, //VENDOR_ID_SK_TELESYS
  0x2116, //VENDOR_ID_KT_TECH
  0x0b05, //VENDOR_ID_ASUS
  0x0471, //VENDOR_ID_PHILIPS
  0x0451, //VENDOR_ID_TI
  0x0F1C, //VENDOR_ID_FUNAI
  0x0414, //VENDOR_ID_GIGABYTE
  0x2420, //VENDOR_ID_IRIVER
  0x1219, //VENDOR_ID_COMPAL
  0x1BBB, //VENDOR_ID_T_AND_A
  0x2006, //VENDOR_ID_LENOVOMOBILE
  0x17EF, //VENDOR_ID_LENOVO
  0xE040, //VENDOR_ID_VIZIO
  0x24E3, //VENDOR_ID_K_TOUCH
  0x1D4D, //VENDOR_ID_PEGATRON
  0x0E79, //VENDOR_ID_ARCHOS
  0x1662, //VENDOR_ID_POSITIVO
  0x04C5, //VENDOR_ID_FUJITSU
  0x25E3, //VENDOR_ID_LUMIGON
  0x0408, //VENDOR_ID_QUANTA
  0x2314, //VENDOR_ID_INQ_MOBILE
  0x054C, //VENDOR_ID_SONY
  0x1949, //VENDOR_ID_LAB126
  0x1EBF, //VENDOR_ID_YULONG_COOLPAD
  0x2237, //VENDOR_ID_KOBO
  0x2340  //VENDOR_ID_TELEEPOCH
];
var ADB_CLASS = 0xff,
  ADB_SUBCLASS = 0x42,
  ADB_PROTOCOL = 0x1;
var USB_ENDPOINT_XFER_BULK = 2;
var USB_ENDPOINT_DIR_MASK = 0x80;


var USBDevice = function (opts) {
  var self = this;
  if (!(this instanceof USBDevice)) return new USBDevice(opts);

  if(opts.device){
    self.device = opts.device;
    self.iface = opts['interface'];

    self.input = opts.input_address;
    self.output = opts.output_address;
    self.buf = new Buffer('');
    self.buf_in = new Buffer('');
  }

  self.iface.release(true, function(err){
    self.start();
  });

  stream.Duplex.call(self);
  return self;
};
util.inherits(USBDevice, stream.Duplex);

USBDevice.prototype._write = function(chunk, encoding, callback) {
  var self = this;
  var buf = Buffer.isBuffer(chunk) ? chunk : chunk.toBuffer();
  self.buf = Buffer.concat([self.buf, buf]);
  callback();
};

USBDevice.prototype._read = function(n){
  var self = this;
  console.log("===> reading from endpoint '"+self.buf_in.toString()+"'");
  self.push(self.buf_in);
  self.buf_in = new Buffer('');
};

USBDevice.prototype.start = function() {
  var self = this;

  self.iface.claim();
  self.output.startStream(1, self.output.descriptor.wMaxPacketSize);
  self.input.startStream(1, self.input.descriptor.wMaxPacketSize);
  self.emit('connect');
  self.emit("readable");

  self.input.on('data', function(data) {
    console.log("===> reading from endpoint (EVENT) "+data.toString());
    self.buf_in = Buffer.concat([self.buf_in, new Buffer(data)]);
  });
  self.input.on('error', function(err) {
    throw err;
  });
  self.input.on('end', function(){
    console.log("===> END OF READ");
    self.push(null);
  });

  self.output.on('drain', function() {
    if(self.buf.length > 0){
      console.log("===> writing to endpoint (EVENT) '"+ self.buf.toString()+"'");
      var buf = self.buf;
      self.output.write(buf);
    }
    self.buf = new Buffer('');
  });
  self.output.on('error', function(err){
    throw err;
  });
  self.output.on('end', function(){
    console.log("===> END OF WRITE");
    self.end();
  });

};

USBDevice.is_adb_available = function(device) {
  device.open();

  var obj = null;
  if( (device.deviceDescriptor !== null) && (device.configDescriptor !== null)) {
    var vid = device.deviceDescriptor.idVendor;
    var pid = device.deviceDescriptor.idProduct;

    if(USB_VENDOR_IDS.indexOf(vid) == -1) return;

    var i;
    for(i=0; i < device.interfaces.length; i++){
      var iface = device.interfaces[i];
      if(iface.endpoints.length != 2) continue;

      if(
        iface.descriptor.bInterfaceClass != ADB_CLASS ||
        iface.descriptor.bInterfaceSubClass != ADB_SUBCLASS ||
        iface.descriptor.bInterfaceProtocol != ADB_PROTOCOL
      ){
        continue;
      }

      var endpoints = iface.endpoints;
      if(
        endpoints[0].descriptor.bmAttributes != USB_ENDPOINT_XFER_BULK ||
        endpoints[1].descriptor.bmAttributes != USB_ENDPOINT_XFER_BULK
      ) {
        continue;
      }

      var zero_mask = 0;
      if(iface.bInterfaceProtocol == 0x01) {
        zero_mask = endpoints[0].descriptor.wMaxPacketSize - 1;
      }

      var e_in, e_out;
      if(endpoints[0].direction == usb.LIBUSB_ENDPOINT_IN){
        e_in =  endpoints[1];
        e_out = endpoints[0];
      } else {
        e_in =  endpoints[0];
        e_out = endpoints[1];
      }
      obj = {
        'device': device,
        'interface': iface,
        'input_address': e_in,
        'output_address': e_out,
        'zero_mask': zero_mask,
        'bus_address': device.busNumber,
        'device_address': device.deviceAddress
      };
      break;
    }
  }

  return obj;
};



module.exports = USBDevice;
