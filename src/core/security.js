import crypto from "node:crypto";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

// Constant-time string comparison that tolerates length differences.
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Simple in-memory sliding-window rate limiter, keyed by an arbitrary string
// (e.g. ip + email). Used to throttle login attempts and blunt brute force.
export class RateLimiter {
  constructor({ windowMs = 15 * 60 * 1000, max = 8 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
  }

  check(key) {
    const now = Date.now();
    const entry = this.hits.get(key)?.filter(ts => now - ts < this.windowMs) || [];
    this.hits.set(key, entry);
    if (entry.length >= this.max) {
      const retryAfterMs = this.windowMs - (now - entry[0]);
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }
    return { allowed: true };
  }

  record(key) {
    const list = this.hits.get(key) || [];
    list.push(Date.now());
    this.hits.set(key, list);
  }

  reset(key) {
    this.hits.delete(key);
  }
}
