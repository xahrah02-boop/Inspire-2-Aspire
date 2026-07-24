import { state } from "../../shared/state.js";
import { canManage } from "../../shared/helpers.js";
import { openModal, departmentReportModal, trainingReportModal } from "../../shared/modals.js";

export function render() {
  const r = state.data.reports;
  const approved = r.completion.approved ?? r.completion.completed ?? countApprovedAppraisals(state.data.appraisals);
  const pending = r.completion.pending ?? countPendingAppraisals(state.data.appraisals);
  const total = r.completion.total ?? state.data.appraisals.length ?? (approved + pending);
  return `<div class="grid cards">
    <article class="card"><div class="metric">Total appraisals</div><div class="metric-value">${total}</div></article>
    <article class="card"><div class="metric">Pending appraisals</div><div class="metric-value">${pending}</div></article>
    <article class="card"><div class="metric">Approved appraisals</div><div class="metric-value">${approved}</div></article>
  </div>
  <div class="toolbar report-actions">
    ${canManage() ? `<button type="button" data-department-report>Department Performance Summary</button><button type="button" data-training-report>Training Needs Report</button>` : ""}
  </div>`;
}

export function attach() {
  document.querySelector("[data-department-report]")?.addEventListener("click", () => openModal(departmentReportModal()));
  document.querySelector("[data-training-report]")?.addEventListener("click", () => openModal(trainingReportModal()));
}

function countApprovedAppraisals(appraisals = []) {
  return appraisals.filter(a => ["approved", "published", "acknowledged"].includes(String(a.status || "").toLowerCase())).length;
}
function countPendingAppraisals(appraisals = []) {
  return appraisals.filter(a => ["draft", "submitted", "returned", "not started"].includes(String(a.status || "").toLowerCase())).length;
}
