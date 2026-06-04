import crypto from "node:crypto";

const ITERATIONS = 120000;
const KEYLEN = 32;
const DIGEST = "sha256";

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString("hex");
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, iterations, salt, hash] = String(stored).split("$");
  if (scheme !== "pbkdf2") return false;
  const test = crypto.pbkdf2Sync(password, salt, Number(iterations), KEYLEN, DIGEST).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
}

export function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}
