// Persistence layer backed by node:sqlite (built into Node 22.5+/24).
//
// The domain data is fluid and deeply nested (appraisal score arrays, template
// items, role-category lists), so each collection is stored as a document row:
// (id TEXT PRIMARY KEY, data TEXT JSON, created_at). Repositories return parsed
// objects and filtering happens in JS. At this app's scale (dozens of rows) that
// is simple, correct, and lets the workflow logic live in one place. The file
// lives at DATA_FILE (default ./data/forgehr.db) so data survives restarts.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const dbFile = process.env.DATA_FILE || path.join(dataDir, "forgehr.db");

fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(dbFile);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

export const COLLECTIONS = [
  "users", "sessions", "departments", "jobRoles", "categories", "kpiMaster",
  "templates", "employees", "appraisalPeriods", "appraisals", "notifications",
  "guides", "auditLogs", "evidence"
];

for (const name of COLLECTIONS) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${name} (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
}

function parseRow(row) {
  if (!row) return null;
  const value = JSON.parse(row.data);
  value.id = row.id;
  return value;
}

// A tiny document repository for one collection.
export function collection(name) {
  if (!COLLECTIONS.includes(name)) throw new Error(`Unknown collection: ${name}`);
  const selectAll = db.prepare(`SELECT id, data FROM ${name} ORDER BY rowid ASC`);
  const selectOne = db.prepare(`SELECT id, data FROM ${name} WHERE id = ?`);
  const upsert = db.prepare(`INSERT INTO ${name} (id, data) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data`);
  const del = db.prepare(`DELETE FROM ${name} WHERE id = ?`);
  const count = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`);

  const api = {
    name,
    all() {
      return selectAll.all().map(parseRow);
    },
    get(id) {
      return parseRow(selectOne.get(String(id)));
    },
    find(predicate) {
      return api.all().find(predicate) || null;
    },
    filter(predicate) {
      return api.all().filter(predicate);
    },
    some(predicate) {
      return api.all().some(predicate);
    },
    // Insert at the logical front (mirrors the old `unshift` ordering by using a
    // rowid trick: rewrite is overkill, so callers that care about ordering sort
    // explicitly). Returns the saved record with its id.
    insert(record) {
      const id = record.id || `${name}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const toSave = { ...record, id };
      upsert.run(id, JSON.stringify(stripId(toSave)));
      return toSave;
    },
    save(record) {
      if (!record?.id) throw new Error(`Cannot save a record without an id into ${name}`);
      upsert.run(String(record.id), JSON.stringify(stripId(record)));
      return record;
    },
    update(id, patch) {
      const existing = api.get(id);
      if (!existing) return null;
      const merged = { ...existing, ...patch, id: existing.id };
      upsert.run(String(existing.id), JSON.stringify(stripId(merged)));
      return merged;
    },
    remove(id) {
      const existing = api.get(id);
      del.run(String(id));
      return existing;
    },
    count() {
      return count.get().n;
    }
  };
  return api;
}

function stripId(record) {
  const { id, ...rest } = record;
  return rest;
}

// Convenience: the full data surface as live-reading collections.
export function stores() {
  return Object.fromEntries(COLLECTIONS.map(name => [name, collection(name)]));
}
