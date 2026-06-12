// AES-256-GCM шифрование токенов (ADR-006). Ключ — TOKEN_KEY в env.
// Формат: base64(iv).base64(tag).base64(ciphertext)
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

function key(): Buffer {
  const secret = process.env.TOKEN_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("TOKEN_KEY не задан — отказ запуска в production");
    return scryptSync("dev-only-key-change-me", "wbboard-token-salt", 32);
  }
  return scryptSync(secret, "wbboard-token-salt", 32);
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(packed: string): string {
  const [ivB, tagB, dataB] = packed.split(".");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  d.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([d.update(Buffer.from(dataB, "base64")), d.final()]).toString("utf8");
}
