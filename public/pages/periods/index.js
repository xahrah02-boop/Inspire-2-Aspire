import { state } from "../../shared/state.js";
import { escapeHtml } from "../../shared/api.js";
import { panel } from "../../shared/ui.js";
import { canManage } from "../../shared/helpers.js";
import { renderView } from "../../shared/shell.js";
import { openModal, periodCreateModal, periodModal, bindPeriodCreateForm } from "../../shared/modals.js";

export function render() {
  return `<div class="section-stack">
    ${panel("Appraisal period filter", periodToolbar())}
    ${panel("Appraisal period records", `${canManage() ? `<div class="toolbar page-actions"><button type="button" data-create-period>Add Period</button></div>` : ""}${periodTable(filteredPeriods())}`)}
  </div>`;
}

export function attach() {
  document.querySelector("#periodFilter")?.addEventListener("change", event => {
    state.periodFilter = event.target.value;
    renderView();
  });
  document.querySelector("[data-create-period]")?.addEventListener("click", () => {
    openModal(periodCreateModal()).then(bindPeriodCreateForm);
  });
  document.querySelectorAll("[data-period],[data-edit-period]").forEach(el => el.addEventListener("click", event => {
    event.stopPropagation();
    if (!canManage()) return;
    const periodId = el.dataset.period || el.dataset.editPeriod;
    const period = state.data.periods.find(item => item.id === periodId);
    if (period) openModal(periodModal(period));
  }));
}

function periodToolbar() {
  return `<div class="toolbar">
    <select id="periodFilter">
      <option value="all" ${state.periodFilter === "all" ? "selected" : ""}>All appraisal periods</option>
      ${state.data.periods.map(p => `<option value="${p.id}" ${state.periodFilter === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
    </select>
  </div>`;
}

function filteredPeriods() {
  return state.periodFilter === "all" ? state.data.periods : state.data.periods.filter(p => p.id === state.periodFilter);
}

function periodTable(rows) {
  if (!rows.length) return "<div class='empty'>No appraisal periods found.</div>";
  return `<div class="table-wrap"><table><thead><tr>
    <th>Period name</th><th>Start date</th><th>End date</th><th>Type</th><th>Status</th><th>Departments</th><th>Action</th>
  </tr></thead><tbody>${rows.map(period => `<tr class="${canManage() ? "clickable-row" : ""}" data-period="${period.id}">
    <td><button class="link-button" type="button">${escapeHtml(period.name)}</button></td>
    <td>${escapeHtml(period.startDate)}</td>
    <td>${escapeHtml(period.endDate)}</td>
    <td>${escapeHtml(period.type)}</td>
    <td><span class="badge ${escapeHtml(period.status)}">${escapeHtml(period.status)}</span></td>
    <td>${escapeHtml((period.departments || []).length)} selected</td>
    <td>${canManage() ? `<button class="secondary small-button" type="button" data-edit-period="${period.id}">Edit</button>` : ""}</td>
  </tr>`).join("")}</tbody></table></div>`;
}
