import { state } from "../../shared/state.js";
import { escapeHtml } from "../../shared/api.js";
import { panel } from "../../shared/ui.js";
import {
  canManage, filterEmployees, paginateRows, employeeRoleFilterOptions,
  roleCategoryLabel, userName, employeeRecordKey
} from "../../shared/helpers.js";
import { renderView } from "../../shared/shell.js";
import { openModal, employeeCreateModal, bindEmployeeCreateForm, employeeModal } from "../../shared/modals.js";

export function render() {
  const rows = filterEmployees(state.data.employees);
  const page = paginateRows(rows, state.employeePage, state.employeePageSize);
  return `${employeeFilterToolbar()}
    ${panel("Employee records", employeeTable(page.rows) + employeePagination(rows.length, page.totalPages))}`;
}

export function attach() {
  document.querySelector("[data-create-employee]")?.addEventListener("click", () => {
    openModal(employeeCreateModal()).then(bindEmployeeCreateForm);
  });
  document.querySelector("#employeeNameFilter")?.addEventListener("input", event => {
    state.employeeNameFilter = event.target.value;
    state.employeePage = 1;
    debounceRender(() => document.querySelector("#employeeNameFilter"));
  });
  document.querySelector("#employeeDepartmentFilter")?.addEventListener("change", event => {
    state.employeeDepartmentFilter = event.target.value;
    state.employeePage = 1;
    const allowed = employeeRoleFilterOptions().map(r => r.title);
    if (state.employeeRoleFilter !== "all" && !allowed.includes(state.employeeRoleFilter)) state.employeeRoleFilter = "all";
    renderView();
  });
  document.querySelector("#employeeRoleFilter")?.addEventListener("change", event => {
    state.employeeRoleFilter = event.target.value;
    state.employeePage = 1;
    renderView();
  });
  document.querySelectorAll("[data-employee-page]").forEach(button => button.addEventListener("click", () => {
    state.employeePage += button.dataset.employeePage === "next" ? 1 : -1;
    renderView();
  }));
  document.querySelector("#employeePageSize")?.addEventListener("change", event => {
    state.employeePageSize = Number(event.target.value);
    state.employeePage = 1;
    renderView();
  });
  document.querySelectorAll("[data-employee]").forEach(el => el.addEventListener("click", event => {
    event.preventDefault();
    const employee = state.data.employees.find(item => employeeRecordKey(item) === el.dataset.employee);
    if (employee) openModal(employeeModal(employee));
  }));
}

let searchTimer;
function debounceRender(focusTargetFn) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    renderView();
    const input = focusTargetFn();
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }, 120);
}

function employeeFilterToolbar() {
  const roleOptions = employeeRoleFilterOptions();
  return `<div class="toolbar">
    ${canManage() ? `<button type="button" data-create-employee>Add Employee</button>` : ""}
    <div class="field inline-filter"><label>Search by name</label><input id="employeeNameFilter" placeholder="Type employee name" value="${escapeHtml(state.employeeNameFilter)}"></div>
    <div class="field inline-filter"><label>Department</label><select id="employeeDepartmentFilter">
      <option value="all" ${state.employeeDepartmentFilter === "all" ? "selected" : ""}>All departments</option>
      ${state.data.departments.map(d => `<option value="${escapeHtml(d.name)}" ${state.employeeDepartmentFilter === d.name ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}
    </select></div>
    <div class="field inline-filter"><label>Role</label><select id="employeeRoleFilter">
      <option value="all" ${state.employeeRoleFilter === "all" ? "selected" : ""}>All roles</option>
      ${roleOptions.map(r => `<option value="${escapeHtml(r.title)}" ${state.employeeRoleFilter === r.title ? "selected" : ""}>${escapeHtml(r.title)}</option>`).join("")}
    </select></div>
  </div>`;
}

function employeeTable(rows) {
  if (!rows.length) return "<div class='empty'>No records found.</div>";
  return `<div class="table-wrap"><table><thead><tr>
    <th>Employee ID</th><th>Employee</th><th>Department</th><th>Designation</th><th>Role categories</th><th>Manager</th><th>Status</th>
  </tr></thead><tbody>${rows.map(e => `<tr class="clickable-row" data-employee="${escapeHtml(employeeRecordKey(e))}">
    <td>${escapeHtml(e.employeeId)}</td>
    <td><button class="link-button" type="button">${escapeHtml(`${e.firstName} ${e.lastName}`)}</button></td>
    <td>${escapeHtml(e.department)}</td>
    <td>${escapeHtml(e.jobTitle)}</td>
    <td>${escapeHtml(roleCategoryLabel(e))}</td>
    <td>${escapeHtml(userName(e.lineManagerUserId))}</td>
    <td><span class="badge ${escapeHtml(e.status)}">${escapeHtml(e.status)}</span></td>
  </tr>`).join("")}</tbody></table></div>`;
}

function employeePagination(total, totalPages) {
  if (!total) return "";
  const start = (state.employeePage - 1) * state.employeePageSize + 1;
  const end = Math.min(total, state.employeePage * state.employeePageSize);
  return `<div class="pagination">
    <div class="hint">Showing ${start}-${end} of ${total} employees</div>
    <div class="toolbar pagination-controls">
      <button class="secondary" type="button" data-employee-page="prev" ${state.employeePage <= 1 ? "disabled" : ""}>Previous</button>
      <span class="hint">Page ${state.employeePage} of ${totalPages}</span>
      <button class="secondary" type="button" data-employee-page="next" ${state.employeePage >= totalPages ? "disabled" : ""}>Next</button>
      <select id="employeePageSize">${[5, 10, 20].map(size => `<option value="${size}" ${state.employeePageSize === size ? "selected" : ""}>${size} per page</option>`).join("")}</select>
    </div>
  </div>`;
}
