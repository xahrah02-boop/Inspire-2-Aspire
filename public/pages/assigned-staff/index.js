import { state } from "../../shared/state.js";
import { escapeHtml } from "../../shared/api.js";
import { panel } from "../../shared/ui.js";
import {
  managerAttachedEmployees, managerAssignedAppraisals, uniqueEmployees,
  managerAppraisalForEmployee, employeeRecordKey
} from "../../shared/helpers.js";
import { attachAppraisalHandlers } from "../../shared/appraisal.js";

export function render() {
  const rows = assignedStaffRows();
  return panel("Assigned staff", rows.length ? assignedStaffTable(rows) : "<div class='empty'>No staff assigned yet.</div>");
}

export function attach(root) {
  // Row clicks (data-assess-staff) are handled by the global delegated handler.
  attachAppraisalHandlers(root);
}

function assignedStaffRows() {
  const rows = [
    ...(state.data.assignedStaff || []),
    ...(state.user.role === "LINE_MANAGER" ? managerAttachedEmployees() : []),
    ...managerAssignedAppraisals().map(a => a.employee).filter(Boolean)
  ];
  return uniqueEmployees(rows).filter(e => e.userId !== state.user.id);
}

function assignedStaffTable(rows) {
  return `<div class="table-wrap"><table><thead><tr>
    <th>Employee</th><th>Department</th><th>Designation</th><th>Score status</th><th>Action</th>
  </tr></thead><tbody>${rows.map(employee => {
    const appraisal = managerAppraisalForEmployee(employeeRecordKey(employee));
    return `<tr class="clickable-row" data-assess-staff="${escapeHtml(employeeRecordKey(employee))}">
      <td><button class="link-button" type="button">${escapeHtml(`${employee.firstName || ""} ${employee.lastName || ""}`.trim() || employee.name || "Employee")}</button></td>
      <td>${escapeHtml(employee.department || "")}</td>
      <td>${escapeHtml(employee.jobTitle || "")}</td>
      <td><span class="badge ${escapeHtml(appraisal?.status || "Not Started")}">${escapeHtml(appraisal?.status || "Not Started")}</span></td>
      <td><button type="button" data-assess-staff="${escapeHtml(employeeRecordKey(employee))}">Edit</button></td>
    </tr>`;
  }).join("")}</tbody></table></div>`;
}
