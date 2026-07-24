// Same-origin API client. Sends the session cookie automatically and attaches
// the CSRF token (double-submit) on state-changing requests. The old remote /
// localStorage-token path has been removed now that there is a single backend.

import { state } from "./state.js";

function readCookie(name) {
  return document.cookie.split(";").map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))?.split("=").slice(1).join("=") || "";
}

export function csrfToken() {
  return state.csrfToken || decodeURIComponent(readCookie("hr_csrf"));
}

export async function api(path, options = {}) {
  const method = options.method || "GET";
  const headers = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") {
    const token = csrfToken();
    if (token) headers["x-csrf-token"] = token;
  }
  const res = await fetch(path, {
    credentials: "same-origin",
    ...options,
    method,
    headers: { ...headers, ...(options.headers || {}) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }
  if (res.status === 204) return null;
  const payload = await res.json();
  if (payload?.error) throw new Error(payload.error);
  return payload;
}

// Upload a File via the base64 evidence endpoint. Returns saved metadata.
export async function uploadEvidence(file) {
  const dataBase64 = await fileToBase64(file);
  return api("/api/evidence", {
    method: "POST",
    body: { filename: file.name, contentType: file.type || "application/octet-stream", dataBase64 }
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[m]));
}
