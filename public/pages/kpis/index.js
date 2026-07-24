import { state } from "../../shared/state.js";
import { api, escapeHtml, toast } from "../../shared/api.js";
import { panel, employeeTargetSelect } from "../../shared/ui.js";
import {
  canManage, filterKpis, paginateRowsWithState, kpiRoleFilterOptions,
  employeeAssignedKpiRows, periodName
} from "../../shared/helpers.js";
import { renderView, renderShell } from "../../shared/shell.js";
import { openModal, kpiModal, deleteKpiRecord } from "../../shared/modals.js";

export function render() {
  if (state.user.role === "EMPLOYEE") return renderEmployeeKpis();
  const rows = filterKpis(state.data.kpiMaster);
  const page = paginateRowsWithState(rows, state.kpiPage, state.kpiPageSize, "kpiPage");
  return `${kpiFilterToolbar()}
    ${panel("KPI records", `${canManage() ? kpiRecordActions(rows) : ""}${kpiTable(page.rows)}${kpiPagination(rows.length, page.totalPages)}`)}`;
}

export function attach() {
  if (state.user.role === "EMPLOYEE") return attachEmployeeKpis();
  bindKpiFilters();
  document.querySelectorAll("[data-kpi-page]").forEach(button => button.addEventListener("click", () => {
    state.kpiPage += button.dataset.kpiPage === "next" ? 1 : -1;
    renderView();
  }));
  document.querySelector("#kpiPageSize")?.addEventListener("change", event => {
    state.kpiPageSize = Number(event.target.value);
    state.kpiPage = 1;
    renderView();
  });
  document.querySelectorAll("[data-kpi]").forEach(row => row.addEventListener("click", () => {
    if (!canManage()) return;
    const kpi = state.data.kpiMaster.find(item => item.id === row.dataset.kpi);
    if (kpi) openModal(kpiModal(kpi));
  }));
  document.querySelectorAll("[data-delete-kpi]").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    deleteKpiRecord(button.dataset.deleteKpi);
  }));
  document.querySelector("[data-delete-selected-kpi]")?.addEventListener("click", event => {
    event.preventDefault();
    const kpiId = document.querySelector("#deleteKpiSelect")?.value;
    if (!kpiId) { toast("Select a KPI to delete"); return; }
    deleteKpiRecord(kpiId);
  });
}

function attachEmployeeKpis() {
  document.querySelector("#employeeKpiCommentForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const comments = [...event.currentTarget.querySelectorAll("[data-employee-kpi-row]")].map(row => {
      const inputEl = row.querySelector("textarea[name='employeeComment']");
      return {
        scoreId: inputEl.dataset.scoreId,
        title: inputEl.dataset.scoreTitle,
        target: row.querySelector("select[name='target']")?.value || "",
        employeeComment: inputEl.value
      };
    });
    try {
      await api("/api/my-kpi-comments", { method: "POST", body: { periodId: event.currentTarget.dataset.periodId, comments } });
      state.data = await api("/api/bootstrap");
      toast("KPI comments saved");
      renderShell();
    } catch (error) { toast(error.message); }
  });
}

function bindKpiFilters() {
  document.querySelector("#kpiStatusFilter")?.addEventListener("change", event => { state.kpiStatusFilter = event.target.value; state.kpiPage = 1; renderView(); });
  document.querySelector("#kpiDepartmentFilter")?.addEventListener("change", event => {
    state.kpiDepartmentFilter = event.target.value;
    state.kpiPage = 1;
    const allowed = kpiRoleFilterOptions().map(r => r.title);
    if (state.kpiRoleFilter !== "all" && !allowed.includes(state.kpiRoleFilter)) state.kpiRoleFilter = "all";
    renderView();
  });
  document.querySelector("#kpiRoleFilter")?.addEventListener("change", event => { state.kpiRoleFilter = event.target.value; state.kpiPage = 1; renderView(); });
  document.querySelector("#kpiFrequencyFilter")?.addEventListener("change", event => { state.kpiFrequencyFilter = event.target.value; state.kpiPage = 1; renderView(); });
}

function renderEmployeeKpis() {
  const appraisal = state.data.appraisals[0];
  const employee = state.data.employees[0];
  const rows = employeeAssignedKpiRows(employee, appraisal);
  const periodId = appraisal?.periodId || state.data.periods.find(p => p.status === "open")?.id || state.data.periods[0]?.id || "";
  if (!employee || !rows.length) return "<div class='empty'>No KPI assigned yet.</div>";
  return `<section class="card">
    <div class="topbar">
      <div><h2>My assigned KPIs</h2><div class="hint">${escapeHtml(employee.department)} · ${escapeHtml(employee.jobTitle)} · ${escapeHtml(periodName(periodId))}</div></div>
      <span class="badge ${appraisal?.status || "Not Started"}">${escapeHtml(appraisal?.status || "Not Started")}</span>
    </div>
    <form id="employeeKpiCommentForm" data-period-id="${escapeHtml(periodId)}">
      <div class="table-wrap"><table><thead><tr>
        <th>KPI</th><th>Weight</th><th>Target</th><th>My comment</th><th>Manager confirmed</th>
      </tr></thead><tbody>${rows.map(score => `<tr data-employee-kpi-row>
        <td><strong>${escapeHtml(score.title)}</strong></td>
        <td>${escapeHtml(score.weight)}%</td>
        <td>${employeeTargetSelect(score)}</td>
        <td>
          <input type="hidden" name="scoreId" value="${escapeHtml(score.id)}">
          <textarea name="employeeComment" data-score-id="${escapeHtml(score.id)}" data-score-title="${escapeHtml(score.title)}" placeholder="Comment on this KPI">${escapeHtml(score.employeeComment || "")}</textarea>
        </td>
        <td><span class="badge ${score.managerConfirmedEmployeeComment ? "active" : "Draft"}">${score.managerConfirmedEmployeeComment ? "Confirmed" : "Pending"}</span></td>
      </tr>`).join("")}</tbody></table></div>
      <div class="toolbar" style="margin-top:12px"><button type="submit">Save KPI comments</button></div>
    </form>
  </section>`;
}

function kpiFilterToolbar() {
  const roleOptions = kpiRoleFilterOptions();
  return `<div class="toolbar">
    <div class="field inline-filter"><label>Status</label><select id="kpiStatusFilter">
      ${["all", "active", "archived"].map(s => `<option value="${s}" ${state.kpiStatusFilter === s ? "selected" : ""}>${s === "all" ? "All statuses" : s}</option>`).join("")}
    </select></div>
    <div class="field inline-filter"><label>Department</label><select id="kpiDepartmentFilter">
      <option value="all" ${state.kpiDepartmentFilter === "all" ? "selected" : ""}>All departments</option>
      ${state.data.departments.map(d => `<option value="${escapeHtml(d.name)}" ${state.kpiDepartmentFilter === d.name ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}
    </select></div>
    <div class="field inline-filter"><label>Job role</label><select id="kpiRoleFilter">
      <option value="all" ${state.kpiRoleFilter === "all" ? "selected" : ""}>All job roles</option>
      ${roleOptions.map(r => `<option value="${escapeHtml(r.title)}" ${state.kpiRoleFilter === r.title ? "selected" : ""}>${escapeHtml(r.title)}</option>`).join("")}
    </select></div>
    <div class="field inline-filter"><label>Frequency</label><select id="kpiFrequencyFilter">
      ${["all", "monthly", "quarterly", "biannual", "yearly"].map(f => `<option value="${f}" ${state.kpiFrequencyFilter === f ? "selected" : ""}>${f === "all" ? "All frequencies" : f}</option>`).join("")}
    </select></div>
  </div>`;
}

function kpiTable(rows) {
  if (!rows.length) return "<div class='empty'>No KPI records found.</div>";
  return `<div class="table-wrap"><table><thead><tr>
    <th>KPI code</th><th>Title</th><th>Category</th><th>Department</th><th>Job role</th><th>Weight</th><th>Frequency</th><th>Status</th>${canManage() ? "<th>Action</th>" : ""}
  </tr></thead><tbody>${rows.map(kpi => `<tr class="${canManage() ? "clickable-row" : ""}" data-kpi="${kpi.id}">
    <td>${escapeHtml(kpi.code)}</td>
    <td><button class="link-button" type="button">${escapeHtml(kpi.title)}</button></td>
    <td>${escapeHtml(kpi.category)}</td>
    <td>${escapeHtml(kpi.department)}</td>
    <td>${escapeHtml(kpi.jobRole)}</td>
    <td>${escapeHtml(kpi.weight)}</td>
    <td>${escapeHtml(kpi.frequency)}</td>
    <td><span class="badge ${escapeHtml(kpi.status)}">${escapeHtml(kpi.status)}</span></td>
    ${canManage() ? `<td><button class="danger small-button" type="button" data-delete-kpi="${escapeHtml(kpi.id)}">Delete</button></td>` : ""}
  </tr>`).join("")}</tbody></table></div>`;
}

function kpiRecordActions(rows) {
  return `<div class="toolbar page-actions">
    <button type="button" data-create-kpi>Add KPI</button>
    <div class="field inline-filter"><label>Delete duplicate KPI</label>
      <select id="deleteKpiSelect"><option value="">Select KPI to delete</option>
        ${rows.map(kpi => `<option value="${escapeHtml(kpi.id)}">${escapeHtml(kpi.code)} - ${escapeHtml(kpi.title)} (${escapeHtml(kpi.department)} / ${escapeHtml(kpi.jobRole)})</option>`).join("")}
      </select>
    </div>
    <button class="danger" type="button" data-delete-selected-kpi>Delete Selected KPI</button>
  </div>`;
}

function kpiPagination(total, totalPages) {
  if (!total) return "";
  const start = (state.kpiPage - 1) * state.kpiPageSize + 1;
  const end = Math.min(total, state.kpiPage * state.kpiPageSize);
  return `<div class="pagination">
    <div class="hint">Showing ${start}-${end} of ${total} KPI records</div>
    <div class="toolbar pagination-controls">
      <button class="secondary" type="button" data-kpi-page="prev" ${state.kpiPage <= 1 ? "disabled" : ""}>Previous</button>
      <span class="hint">Page ${state.kpiPage} of ${totalPages}</span>
      <button class="secondary" type="button" data-kpi-page="next" ${state.kpiPage >= totalPages ? "disabled" : ""}>Next</button>
      <select id="kpiPageSize">${[5, 10, 20].map(size => `<option value="${size}" ${state.kpiPageSize === size ? "selected" : ""}>${size} per page</option>`).join("")}</select>
    </div>
  </div>`;
}
