// capture framebuffer and save to file
// TODO: decode header, encode to png/gif/jpeg

require('../index.js')
   .createConnection({
     host: '172.16.10.122',
     port: 5555,
     key_path: '/Users/scott/.android/adbkey',
     pub_key_path: '/Users/scott/.android/adbkey.pub'
   }, function(adb){
      var dst = require('fs').createWriteStream('foo.jpg');
      var src = adb.createStream('framebuffer:');

      src.pipe(dst);
   });

