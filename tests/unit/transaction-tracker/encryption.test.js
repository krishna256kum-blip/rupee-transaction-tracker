import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  decrypt,
  encrypt,
  parseEncryptionKey,
} from "../../../server/encryption.js";

test("AES-256-GCM encrypts and decrypts transaction values", () => {
  const key = randomBytes(32);
  const encrypted = encrypt("Chai Point", key);

  assert.match(encrypted, /^v1:/);
  assert.notEqual(encrypted, encrypt("Chai Point", key));
  assert.equal(decrypt(encrypted, key), "Chai Point");
});

test("rejects malformed keys and tampered ciphertext", () => {
  assert.throws(() => parseEncryptionKey("short"), /exactly 32 bytes/);
  assert.throws(() => parseEncryptionKey(`${"A".repeat(43)}!`), /exactly 32 bytes/);
  assert.throws(() => parseEncryptionKey(""), /must be configured/);

  const key = randomBytes(32);
  const encrypted = encrypt("250", key).split(":");
  encrypted[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decrypt(encrypted.join(":"), key));
});
