// End-to-end API/workflow test. Boots the real server against a throwaway
// SQLite database on an ephemeral port and drives it over HTTP, covering auth,
// CSRF, RBAC isolation, the appraisal lifecycle, weighted scoring, workflow
// locking, and evidence upload/download.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PORT = 34117;
const BASE = `http://localhost:${PORT}`;

let child;
let dataDir;

before(async () => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), "forgehr-test-"));
  child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DATA_FILE: path.join(dataDir, "test.db"), UPLOADS_DIR: path.join(dataDir, "uploads") },
    stdio: "ignore"
  });
  await waitForHealth();
});

after(() => {
  child?.kill();
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("Server did not start in time.");
}

// Minimal cookie-aware client.
function makeClient() {
  const cookies = {};
  let csrf = "";
  function cookieHeader() { return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; "); }
  async function req(method, p, body) {
    const headers = {};
    if (body) headers["content-type"] = "application/json";
    if (cookieHeader()) headers.cookie = cookieHeader();
    if (method !== "GET" && csrf) headers["x-csrf-token"] = csrf;
    const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      cookies[pair.slice(0, i)] = pair.slice(i + 1);
    }
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* non-json */ }
    return { status: res.status, json, text };
  }
  return {
    req,
    async login(email) {
      const r = await req("POST", "/api/login", { email, password: "Password123!" });
      csrf = r.json?.csrfToken || "";
      return r;
    },
    setBadCsrf() { csrf = "not-a-valid-token"; }
  };
}

test("health endpoint responds", async () => {
  const res = await fetch(`${BASE}/api/health`);
  assert.equal((await res.json()).ok, true);
});

test("rejects invalid credentials", async () => {
  const c = makeClient();
  const r = await c.login("hr.admin@company.test");
  assert.equal(r.status, 200);
  const bad = await c.req("POST", "/api/login", { email: "hr.admin@company.test", password: "wrong" });
  assert.equal(bad.status, 401);
});

test("HR bootstrap and CSRF-protected writes", async () => {
  const c = makeClient();
  await c.login("hr.admin@company.test");
  const me = await c.req("GET", "/api/me");
  assert.equal(me.json.user.role, "HR_ADMIN");

  const boot = await c.req("GET", "/api/bootstrap");
  assert.ok(boot.json.employees.length > 0);
  assert.equal(typeof boot.json.appraisals[0].finalScore, "number");
  assert.ok(boot.json.appraisals[0].rating);

  // Missing CSRF -> 403
  const noCsrf = makeClient();
  await noCsrf.login("hr.admin@company.test");
  noCsrf.setBadCsrf();
  const blocked = await noCsrf.req("POST", "/api/kpis", { code: "X", title: "Y", weight: 5 });
  assert.equal(blocked.status, 403);

  // With CSRF -> 201
  const created = await c.req("POST", "/api/kpis", { code: "KPI-IT-1", title: "IT KPI", weight: 5, department: "Production", jobRole: "All", category: "Productivity", target: "x", frequency: "quarterly" });
  assert.equal(created.status, 201);
});

test("template weight must total 100%", async () => {
  const c = makeClient();
  await c.login("hr.admin@company.test");
  const r = await c.req("POST", "/api/templates", { name: "T", items: [{ title: "a", weight: 40 }, { title: "b", weight: 40 }] });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /100%/);
});

test("HR cannot publish an unapproved appraisal", async () => {
  const c = makeClient();
  await c.login("hr.admin@company.test");
  const boot = await c.req("GET", "/api/bootstrap");
  const draft = boot.json.appraisals.find(a => a.status === "Draft");
  const r = await c.req("POST", `/api/appraisals/${draft.id}`, { action: "publish" });
  assert.equal(r.status, 409);
});

test("manager scores, submits, then is locked out; weighted score is correct", async () => {
  const c = makeClient();
  await c.login("grace.manager@company.test");
  const boot = await c.req("GET", "/api/bootstrap");
  // Assigned employees only.
  assert.ok(boot.json.employees.every(e => e.lineManagerUserId === "u-mgr-1" || e.userId === "u-mgr-1"));

  const target = boot.json.appraisals.find(a => a.status === "Draft" && a.employee?.userId !== "u-mgr-1");
  const scores = target.scores.map(s => ({ ...s, score: 5 }));
  const saved = await c.req("POST", `/api/appraisals/${target.id}`, { scores, submit: false });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.finalScore, 5); // all 5s -> weighted average 5

  const submitted = await c.req("POST", `/api/appraisals/${saved.json.id}`, { scores: saved.json.scores, submit: true });
  assert.equal(submitted.json.status, "Submitted");

  const relock = await c.req("POST", `/api/appraisals/${submitted.json.id}`, { scores: submitted.json.scores, submit: false });
  assert.equal(relock.status, 409); // locked after submit
});

test("manager cannot act on a non-assigned employee's appraisal", async () => {
  const hr = makeClient();
  await hr.login("hr.admin@company.test");
  const foreign = (await hr.req("GET", "/api/bootstrap")).json.appraisals.find(a => a.employee?.lineManagerUserId === "u-mgr-2");

  const mgr = makeClient();
  await mgr.login("grace.manager@company.test");
  const r = await mgr.req("POST", `/api/appraisals/${foreign.id}`, { scores: [], submit: false });
  assert.equal(r.status, 403);
});

test("employee sees only self and cannot manage KPIs", async () => {
  const c = makeClient();
  await c.login("john.operator@company.test");
  const boot = await c.req("GET", "/api/bootstrap");
  assert.equal(boot.json.employees.length, 1);
  assert.equal(boot.json.employees[0].userId, "u-emp-1");
  const denied = await c.req("POST", "/api/kpis", { code: "X", title: "X", weight: 5 });
  assert.equal(denied.status, 403);
});

test("evidence upload and authenticated download round-trip", async () => {
  const c = makeClient();
  await c.login("grace.manager@company.test");
  const dataBase64 = Buffer.from("evidence body").toString("base64");
  const up = await c.req("POST", "/api/evidence", { filename: "proof.txt", contentType: "text/plain", dataBase64 });
  assert.equal(up.status, 201);
  assert.ok(up.json.id);
  const down = await c.req("GET", `/api/evidence/${up.json.id}`);
  assert.equal(down.text, "evidence body");
});

test("unauthenticated requests are rejected", async () => {
  const res = await fetch(`${BASE}/api/bootstrap`);
  assert.equal(res.status, 401);
});
