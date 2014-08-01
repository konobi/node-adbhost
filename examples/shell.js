var adbhost = require('../index.js');
var adb   = adbhost.createConnection({usb: true}, function (adb) {
  var shell = adb.createStream('shell:');
  process.stdin.pipe(shell);
  shell.pipe(process.stdout);
});
//process.stdin.setRawMode(true);
