import { state } from "../../shared/state.js";
import { escapeHtml } from "../../shared/api.js";
import { panel, table } from "../../shared/ui.js";
import { managerAttachedEmployees, managerAppraisalForEmployee, employeeRecordKey } from "../../shared/helpers.js";
import { openModal, employeeModal } from "../../shared/modals.js";
import { attachAppraisalHandlers } from "../../shared/appraisal.js";

export function render() {
  if (state.user.role === "LINE_MANAGER") {
    const assigned = managerAttachedEmployees();
    const managerRecord = state.data.employees.find(e => e.userId === state.user.id);
    return `${panel("My profile", managerRecord
        ? table([managerRecord], ["employeeId", "firstName", "lastName", "email", "phone", "department", "jobTitle", "status"], ["status"])
        : `<div class="card"><h2>${escapeHtml(state.user.name)}</h2><div class="hint">${escapeHtml(state.user.email)} · Line Manager</div></div>`)}
      ${panel("Employees assigned to me", assigned.length ? managerAssignedEmployeesTable(assigned) : "<div class='empty'>No employees assigned yet.</div>")}`;
  }
  const employee = state.data.employees[0];
  if (!employee) return "<div class='empty'>No employee profile found.</div>";
  return panel("My profile", table([employee], ["employeeId", "firstName", "lastName", "email", "phone", "department", "jobTitle", "status", "emergencyContact"], ["status"]));
}

export function attach(root) {
  attachAppraisalHandlers(root);
  root.querySelectorAll("[data-employee]").forEach(el => el.addEventListener("click", event => {
    event.preventDefault();
    const employee = state.data.employees.find(item => employeeRecordKey(item) === el.dataset.employee);
    if (employee) openModal(employeeModal(employee));
  }));
}

function managerAssignedEmployeesTable(rows) {
  return `<div class="table-wrap"><table><thead><tr>
    <th>Employee</th><th>Department</th><th>Designation</th><th>Status</th><th>Action</th>
  </tr></thead><tbody>${rows.map(employee => `<tr class="clickable-row" data-employee="${escapeHtml(employeeRecordKey(employee))}">
    <td><button class="link-button" type="button">${escapeHtml(`${employee.firstName} ${employee.lastName}`)}</button></td>
    <td>${escapeHtml(employee.department)}</td>
    <td>${escapeHtml(employee.jobTitle)}</td>
    <td><span class="badge ${escapeHtml(employee.status)}">${escapeHtml(employee.status)}</span></td>
    <td>${managerAppraisalForEmployee(employeeRecordKey(employee)) ? `<button type="button" data-open-manager-review="${escapeHtml(managerAppraisalForEmployee(employeeRecordKey(employee)).id)}">Open KPI Review</button>` : ""}</td>
  </tr>`).join("")}</tbody></table></div>`;
}
