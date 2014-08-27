{
  "targets": [
    {
      "target_name": "binding",
      "sources": [ "src/binding.cc" ],
      "include_dirs": [ 'deps/libmincrypt/include', "<!(node -e \"require('nan')\")" ],
      'dependencies': [
        'deps/libmincrypt/libmincrypt.gyp:libmincrypt',
      ]
    }
  ]
}
