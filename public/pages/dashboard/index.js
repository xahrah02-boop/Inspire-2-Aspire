import { state } from "../../shared/state.js";
import { escapeHtml } from "../../shared/api.js";
import { panel, table } from "../../shared/ui.js";
import { managerAssignedAppraisals } from "../../shared/helpers.js";
import { attachAppraisalHandlers } from "../../shared/appraisal.js";

export function render() {
  if (state.user.role === "LINE_MANAGER") return renderManagerDashboard();
  const cards = state.data.dashboard.cards.map(([label, value]) =>
    `<article class="card"><div class="metric">${escapeHtml(label)}</div><div class="metric-value">${typeof value === "object" ? Object.entries(value).map(([k, v]) => `${k}: ${v}`).join("<br>") : escapeHtml(value)}</div></article>`).join("");
  return `<div class="grid cards">${cards}</div>
    <div class="split" style="margin-top:14px">
      ${panel("Notifications", table(state.data.notifications || [], ["title", "message"], []))}
      ${panel("Workflow", workflow())}
    </div>`;
}

export function attach(root) {
  attachAppraisalHandlers(root);
}

function renderManagerDashboard() {
  const cards = state.data.dashboard.cards.map(([label, value]) =>
    `<article class="card"><div class="metric">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div></article>`).join("");
  const reviews = managerReviewRows();
  return `<div class="grid cards">${cards}</div>
    ${panel("Assigned staff KPI reviews", reviews.length ? managerReviewTable(reviews) : "<div class='empty'>No assigned staff with KPIs yet.</div>")}`;
}

function managerReviewRows() {
  return managerAssignedAppraisals().filter(a => a.employee).map(appraisal => {
    const comments = appraisal.scores.filter(s => s.employeeComment);
    return {
      appraisal,
      employee: appraisal.employee,
      commentSummary: comments.length ? `${comments.length} KPI comment${comments.length === 1 ? "" : "s"} submitted` : "No employee comment yet",
      unconfirmed: comments.filter(s => !s.managerConfirmedEmployeeComment).length
    };
  });
}

function managerReviewTable(rows) {
  return `<div class="table-wrap"><table><thead><tr>
    <th>Employee</th><th>Department</th><th>Designation</th><th>KPI comments</th><th>Review status</th><th>Action</th>
  </tr></thead><tbody>${rows.map(row => `<tr>
    <td>${escapeHtml(`${row.employee.firstName} ${row.employee.lastName}`)}</td>
    <td>${escapeHtml(row.employee.department)}</td>
    <td>${escapeHtml(row.employee.jobTitle)}</td>
    <td>${escapeHtml(row.commentSummary)}${row.unconfirmed ? ` · ${row.unconfirmed} pending confirmation` : ""}</td>
    <td><span class="badge ${escapeHtml(row.appraisal.status)}">${escapeHtml(row.appraisal.status)}</span></td>
    <td><button type="button" data-open-manager-review="${escapeHtml(row.appraisal.id)}">Open KPI Review</button></td>
  </tr>`).join("")}</tbody></table></div>`;
}

function workflow() {
  return `<ol class="hint">
    <li>HR creates KPI master and templates.</li>
    <li>HR maintains employee records and assigns managers.</li>
    <li>HR opens an appraisal period.</li>
    <li>Line managers save drafts and submit appraisals.</li>
    <li>HR reviews, returns, approves, or publishes.</li>
    <li>Employees view and acknowledge published results.</li>
  </ol>`;
}
