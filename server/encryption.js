import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function parseEncryptionKey(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("TRANSACTION_ENCRYPTION_KEY must be configured");
  }

  const isHexKey = /^[0-9a-f]{64}$/i.test(value);
  const key = isHexKey ? Buffer.from(value, "hex") : Buffer.from(value, "base64");

  if (key.length !== 32 || (!isHexKey && key.toString("base64") !== value)) {
    throw new Error("TRANSACTION_ENCRYPTION_KEY must encode exactly 32 bytes");
  }

  return key;
}

export function encrypt(value, key) {
  if (typeof value !== "string") {
    throw new TypeError("Only strings can be encrypted");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(
    ":"
  );
}

export function decrypt(value, key) {
  if (typeof value !== "string") {
    throw new TypeError("Encrypted value must be a string");
  }

  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = value.split(":");
  if (
    version !== "v1" ||
    !encodedIv ||
    !encodedTag ||
    encodedCiphertext === undefined ||
    extra.length
  ) {
    throw new Error("Encrypted value has an unsupported format");
  }

  const iv = Buffer.from(encodedIv, "base64");
  const tag = Buffer.from(encodedTag, "base64");
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("Encrypted value has invalid parameters");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
