
{
  'targets': [
    {
      'target_name': 'libmincrypt',
      'type': 'static_library',
      'include_dirs': [
        './include',
      ],
      # 'cflags_cc': [ '-g -O2 -fPIC -c' ],
      'sources': [
        'dsa_sig.c', 'p256.c', 'p256_ec.c', 'p256_ecdsa.c', 'rsa.c', 'sha.c', 'sha256.c'
      ],
    },
  ]
}
