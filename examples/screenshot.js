// capture framebuffer and save to file
// TODO: decode header, encode to png/gif/jpeg

require('../index.js')
   .createConnection({ usb: true}, function(adb){
      var src = adb.createStream('framebuffer:');
      var dst = require('fs').createWriteStream('foo.jpg');

      src.pipe(dst);
   });

