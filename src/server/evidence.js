// Real evidence-file storage. Files arrive as base64 JSON (dependency-free, no
// multipart parser needed), are written to data/uploads on disk, and their
// metadata is recorded in the `evidence` collection. Download is authenticated
// upstream in server.js (a valid session is required to reach getEvidence).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collection } from "../db/index.js";
import { randomToken } from "../core/security.js";
import { HttpError } from "./http.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, "..", "..", "data", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword", "application/vnd.ms-excel", "text/plain", "text/csv"
]);

function safeName(name) {
  return String(name || "attachment").replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "attachment";
}

export function saveEvidence(user, body) {
  const base64 = String(body.dataBase64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!base64) throw new HttpError(422, "No file content provided.");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) throw new HttpError(422, "File content could not be decoded.");
  if (buffer.length > MAX_FILE_BYTES) throw new HttpError(413, "File exceeds the 5 MB limit.");
  const contentType = String(body.contentType || "application/octet-stream");
  if (ALLOWED_TYPES.size && !ALLOWED_TYPES.has(contentType)) {
    throw new HttpError(415, "Unsupported file type.");
  }
  const id = `ev-${randomToken(8)}`;
  fs.writeFileSync(path.join(uploadsDir, id), buffer);
  const meta = {
    id,
    filename: safeName(body.filename),
    contentType,
    size: buffer.length,
    uploadedBy: user.id,
    uploadedAt: new Date().toISOString()
  };
  collection("evidence").save(meta);
  return meta;
}

export function getEvidence(res, id) {
  const meta = collection("evidence").get(id);
  const filePath = path.join(uploadsDir, String(id));
  if (!meta || !filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
    throw new HttpError(404, "Evidence file not found.");
  }
  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    "content-type": meta.contentType || "application/octet-stream",
    "content-length": content.length,
    "content-disposition": `attachment; filename="${meta.filename}"`,
    "cache-control": "private, no-store"
  });
  res.end(content);
}
