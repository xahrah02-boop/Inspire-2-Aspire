// Small presentational primitives shared by every page.

import { escapeHtml } from "./api.js";
import { state } from "./state.js";
import { employeeRoleCategories, employeeRecordKey, targetOptions } from "./helpers.js";

export function panel(title, body) {
  return `<section class="card"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

export function table(rows, fields, badgeFields = []) {
  if (!rows?.length) return "<div class='empty'>No records found.</div>";
  return `<div class="table-wrap"><table><thead><tr>${fields.map(f => `<th>${escapeHtml(f.replace(/([A-Z])/g, " $1"))}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${fields.map(f => {
    const value = row[f];
    return `<td>${badgeFields.includes(f) ? `<span class="badge ${escapeHtml(value)}">${escapeHtml(value)}</span>` : escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function input(name, label, type = "text") {
  return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" required></div>`;
}

export function periodToolbar() {
  return `<div class="toolbar">
    <select id="periodFilter">
      <option value="all" ${state.periodFilter === "all" ? "selected" : ""}>All appraisal periods</option>
      ${state.data.periods.map(p => `<option value="${p.id}" ${state.periodFilter === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
    </select>
  </div>`;
}

export function employeeSelect(name, label, selected = "", category = "all", department = "all") {
  const rows = state.data.employees.filter(employee => {
    const matchesCategory = category === "all" || employeeRoleCategories(employee).includes(category);
    const matchesDepartment = department === "all" || employee.department === department;
    return matchesCategory && matchesDepartment;
  });
  return `<div class="field"><label>${label}</label><select name="${name}">
    <option value="">Not assigned</option>
    ${rows.map(employee => `<option value="${escapeHtml(employeeRecordKey(employee))}" ${selected === employeeRecordKey(employee) ? "selected" : ""}>${escapeHtml(`${employee.firstName} ${employee.lastName} - ${employee.department}`)}</option>`).join("")}
  </select></div>`;
}

export function roleCategoryChecks(employee) {
  const selected = employeeRoleCategories(employee);
  return `<fieldset class="field role-checks"><legend>Employee role categories</legend>
    ${["staff", "supervisory", "managerial"].map(role => `<label><input type="checkbox" name="roleCategories" value="${role}" ${selected.includes(role) ? "checked" : ""}> ${role}</label>`).join("")}
  </fieldset>`;
}

export function employeeTargetSelect(score) {
  const options = targetOptions(score.target);
  return `<select name="target" aria-label="Target for ${escapeHtml(score.title)}">
    ${options.map(option => `<option value="${escapeHtml(option)}" ${option === score.target ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
  </select>`;
}
