// capture framebuffer and save to file
// TODO: decode header, encode to png/gif/jpeg

require('../index.js')
   .createConnection({
     usb: true,
     key_path: '/Users/scott/.android/adbkey',
     pub_key_path: '/Users/scott/.android/adbkey.pub'
   }, function(adb){
      var dst = require('fs').createWriteStream('foo.jpg');
      var src = adb.createStream('framebuffer:');

      src.pipe(dst);
   });

