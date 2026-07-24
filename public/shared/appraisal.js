// Shared appraisal rendering and action handlers, on the weighted 1-5 model.
// Used by the dashboard, appraisals, results, assigned-staff, and profile pages.

import { state } from "./state.js";
import { api, escapeHtml, toast, uploadEvidence } from "./api.js";
import { table } from "./ui.js";
import { canManage, periodName, managerAssignedAppraisals } from "./helpers.js";
import { openModal, closeModal } from "./modals.js";
import { renderShell } from "./shell.js";

const SCORE_MIN = 1;
const SCORE_MAX = 5;

export function canAssessAssignedStaff() {
  return state.user.role === "LINE_MANAGER" || Boolean((state.data.assignedStaff || []).length);
}

function round2(v) { return Math.round(Number(v || 0) * 100) / 100; }

// Contribution of one KPI to the weighted total.
export function weightedValue(score) {
  return round2(Number(score.score || 0) * Number(score.weight || 0) / 100);
}

// Weighted average on the 1-5 scale, mirroring the server. Prefers the backend
// finalScore when present (already computed), else derives it from the rows.
export function appraisalFinalScore(appraisal) {
  if (typeof appraisal.finalScore === "number") return appraisal.finalScore;
  return computeFinalScore(appraisal.scores || []);
}

export function computeFinalScore(scores) {
  const rows = scores.filter(s => String(s.score ?? "").trim() !== "" && Number.isFinite(Number(s.score)));
  if (!rows.length) return 0;
  const totalWeight = rows.reduce((sum, s) => sum + Number(s.weight || 0), 0);
  if (totalWeight > 0) return round2(rows.reduce((sum, s) => sum + Number(s.score) * Number(s.weight || 0), 0) / totalWeight);
  return round2(rows.reduce((sum, s) => sum + Number(s.score), 0) / rows.length);
}

function normalizeScoreValue(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 3;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(score)));
}

function normalizeActualResultValue(value) {
  return String(value ?? "").trim();
}

// ---- Rendering ----

export function appraisalCard(appraisal) {
  const employeeName = appraisal.employee ? `${appraisal.employee.firstName} ${appraisal.employee.lastName}` : "Employee";
  const canScore = canAssessAssignedStaff() && ["Not Started", "Draft", "Returned"].includes(appraisal.status);
  const canReview = ["HR_ADMIN", "SUPER_ADMIN"].includes(state.user.role);
  const canAck = state.user.role === "EMPLOYEE" && appraisal.status === "Published";
  const hasEmployeeComments = appraisal.scores.some(s => s.employeeComment);
  const hasUnconfirmed = appraisal.scores.some(s => s.employeeComment && !s.managerConfirmedEmployeeComment);
  const finalScore = appraisalFinalScore(appraisal);
  const percentage = typeof appraisal.percentage === "number" ? appraisal.percentage : round2(finalScore / SCORE_MAX * 100);
  return `<article class="card" style="margin-bottom:14px">
    <div class="topbar"><div><h2>${escapeHtml(employeeName)}</h2><div class="hint">${escapeHtml(appraisal.employee?.department)} · ${escapeHtml(appraisal.employee?.jobTitle)}</div></div><div><span class="badge ${appraisal.status}">${escapeHtml(appraisal.status)}</span></div></div>
    ${canScore ? managerScoreForm(appraisal) : table(appraisal.scores.map(s => ({ ...s, employeeComment: s.employeeComment || "No employee comment yet", employeeCommentStatus: s.managerConfirmedEmployeeComment ? "Confirmed" : (s.employeeComment ? "Pending confirmation" : "Not submitted"), weightedValue: weightedValue(s) })), ["title", "weight", "target", "score", "managerComment", "employeeComment", "employeeCommentStatus", "weightedValue"], [])}
    <div class="grid cards" style="margin-top:12px">
      <div class="card"><div class="metric">Final score (1-5)</div><div class="metric-value" data-appraisal-final-score="${escapeHtml(appraisal.id)}">${finalScore}</div></div>
      <div class="card"><div class="metric">Percentage</div><div class="metric-value" data-appraisal-percentage="${escapeHtml(appraisal.id)}">${percentage}%</div></div>
      <div class="card"><div class="metric">Final rating</div><strong>${escapeHtml(appraisal.rating || "Not rated")}</strong></div>
      <div class="card"><div class="metric">HR comment</div><strong>${escapeHtml(appraisal.hrComment || "Pending HR review")}</strong></div>
    </div>
    <div class="toolbar" style="margin-top:12px">
      ${canScore ? `<button type="button" data-submit-appraisal="${appraisal.id}">Submit to HR</button><button type="button" class="secondary" data-draft-appraisal="${appraisal.id}">Save draft</button>` : ""}
      ${state.user.role === "LINE_MANAGER" && hasEmployeeComments ? `<button class="${hasUnconfirmed ? "" : "secondary"}" data-confirm-comments="${appraisal.id}" ${hasUnconfirmed ? "" : "disabled"}>${hasUnconfirmed ? "Confirm Employee Comments" : "Employee Comments Confirmed"}</button>` : ""}
      ${canReview ? `<button data-review="${appraisal.id}" data-action="approve">Approve</button><button data-review="${appraisal.id}" data-action="publish">Publish</button><button class="secondary" data-review="${appraisal.id}" data-action="return">Return</button>` : ""}
      ${canAck ? `<button data-ack="${appraisal.id}">Acknowledge result</button>` : ""}
    </div>
  </article>`;
}

export function managerScoreForm(appraisal) {
  return `<form data-manager-score-form="${escapeHtml(appraisal.id)}">
    <div class="table-wrap appraisal-score-wrap"><table class="score-table"><thead><tr>
      <th>KPI</th><th>Weight</th><th>Target</th><th>Score (1-5)</th><th>Actual result</th><th>Manager review comment</th><th>Supporting document</th><th>Employee KPI comment</th><th>Comment status</th><th>Weighted value</th>
    </tr></thead><tbody>${appraisal.scores.map(score => `<tr data-score-row="${escapeHtml(score.id)}">
      <td><strong>${escapeHtml(score.title)}</strong></td>
      <td>${escapeHtml(score.weight)}%</td>
      <td>${escapeHtml(score.target)}</td>
      <td><input class="score-input" name="score" type="number" min="1" max="5" step="1" value="${escapeHtml(normalizeScoreValue(score.score))}" data-score-field="score" aria-label="Score 1 to 5"></td>
      <td><input class="score-input" name="actualResult" type="text" value="${escapeHtml(score.actualResult || "")}" data-score-field="actualResult" aria-label="Actual result"></td>
      <td><textarea name="managerComment" data-score-field="managerComment">${escapeHtml(score.managerComment || "")}</textarea></td>
      <td>
        <label class="file-field"><input name="evidenceFile" type="file" data-score-field="evidenceFile"><span>Attach document</span></label>
        <div class="hint evidence-name">${escapeHtml(score.evidenceFileName || score.evidenceNote || "No file attached")}</div>
      </td>
      <td>${escapeHtml(score.employeeComment || "No employee comment yet")}</td>
      <td><span class="badge ${score.managerConfirmedEmployeeComment ? "active" : "Draft"}">${score.managerConfirmedEmployeeComment ? "Confirmed" : (score.employeeComment ? "Pending confirmation" : "Not submitted")}</span></td>
      <td data-score-weighted-value>${weightedValue(score)}</td>
    </tr>`).join("")}</tbody></table></div>
  </form>`;
}

export function appraisalModal(appraisal) {
  const employeeName = appraisal.employee ? `${appraisal.employee.firstName} ${appraisal.employee.lastName}` : "Employee";
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal appraisal-modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>${escapeHtml(employeeName)}</h2><div class="hint">${escapeHtml(appraisal.employee?.department || "")} · ${escapeHtml(appraisal.employee?.jobTitle || "")} · ${escapeHtml(periodName(appraisal.periodId))}</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      ${appraisalCard(appraisal)}
    </section>
  </div>`;
}

export function appraisalLine(appraisal) {
  const employeeName = appraisal.employee ? `${appraisal.employee.firstName} ${appraisal.employee.lastName}` : "Employee";
  const actionAttr = state.user.role === "LINE_MANAGER" ? `data-open-appraisal="${appraisal.id}"` : `data-toggle-appraisal="${appraisal.id}"`;
  return `<article class="appraisal-row">
    <button class="appraisal-summary" ${actionAttr}>
      <span><strong>${escapeHtml(employeeName)}</strong></span>
      <span>${escapeHtml(appraisal.employee?.department || "")}</span>
      <span>${escapeHtml(appraisal.employee?.jobTitle || "")}</span>
      <span><span class="badge ${appraisal.status}">${escapeHtml(appraisal.status)}</span></span>
    </button>
    ${state.user.role === "LINE_MANAGER" ? "" : `<div class="appraisal-detail" id="detail-${escapeHtml(appraisal.id)}" hidden>${appraisalCard(appraisal)}</div>`}
  </article>`;
}

export function renderManagerAppraisalResults(rows) {
  return `${cardPanel("Staff attached to me for scoring", managerStaffScoringTable(rows))}
    <div class="appraisal-list">${rows.map(managerAppraisalResultLine).join("")}</div>`;
}

function cardPanel(title, body) {
  return `<section class="card"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

export function managerStaffScoringTable(rows) {
  if (!rows.length) return "<div class='empty'>No staff attached to this manager yet.</div>";
  return `<div class="table-wrap"><table><thead><tr>
    <th>Staff name</th><th>Department</th><th>Designation</th><th>Assigned KPIs</th><th>Employee comments</th><th>Score status</th><th>Action</th>
  </tr></thead><tbody>${rows.map(appraisal => {
    const employee = appraisal.employee || {};
    const comments = (appraisal.scores || []).filter(s => s.employeeComment).length;
    return `<tr>
      <td><strong>${escapeHtml(`${employee.firstName || ""} ${employee.lastName || ""}`.trim() || "Employee")}</strong></td>
      <td>${escapeHtml(employee.department || "")}</td>
      <td>${escapeHtml(employee.jobTitle || "")}</td>
      <td>${escapeHtml((appraisal.scores || []).length)}</td>
      <td>${escapeHtml(comments)}</td>
      <td><span class="badge ${escapeHtml(appraisal.status)}">${escapeHtml(appraisal.status)}</span></td>
      <td><button type="button" data-open-manager-review="${escapeHtml(appraisal.id)}">Open Score Sheet</button></td>
    </tr>`;
  }).join("")}</tbody></table></div>`;
}

export function managerAppraisalResultLine(appraisal) {
  const employeeName = appraisal.employee ? `${appraisal.employee.firstName} ${appraisal.employee.lastName}` : "Employee";
  return `<article class="appraisal-row">
    <button class="appraisal-summary" data-toggle-manager-kpis="${escapeHtml(appraisal.id)}">
      <span><strong>${escapeHtml(employeeName)}</strong></span>
      <span>${escapeHtml(appraisal.employee?.department || "")}</span>
      <span>${escapeHtml(appraisal.employee?.jobTitle || "")}</span>
      <span><span class="badge ${escapeHtml(appraisal.status)}">${escapeHtml(appraisal.status)}</span></span>
    </button>
    <div class="appraisal-detail" id="manager-kpis-${escapeHtml(appraisal.id)}" hidden>${managerAssignedKpiTable(appraisal)}</div>
  </article>`;
}

export function managerAssignedKpiTable(appraisal) {
  if (!appraisal.scores?.length) return "<div class='empty'>No KPI assigned to this staff member yet.</div>";
  return `<div class="toolbar" style="margin:10px 0"><button type="button" data-open-manager-review="${escapeHtml(appraisal.id)}">Open KPI Review</button></div>
    <div class="table-wrap"><table><thead><tr>
      <th>KPI</th><th>Weight</th><th>Target</th><th>Employee comment</th><th>Manager score</th><th>Supporting document</th><th>Status</th>
    </tr></thead><tbody>${appraisal.scores.map(score => `<tr>
      <td><strong>${escapeHtml(score.title)}</strong></td>
      <td>${escapeHtml(score.weight)}%</td>
      <td>${escapeHtml(score.target || "")}</td>
      <td>${escapeHtml(score.employeeComment || "No employee comment yet")}</td>
      <td>${escapeHtml(score.score || "")}</td>
      <td>${score.evidenceFileId ? `<a href="/api/evidence/${escapeHtml(score.evidenceFileId)}" target="_blank" rel="noopener">${escapeHtml(score.evidenceFileName || "Download")}</a>` : escapeHtml(score.evidenceFileName || score.evidenceNote || "No file attached")}</td>
      <td><span class="badge ${score.managerConfirmedEmployeeComment ? "active" : "Draft"}">${score.managerConfirmedEmployeeComment ? "Comment confirmed" : "Pending review"}</span></td>
    </tr>`).join("")}</tbody></table></div>`;
}

// ---- Score collection (async: uploads any attached evidence first) ----
export async function collectManagerScores(appraisal) {
  if (!appraisal) return [];
  const form = document.querySelector(`[data-manager-score-form="${CSS.escape(appraisal.id)}"]`);
  if (!form) return appraisal.scores;
  const result = [];
  for (const score of appraisal.scores) {
    const row = form.querySelector(`[data-score-row="${CSS.escape(score.id)}"]`);
    if (!row) { result.push(score); continue; }
    const file = row.querySelector("[data-score-field='evidenceFile']")?.files?.[0];
    let evidenceFileId = score.evidenceFileId || "";
    let evidenceFileName = score.evidenceFileName || "";
    if (file) {
      try { const meta = await uploadEvidence(file); evidenceFileId = meta.id; evidenceFileName = meta.filename; }
      catch (error) { toast(error.message); }
    }
    result.push({
      ...score,
      score: normalizeScoreValue(row.querySelector("[data-score-field='score']")?.value || score.score),
      actualResult: normalizeActualResultValue(row.querySelector("[data-score-field='actualResult']")?.value),
      managerComment: row.querySelector("[data-score-field='managerComment']")?.value || "",
      evidenceFileId, evidenceFileName,
      evidenceNote: evidenceFileName || score.evidenceNote || ""
    });
  }
  return result;
}

function refreshVisibleAppraisalTotals(form) {
  if (!form) return;
  const rows = [...form.querySelectorAll("[data-score-row]")].map(row => ({
    score: Number(row.querySelector("[data-score-field='score']")?.value || 0),
    weight: Number(row.dataset.weight || row.querySelector("td:nth-child(2)")?.textContent.replace("%", "") || 0)
  }));
  form.querySelectorAll("[data-score-row]").forEach(row => {
    const score = Number(row.querySelector("[data-score-field='score']")?.value || 0);
    const weight = Number(row.querySelector("td:nth-child(2)")?.textContent.replace("%", "") || 0);
    const cell = row.querySelector("[data-score-weighted-value]");
    if (cell) cell.textContent = round2(score * weight / 100);
  });
  const id = form.dataset.managerScoreForm;
  const final = computeFinalScore(rows);
  const finalCell = document.querySelector(`[data-appraisal-final-score="${CSS.escape(id)}"]`);
  if (finalCell) finalCell.textContent = final;
  const pctCell = document.querySelector(`[data-appraisal-percentage="${CSS.escape(id)}"]`);
  if (pctCell) pctCell.textContent = `${round2(final / SCORE_MAX * 100)}%`;
}

async function refreshData() {
  state.data = await api("/api/bootstrap");
}

// ---- Handlers ----
export function attachAppraisalHandlers(root = document) {
  root.querySelectorAll("[data-submit-appraisal],[data-draft-appraisal]").forEach(button => button.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    const id = button.dataset.submitAppraisal || button.dataset.draftAppraisal;
    const appraisal = state.data.appraisals.find(a => a.id === id) || managerAssignedAppraisals().find(a => a.id === id);
    try {
      const scores = await collectManagerScores(appraisal);
      await api(`/api/appraisals/${id}`, { method: "POST", body: { scores, submit: Boolean(button.dataset.submitAppraisal) } });
      await refreshData();
      closeModal();
      toast(button.dataset.submitAppraisal ? "Appraisal submitted" : "Draft saved");
      renderShell();
    } catch (error) { toast(error.message); }
  }));
  root.querySelectorAll("[data-confirm-comments]").forEach(button => button.addEventListener("click", async () => {
    try {
      await api(`/api/appraisals/${button.dataset.confirmComments}`, { method: "POST", body: { confirmEmployeeComments: true } });
      await refreshData();
      closeModal();
      toast("Employee comments confirmed");
      renderShell();
    } catch (error) { toast(error.message); }
  }));
  root.querySelectorAll("[data-review]").forEach(button => button.addEventListener("click", async () => {
    try {
      await api(`/api/appraisals/${button.dataset.review}`, { method: "POST", body: { action: button.dataset.action, hrComment: "Reviewed by HR." } });
      await refreshData();
      closeModal();
      toast(`Appraisal ${button.dataset.action} action completed`);
      renderShell();
    } catch (error) { toast(error.message); }
  }));
  root.querySelectorAll("[data-ack]").forEach(button => button.addEventListener("click", async () => {
    try {
      await api(`/api/acknowledge/${button.dataset.ack}`, { method: "POST" });
      await refreshData();
      closeModal();
      toast("Result acknowledged");
      renderShell();
    } catch (error) { toast(error.message); }
  }));
  root.querySelectorAll("[data-toggle-appraisal]").forEach(button => button.addEventListener("click", () => {
    const detail = document.querySelector(`#detail-${CSS.escape(button.dataset.toggleAppraisal)}`);
    if (detail) detail.hidden = !detail.hidden;
  }));
  root.querySelectorAll("[data-toggle-manager-kpis]").forEach(button => button.addEventListener("click", () => {
    const detail = document.querySelector(`#manager-kpis-${CSS.escape(button.dataset.toggleManagerKpis)}`);
    if (detail) detail.hidden = !detail.hidden;
  }));
  root.querySelectorAll("[data-open-appraisal]").forEach(button => button.addEventListener("click", () => {
    const appraisal = state.data.appraisals.find(item => item.id === button.dataset.openAppraisal);
    if (appraisal) openModal(appraisalModal(appraisal));
  }));
  root.querySelectorAll("[data-score-field='evidenceFile']").forEach(inputEl => inputEl.addEventListener("change", event => {
    const label = event.currentTarget.closest("td")?.querySelector(".evidence-name");
    if (label) label.textContent = event.currentTarget.files?.[0]?.name || "No file attached";
  }));
  root.querySelectorAll("[data-score-field='score']").forEach(inputEl => inputEl.addEventListener("input", () => {
    refreshVisibleAppraisalTotals(inputEl.closest("[data-manager-score-form]"));
  }));
}
