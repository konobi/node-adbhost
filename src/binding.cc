#include <stdio.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>

#include <node.h>
#include <v8.h>
#include <nan.h>

#define RSA_verify RSA_verify_mincrypt
#include "mincrypt/rsa.h"
#undef RSA_verify

#include <openssl/evp.h>
#include <openssl/objects.h>
#include <openssl/pem.h>
#include <openssl/rsa.h>
#include <openssl/sha.h>

#include "binding.h"
#include <errno.h>
#include <string.h>
#define MAX_PAYLOAD 4096

using namespace node;
using namespace v8;

void InitAll(Handle<Object> exports) {
  exports->Set(NanNew<String>("sign"),
      NanNew<FunctionTemplate>(Sign)->GetFunction());
}


NAN_METHOD(Sign) {
  NanScope();

  FILE *f;
  unsigned int len;
  const char* key_path;
  const unsigned char* token;

  key_path = (const char*)node::Buffer::Data(args[0]);
  token = (unsigned char*)node::Buffer::Data(args[1]);

  unsigned char sig[MAX_PAYLOAD];

  RSA *rsa = RSA_new();
  //f = fopen(key_path, "r");
  f = fopen(key_path, "r");
  if (!f) {
    printf("Oh dear, something went wrong with read()! %s\n", strerror(errno));
      NanReturnValue(NanNew<String>("bad fd"));
  }

  if (!PEM_read_RSAPrivateKey(f, &rsa, NULL, NULL)) {
      fclose(f);
      RSA_free(rsa);
      NanReturnValue(NanNew<String>("bad key"));
  }

  if (!RSA_sign(NID_sha1, token, node::Buffer::Length(args[1]), sig, &len, rsa)) {
    NanReturnValue(NanNew<String>("bad signing"));
  }

  NanReturnValue(NanNewBufferHandle((const char*)sig, len));
}

/*
int adb_auth_sign(void *node, void *token, size_t token_size, void *sig)
  {
    unsigned int len;
    struct adb_private_key *key = node_to_item(node, struct adb_private_key, node);

    if (!RSA_sign(NID_sha1, (unsigned char *)token, token_size, (unsigned char *)sig, &len, key->rsa)) {
        return 0;
    }

    D("adb_auth_sign len=%d\n", len);
    return (int)len;
  }
*/
NODE_MODULE(binding, InitAll)
