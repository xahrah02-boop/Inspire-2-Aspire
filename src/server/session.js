// DB-backed sessions with a fixed TTL. Each session row carries its own CSRF
// token (double-submit pattern). Expired sessions are swept lazily on read and
// periodically by the server.

import { collection } from "../db/index.js";
import { randomToken } from "../core/security.js";

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

const sessions = collection("sessions");

export function createSession(userId) {
  const now = Date.now();
  const record = {
    id: randomToken(32),
    userId,
    csrfToken: randomToken(24),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
  sessions.save(record);
  return record;
}

export function getSession(token) {
  if (!token) return null;
  const record = sessions.get(token);
  if (!record) return null;
  if (Date.parse(record.expiresAt) <= Date.now()) {
    sessions.remove(token);
    return null;
  }
  return record;
}

export function destroySession(token) {
  if (token) sessions.remove(token);
}

export function sweepExpiredSessions() {
  const now = Date.now();
  for (const record of sessions.all()) {
    if (Date.parse(record.expiresAt) <= now) sessions.remove(record.id);
  }
}
