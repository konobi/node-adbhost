var bind = require('bindings')('binding.node');

var sign = bind.sign;

function foo (key_path, token) {
  var out = new Buffer(
    sign(
      new Buffer(key_path + "\0"),
      token
    )
  );
  return out;
}

module.exports = foo;
