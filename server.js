import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collection } from "./src/db/index.js";
import { seedDatabase } from "./src/db/seed.js";
import { verifyPassword } from "./src/core/auth.js";
import { RateLimiter, safeEqual } from "./src/core/security.js";
import { createSession, getSession, destroySession, sweepExpiredSessions, SESSION_TTL_MS } from "./src/server/session.js";
import { dispatchApi } from "./src/server/routes.js";
import { publicUser, audit } from "./src/server/domain.js";
import { sendJson, HttpError, readJsonBody, parseCookies, cookie, clientIp } from "./src/server/http.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

seedDatabase();
setInterval(sweepExpiredSessions, 30 * 60 * 1000).unref();

const loginLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
const SAFE_METHODS = new Set(["GET", "HEAD"]);
const CSRF_EXEMPT = new Set(["/api/login", "/api/logout"]);

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join("; ")
};

function resolveUser(req) {
  const token = parseCookies(req).hr_session;
  const session = getSession(token);
  if (!session) return { user: null, session: null };
  const user = collection("users").get(session.userId);
  if (!user || user.status !== "active") return { user: null, session: null };
  return { user, session };
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  const email = String(body.email || "").toLowerCase();
  const key = `${clientIp(req)}:${email}`;
  const gate = loginLimiter.check(key);
  if (!gate.allowed) {
    res.setHeader("retry-after", String(gate.retryAfterSeconds));
    return sendJson(res, 429, { error: `Too many attempts. Try again in ${gate.retryAfterSeconds}s.` });
  }
  const user = collection("users").all().find(u => u.email.toLowerCase() === email);
  if (!user || user.status !== "active" || !verifyPassword(body.password || "", user.passwordHash)) {
    loginLimiter.record(key);
    return sendJson(res, 401, { error: "Invalid email or password." });
  }
  loginLimiter.reset(key);
  const session = createSession(user.id);
  audit(user, "User login", "Authentication", user.email);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader("set-cookie", [
    cookie("hr_session", session.id, { maxAge, httpOnly: true }),
    cookie("hr_csrf", session.csrfToken, { maxAge, httpOnly: false })
  ]);
  return sendJson(res, 200, { user: publicUser(user), csrfToken: session.csrfToken });
}

function handleLogout(req, res) {
  destroySession(parseCookies(req).hr_session);
  res.writeHead(204, {
    "set-cookie": [
      cookie("hr_session", "", { maxAge: 0 }),
      cookie("hr_csrf", "", { maxAge: 0, httpOnly: false })
    ]
  });
  res.end();
}

async function handleApi(req, res, url) {
  const method = req.method;
  const path = url.pathname;

  if (path === "/api/health") return sendJson(res, 200, { ok: true });
  if (path === "/api/login" && method === "POST") return handleLogin(req, res);
  if (path === "/api/logout" && method === "POST") return handleLogout(req, res);

  const { user, session } = resolveUser(req);
  if (!user) return sendJson(res, 401, { error: "Authentication required." });

  // CSRF: state-changing requests must echo the session's CSRF token.
  if (!SAFE_METHODS.has(method) && !CSRF_EXEMPT.has(path)) {
    const header = req.headers["x-csrf-token"];
    if (!header || !safeEqual(header, session.csrfToken)) {
      return sendJson(res, 403, { error: "Invalid or missing CSRF token." });
    }
  }

  const body = SAFE_METHODS.has(method) ? {} : await readJsonBody(req);
  return dispatchApi(req, res, url, { user, session, method, body });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, decodeURIComponent(requested)));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, SECURITY_HEADERS);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      // SPA-style fallback for unknown non-asset paths.
      if (!path.extname(filePath)) return serveIndex(res);
      res.writeHead(404, SECURITY_HEADERS);
      return res.end("Not found");
    }
    const ext = path.extname(filePath);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };
    res.writeHead(200, { ...SECURITY_HEADERS, "content-type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function serveIndex(res) {
  fs.readFile(path.join(publicDir, "index.html"), (error, content) => {
    if (error) {
      res.writeHead(404, SECURITY_HEADERS);
      return res.end("Not found");
    }
    res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "text/html" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    if (res.headersSent) return;
    const status = error instanceof HttpError ? error.status
      : /not allowed/.test(error.message) ? 403 : 400;
    sendJson(res, status, { error: error.message || "Request failed." });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`ForgeHR Performance App running at http://localhost:${port}`);
});
