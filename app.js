const app = document.querySelector("#app");
let state = { user: null, data: null, view: "dashboard", query: "", filter: "all", periodFilter: "all", employeeNameFilter: "", employeeDepartmentFilter: "all", employeeRoleFilter: "all", employeePage: 1, employeePageSize: 5, kpiStatusFilter: "all", kpiDepartmentFilter: "all", kpiRoleFilter: "all", kpiFrequencyFilter: "all", kpiPage: 1, kpiPageSize: 5, selectedTemplateId: "" };
let searchTimer;

const roleMenus = {
  SUPER_ADMIN: ["dashboard", "users", "departments", "kpis", "templates", "employees", "periods", "appraisals", "reports", "help", "audit"],
  HR_ADMIN: ["dashboard", "departments", "kpis", "templates", "employees", "periods", "appraisals", "reports", "help", "audit"],
  LINE_MANAGER: ["profile", "employees", "appraisals", "help"],
  EMPLOYEE: ["profile", "kpis", "results", "help"]
};

const labels = {
  dashboard: "Dashboard", users: "Users", departments: "Departments & Roles", kpis: "KPI Master",
  templates: "KPI Templates", employees: "Employee Master", periods: "Appraisal Periods",
  appraisals: "My Appraisals / HR Review", reports: "Reports", help: "Onboarding & Help",
  audit: "Audit Trail", profile: "My Profile", results: "Appraisal Results"
};

async function api(path, options = {}) {
  const apiBaseUrl = window.FORGE_HR_CONFIG?.apiBaseUrl || "";
  const remoteToken = apiBaseUrl ? localStorage.getItem("forgeHrToken") : "";
  const joiner = apiBaseUrl.includes("?") ? "&" : "?";
  const tokenPart = remoteToken ? `&token=${encodeURIComponent(remoteToken)}` : "";
  const url = apiBaseUrl ? `${apiBaseUrl}${joiner}path=${encodeURIComponent(path)}${tokenPart}` : path;
  const method = apiBaseUrl && options.method && options.method !== "GET" ? "POST" : options.method;
  const body = options.body ? { ...options.body } : undefined;
  if (apiBaseUrl && remoteToken && body) body.token = remoteToken;
  const fetchOptions = {
    credentials: apiBaseUrl ? "omit" : "same-origin",
    ...options,
    method,
    body: body ? JSON.stringify(body) : undefined
  };
  if (body) {
    fetchOptions.headers = apiBaseUrl
      ? { "content-type": "text/plain;charset=utf-8" }
      : { "content-type": "application/json" };
  }
  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[m]));
}

async function init() {
  if (window.FORGE_HR_CONFIG?.apiBaseUrl && !localStorage.getItem("forgeHrToken")) {
    renderLogin();
    return;
  }
  try {
    const me = await api("/api/me");
    state.user = me.user;
    state.data = await api("/api/bootstrap");
    setDefaultViewForRole();
    renderShell();
  } catch {
    renderLogin();
  }
}

function renderLogin() {
  app.innerHTML = `
    <section class="login-shell">
      <div class="login-panel">
        <div class="brand"><div class="mark">FH</div><div><strong>ForgeHR Performance</strong><div class="hint">Manufacturing appraisal system</div></div></div>
        <h1>Sign in</h1>
        <p class="hint">Use one of the seeded demo accounts to explore role-based workflows.</p>
        <form id="loginForm">
          <div class="field"><label>Email</label><input name="email" value="hr.admin@company.test" autocomplete="username"></div>
          <div class="field"><label>Password</label><input name="password" type="password" value="Password123!" autocomplete="current-password"></div>
          <div class="error" id="loginError"></div>
          <button type="submit">Sign in</button>
        </form>
        <p class="hint">Demo users: super.admin@company.test, hr.admin@company.test, grace.manager@company.test, john.operator@company.test. Password: Password123!</p>
      </div>
      <div class="login-art">
        <div>
          <h1>Practical KPI management for plant, field, and office teams.</h1>
          <p>Track expectations, manager reviews, HR approval, employee acknowledgement, reports, and audit history in one place.</p>
        </div>
      </div>
    </section>`;
  document.querySelector("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api("/api/login", { method: "POST", body: Object.fromEntries(form) });
      if (result.user?.token) localStorage.setItem("forgeHrToken", result.user.token);
      state.user = result.user;
      state.data = await api("/api/bootstrap");
      setDefaultViewForRole();
      renderShell();
    } catch (error) {
      document.querySelector("#loginError").textContent = error.message;
    }
  });
}

function renderShell() {
  const menu = roleMenus[state.user.role] || ["dashboard"];
  if (!menu.includes(state.view)) state.view = menu[0];
  app.innerHTML = `
    <section class="layout">
      <aside class="sidebar">
        <div class="brand"><div class="mark">FH</div><div><strong>ForgeHR</strong><div class="hint">Performance appraisal</div></div></div>
        <div class="userbox"><strong>${escapeHtml(state.user.name)}</strong><span>${escapeHtml(state.user.role.replace("_", " "))}</span></div>
        <nav class="nav">${menu.map(item => `<button data-view="${item}" class="${state.view === item ? "active" : ""}">${navLabel(item)}</button>`).join("")}</nav>
        <button class="secondary" id="logout">Sign out</button>
      </aside>
      <section class="content">
        <div class="topbar">
          <div><h1>${navLabel(state.view)}</h1><div class="hint">${subtitleFor(state.view)}</div></div>
          <div class="hint">${new Date().toLocaleDateString()} · ${escapeHtml(state.data.periods[0]?.name || "No open period")}</div>
        </div>
        <div id="view"></div>
      </section>
    </section>`;
  document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => {
    state.view = btn.dataset.view;
    state.query = "";
    renderShell();
  }));
  document.querySelector("#logout").addEventListener("click", async () => {
    if (window.FORGE_HR_CONFIG?.apiBaseUrl) {
      localStorage.removeItem("forgeHrToken");
    } else {
      await api("/api/logout", { method: "POST" });
    }
    state = { user: null, data: null, view: "dashboard", query: "", filter: "all", periodFilter: "all", employeeNameFilter: "", employeeDepartmentFilter: "all", employeeRoleFilter: "all", employeePage: 1, employeePageSize: 5, kpiStatusFilter: "all", kpiDepartmentFilter: "all", kpiRoleFilter: "all", kpiFrequencyFilter: "all", kpiPage: 1, kpiPageSize: 5, selectedTemplateId: "" };
    renderLogin();
  });
  renderView();
}

function setDefaultViewForRole() {
  const menu = roleMenus[state.user?.role] || ["dashboard"];
  state.view = menu[0];
}

function navLabel(item) {
  if (state.user?.role === "EMPLOYEE" && item === "kpis") return "My Assigned KPI";
  return labels[item];
}

function subtitleFor(view) {
  return {
    dashboard: "Role-specific metrics and work queues.",
    kpis: "Create, search, filter, and archive KPI master records.",
    templates: "Build KPI templates with 100% weight validation.",
    employees: "Maintain employee data, managers, templates, and account status.",
    appraisals: "Manager scoring, HR review, approval, publishing, and acknowledgement.",
    help: "Guidance for HR admins, line managers, employees, and new starters.",
    reports: "Performance, completion, training, probation, and department summaries.",
    audit: "Traceable system actions for compliance and governance."
  }[view] || "Manufacturing HR performance workflow.";
}

function renderView() {
  const target = document.querySelector("#view");
  const renderers = {
    dashboard: renderDashboard, departments: renderDepartments, kpis: renderKpis, templates: renderTemplates,
    employees: renderEmployees, periods: renderPeriods, appraisals: renderAppraisals, reports: renderReports,
    help: renderHelp, audit: renderAudit, profile: renderProfile, results: renderResults, users: renderUsers
  };
  target.innerHTML = renderers[state.view]?.() || "<div class='empty'>No view configured.</div>";
  attachHandlers();
}

function renderDashboard() {
  const cards = state.data.dashboard.cards.map(([label, value]) => `<article class="card"><div class="metric">${escapeHtml(label)}</div><div class="metric-value">${typeof value === "object" ? Object.entries(value).map(([k, v]) => `${k}: ${v}`).join("<br>") : escapeHtml(value)}</div></article>`).join("");
  return `<div class="grid cards">${cards}</div><div class="split" style="margin-top:14px">${panel("Notifications", table(state.data.notifications || [], ["title", "message"], []))}${panel("Workflow", workflow())}</div>`;
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

function renderUsers() {
  return panel("System users", table(state.data.userList || [], ["name", "email", "role", "status"], []));
}

function renderDepartments() {
  return `<div class="section-stack">
    ${departmentRecordSection()}
    ${jobRoleRecordSection()}
  </div>`;
}

function departmentRecordSection() {
  return `<section class="card">
    <div class="topbar">
      <h2>Department master records</h2>
      ${canManage() ? `<button type="button" data-create-department>Add Department</button>` : ""}
    </div>
    ${departmentDropdown()}
  </section>`;
}

function jobRoleRecordSection() {
  return `<section class="card">
    <div class="topbar">
      <h2>Job role records</h2>
      <div class="toolbar">
        ${jobRoleDropdown()}
        ${canManage() ? `<button type="button" data-create-job-role>Add Job Role</button>` : ""}
      </div>
    </div>
    <div class="hint">Select a job role from the dropdown to open its details.</div>
  </section>`;
}

function renderKpis() {
  if (state.user.role === "EMPLOYEE") return renderEmployeeKpis();
  const rows = filterKpis(state.data.kpiMaster);
  const page = paginateRowsWithState(rows, state.kpiPage, state.kpiPageSize, "kpiPage");
  return `${kpiFilterToolbar()}
    ${panel("KPI records", kpiTable(page.rows) + kpiPagination(rows.length, page.totalPages))}
    ${canManage() ? kpiForm() : ""}`;
}

function renderEmployeeKpis() {
  const appraisal = state.data.appraisals[0];
  const employee = state.data.employees[0];
  const rows = employeeAssignedKpiRows(employee, appraisal);
  const periodId = appraisal?.periodId || state.data.periods.find(period => period.status === "open")?.id || state.data.periods[0]?.id || "";
  if (!employee || !rows.length) return "<div class='empty'>No KPI assigned yet.</div>";
  return `<section class="card">
    <div class="topbar">
      <div><h2>My assigned KPIs</h2><div class="hint">${escapeHtml(employee.department)} · ${escapeHtml(employee.jobTitle)} · ${escapeHtml(periodName(periodId))}</div></div>
      <span class="badge ${appraisal?.status || "Not Started"}">${escapeHtml(appraisal?.status || "Not Started")}</span>
    </div>
    <form id="employeeKpiCommentForm" data-period-id="${escapeHtml(periodId)}">
      <div class="table-wrap"><table><thead><tr>
        <th>KPI</th><th>Weight</th><th>Target</th><th>My comment</th><th>Manager confirmed</th>
      </tr></thead><tbody>${rows.map(score => `<tr>
        <td><strong>${escapeHtml(score.title)}</strong></td>
        <td>${escapeHtml(score.weight)}%</td>
        <td>${escapeHtml(score.target)}</td>
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

function renderTemplates() {
  const rows = filterRows(state.data.templates, ["name", "department", "jobRole", "status"]);
  const selected = selectedTemplate(rows);
  return `${templateToolbar(rows)}
    ${panel("KPI template", selected ? templateDetail(selected) : "<div class='empty'>No KPI templates found.</div>")}`;
}

function renderEmployees() {
  const rows = filterEmployees(state.data.employees);
  const page = paginateRows(rows, state.employeePage, state.employeePageSize);
  return `${employeeFilterToolbar()}
    ${panel("Employee records", employeeTable(page.rows) + employeePagination(rows.length, page.totalPages))}`;
}

function renderPeriods() {
  return `<div class="section-stack">
    ${panel("Appraisal period filter", periodToolbar())}
    ${panel("Appraisal period records", `${canManage() ? `<div class="toolbar page-actions"><button type="button" data-create-period>Add Period</button></div>` : ""}${periodTable(filteredPeriods())}`)}
  </div>`;
}

function renderAppraisals() {
  const rows = filteredAppraisals();
  if (!rows.length) return "<div class='empty'>No appraisal assigned yet.</div>";
  return `${periodToolbar()}<div class="appraisal-list">${rows.map(appraisalLine).join("")}</div>`;
}

function appraisalCard(appraisal) {
  const employeeName = appraisal.employee ? `${appraisal.employee.firstName} ${appraisal.employee.lastName}` : "Employee";
  const canScore = state.user.role === "LINE_MANAGER" && appraisal.status !== "Approved";
  const canReview = ["HR_ADMIN", "SUPER_ADMIN"].includes(state.user.role);
  const canAck = state.user.role === "EMPLOYEE" && appraisal.status === "Published";
  const hasEmployeeComments = appraisal.scores.some(score => score.employeeComment);
  const hasUnconfirmedComments = appraisal.scores.some(score => score.employeeComment && !score.managerConfirmedEmployeeComment);
  return `<article class="card" style="margin-bottom:14px">
    <div class="topbar"><div><h2>${escapeHtml(employeeName)}</h2><div class="hint">${escapeHtml(appraisal.employee?.department)} · ${escapeHtml(appraisal.employee?.jobTitle)}</div></div><div><span class="badge ${appraisal.status}">${escapeHtml(appraisal.status)}</span></div></div>
    ${state.user.role === "LINE_MANAGER" ? managerScoreForm(appraisal) : table(appraisal.scores.map(s => ({ ...s, employeeComment: s.employeeComment || "No employee comment yet", employeeCommentStatus: s.managerConfirmedEmployeeComment ? "Confirmed" : (s.employeeComment ? "Pending confirmation" : "Not submitted"), weighted: (Number(s.score) * Number(s.weight) / 100).toFixed(2) })), ["title", "weight", "target", "score", "actualResult", "managerComment", "employeeComment", "employeeCommentStatus", "weighted"], [])}
    <div class="grid cards" style="margin-top:12px">
      <div class="card"><div class="metric">Final score</div><div class="metric-value">${appraisal.finalScore}</div></div>
      <div class="card"><div class="metric">Final rating</div><div class="metric-value">${escapeHtml(appraisal.rating)}</div></div>
      <div class="card"><div class="metric">Training recommendation</div><strong>${escapeHtml(appraisal.trainingRecommendation)}</strong></div>
      <div class="card"><div class="metric">HR comment</div><strong>${escapeHtml(appraisal.hrComment || "Pending HR review")}</strong></div>
    </div>
    <div class="toolbar" style="margin-top:12px">
      ${canScore ? `<button data-submit-appraisal="${appraisal.id}">Submit to HR</button><button class="secondary" data-draft-appraisal="${appraisal.id}">Save draft</button>` : ""}
      ${state.user.role === "LINE_MANAGER" && hasEmployeeComments ? `<button class="${hasUnconfirmedComments ? "" : "secondary"}" data-confirm-comments="${appraisal.id}" ${hasUnconfirmedComments ? "" : "disabled"}>${hasUnconfirmedComments ? "Confirm Employee Comments" : "Employee Comments Confirmed"}</button>` : ""}
      ${canReview ? `<button data-review="${appraisal.id}" data-action="approve">Approve</button><button data-review="${appraisal.id}" data-action="publish">Publish</button><button class="secondary" data-review="${appraisal.id}" data-action="return">Return</button>` : ""}
      ${canAck ? `<button data-ack="${appraisal.id}">Acknowledge result</button>` : ""}
    </div>
  </article>`;
}

function managerScoreForm(appraisal) {
  return `<form data-manager-score-form="${escapeHtml(appraisal.id)}">
    <div class="table-wrap appraisal-score-wrap"><table class="score-table"><thead><tr>
      <th>KPI</th><th>Weight</th><th>Target</th><th>Score</th><th>Actual result</th><th>Manager comment</th><th>Evidence</th><th>Employee comment</th><th>Comment status</th><th>Weighted</th>
    </tr></thead><tbody>${appraisal.scores.map(score => `<tr data-score-row="${escapeHtml(score.id)}">
      <td><strong>${escapeHtml(score.title)}</strong></td>
      <td>${escapeHtml(score.weight)}%</td>
      <td>${escapeHtml(score.target)}</td>
      <td><input class="score-input" name="score" type="number" min="1" max="30" step="1" value="${escapeHtml(score.score)}" data-score-field="score" aria-label="Score 1 to 30"></td>
      <td><textarea name="actualResult" data-score-field="actualResult">${escapeHtml(score.actualResult || "")}</textarea></td>
      <td><textarea name="managerComment" data-score-field="managerComment">${escapeHtml(score.managerComment || "")}</textarea></td>
      <td>
        <label class="file-field">
          <input name="evidenceFile" type="file" data-score-field="evidenceFile">
          <span>Attach file</span>
        </label>
        <div class="hint evidence-name">${escapeHtml(score.evidenceFileName || score.evidenceNote || "No file attached")}</div>
      </td>
      <td>${escapeHtml(score.employeeComment || "No employee comment yet")}</td>
      <td><span class="badge ${score.managerConfirmedEmployeeComment ? "active" : "Draft"}">${score.managerConfirmedEmployeeComment ? "Confirmed" : (score.employeeComment ? "Pending confirmation" : "Not submitted")}</span></td>
      <td>${(Number(score.score) * Number(score.weight) / 100).toFixed(2)}</td>
    </tr>`).join("")}</tbody></table></div>
  </form>`;
}

function appraisalLine(appraisal) {
  const employeeName = appraisal.employee ? `${appraisal.employee.firstName} ${appraisal.employee.lastName}` : "Employee";
  const actionAttr = state.user.role === "LINE_MANAGER" ? `data-open-appraisal="${appraisal.id}"` : `data-toggle-appraisal="${appraisal.id}"`;
  return `<article class="appraisal-row">
    <button class="appraisal-summary" ${actionAttr}>
      <span><strong>${escapeHtml(employeeName)}</strong></span>
      <span>${escapeHtml(appraisal.employee?.department || "")}</span>
      <span>${escapeHtml(appraisal.employee?.jobTitle || "")}</span>
      <span><span class="badge ${appraisal.status}">${escapeHtml(appraisal.status)}</span></span>
    </button>
    ${state.user.role === "LINE_MANAGER" ? "" : `<div class="appraisal-detail" id="detail-${escapeHtml(appraisal.id)}" hidden>
      ${appraisalCard(appraisal)}
    </div>`}
  </article>`;
}

function appraisalModal(appraisal) {
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

function renderResults() {
  return renderAppraisals();
}

function renderProfile() {
  if (state.user.role === "LINE_MANAGER") {
    const assigned = state.data.employees.filter(employee => employee.userId !== state.user.id);
    const managerRecord = state.data.employees.find(employee => employee.userId === state.user.id);
    return `${panel("My profile", managerRecord ? table([managerRecord], ["employeeId", "firstName", "lastName", "email", "phone", "department", "jobTitle", "status"], ["status"]) : `<div class="card"><h2>${escapeHtml(state.user.name)}</h2><div class="hint">${escapeHtml(state.user.email)} · Line Manager</div></div>`)}
      ${panel("Employees assigned to me", assigned.length ? managerAssignedEmployeesTable(assigned) : "<div class='empty'>No employees assigned yet.</div>")}`;
  }
  const employee = state.data.employees[0];
  if (!employee) return "<div class='empty'>No employee profile found.</div>";
  return panel("My profile", table([employee], ["employeeId", "firstName", "lastName", "email", "phone", "department", "jobTitle", "status", "emergencyContact"], ["status"]));
}

function managerAssignedEmployeesTable(rows) {
  return `<div class="table-wrap"><table><thead><tr>
    <th>Employee</th><th>Department</th><th>Designation</th><th>Status</th>
  </tr></thead><tbody>${rows.map(employee => `<tr class="clickable-row" data-employee="${employee.id}">
    <td><button class="link-button" type="button">${escapeHtml(`${employee.firstName} ${employee.lastName}`)}</button></td>
    <td>${escapeHtml(employee.department)}</td>
    <td>${escapeHtml(employee.jobTitle)}</td>
    <td><span class="badge ${escapeHtml(employee.status)}">${escapeHtml(employee.status)}</span></td>
  </tr>`).join("")}</tbody></table></div>`;
}

function renderReports() {
  const r = state.data.reports;
  const totalAppraisals = (r.completion.completed || 0) + (r.completion.pending || 0);
  const approved = state.data.appraisals.filter(appraisal => ["Approved", "Published", "Acknowledged"].includes(appraisal.status)).length;
  return `<div class="grid cards">
    <article class="card"><div class="metric">Total appraisals</div><div class="metric-value">${totalAppraisals}</div></article>
    <article class="card"><div class="metric">Pending appraisals</div><div class="metric-value">${r.completion.pending}</div></article>
    <article class="card"><div class="metric">Approved appraisals</div><div class="metric-value">${approved}</div></article>
  </div>
  <div class="toolbar report-actions">
    ${canManage() ? `<button type="button" data-department-report>Department Performance Summary</button><button type="button" data-training-report>Training Needs Report</button>` : ""}
  </div>`;
}

function departmentReportModal() {
  const rows = state.data.reports.byDepartment || [];
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>Department Performance Summary</h2><div class="hint">Review department averages and save the report snapshot.</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      ${table(rows, ["department", "appraisals", "average"], [])}
      <form id="departmentReportForm" class="form-grid compact-form">
        <div class="field full"><label>Report note</label><textarea name="note">Department performance summary reviewed by HR.</textarea></div>
        <button type="submit">Save report</button>
      </form>
    </section>
  </div>`;
}

function trainingReportModal() {
  const rows = state.data.reports.trainingNeeds || [];
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>Training Needs Report</h2><div class="hint">Review recommendations and save the report snapshot.</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      ${table(rows, ["employee", "recommendation"], [])}
      <form id="trainingReportForm" class="form-grid compact-form">
        <div class="field full"><label>Report note</label><textarea name="note">Training needs reviewed by HR.</textarea></div>
        <button type="submit">Save report</button>
      </form>
    </section>
  </div>`;
}

function renderHelp() {
  const checklist = ["Complete profile review", "Read KPI explanation", "View assigned KPIs", "Confirm understanding of performance expectations", "Read company appraisal policy", "Acknowledge onboarding completion"];
  return `<div class="split">${panel("How to use this system", state.data.guides.map(g => `<div class="card" style="margin-bottom:10px"><h3>${escapeHtml(g.title)}</h3><div class="hint">${escapeHtml(g.audience)}</div><p>${escapeHtml(g.body)}</p></div>`).join(""))}${panel("New employee onboarding checklist", checklist.map((item, i) => `<label class="field"><span><input type="checkbox"> ${i + 1}. ${escapeHtml(item)}</span></label>`).join("") + `<h3>FAQ</h3><p class="hint">KPI weights show how much each measure contributes to the final score. A published result can be acknowledged from Appraisal Results.</p>`)}</div>`;
}

function renderAudit() {
  return panel("Audit logs", table(state.data.auditLogs, ["createdAt", "userId", "action", "module", "record", "oldValue", "newValue"], []));
}

function departmentForm() {
  return `<form id="departmentForm" class="form-grid compact-form">
    ${input("name", "Department name")}
    ${employeeSelect("managerialRole", "Managerial role holder", "", "all")}
    ${employeeSelect("supervisoryRole", "Supervisory role holder", "", "all")}
    <button type="submit">Add department</button>
  </form>`;
}

function departmentCreateModal() {
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal narrow-modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>Add Department</h2><div class="hint">Create a department master record.</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      ${departmentForm()}
    </section>
  </div>`;
}

function departmentDropdown() {
  if (!state.data.departments.length) return "<div class='empty'>No departments found.</div>";
  return `<div class="form-grid compact-form record-selector">
    <div class="field full">
      <label for="departmentMasterSelect">Department name dropdown</label>
      <select id="departmentMasterSelect">
        <option value="">Select department</option>
        ${state.data.departments.map(dept => `<option value="${escapeHtml(dept.id)}">${escapeHtml(dept.name)}</option>`).join("")}
      </select>
      <div class="hint">Selecting a department opens its department master details.</div>
    </div>
  </div>`;
}

function jobRoleTable() {
  if (!state.data.jobRoles.length) return "<div class='empty'>No job roles found.</div>";
  return `<div class="table-wrap"><table><thead><tr>
    <th>Title</th><th>Department</th><th>Status</th><th>Action</th>
  </tr></thead><tbody>${state.data.jobRoles.map(role => `<tr>
    <td>${escapeHtml(role.title)}</td>
    <td>${escapeHtml(role.department)}</td>
    <td><span class="badge ${escapeHtml(role.status)}">${escapeHtml(role.status)}</span></td>
    <td>${canManage() ? `<button class="secondary small-button" data-edit-role="${role.id}" type="button">Edit</button>` : ""}</td>
  </tr>`).join("")}</tbody></table></div>`;
}

function jobRoleDropdown() {
  return `<div class="field inline-filter record-selector">
      <label for="jobRoleMasterSelect">Job role</label>
      <select id="jobRoleMasterSelect">
        <option value="">${state.data.jobRoles.length ? "Select job role" : "No job roles found"}</option>
        ${state.data.jobRoles.map(role => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.title)} - ${escapeHtml(role.department)}</option>`).join("")}
      </select>
  </div>`;
}

function jobRoleForm() {
  return `<form id="jobRoleForm" class="form-grid compact-form">
    <div class="field"><label>Role title</label><input name="title" required></div>
    <div class="field"><label>Department</label><select name="department">${departmentOptions()}</select></div>
    <div class="field"><label>Status</label><select name="status">${["active", "archived"].map(status => `<option value="${status}">${status}</option>`).join("")}</select></div>
    <button type="submit">Add job role</button>
  </form>`;
}

function jobRoleCreateModal() {
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal narrow-modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>Add Job Role</h2><div class="hint">Create a job role and link it to a department.</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      ${jobRoleForm()}
    </section>
  </div>`;
}

function departmentModal(dept) {
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal narrow-modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>Edit department</h2><div class="hint">${escapeHtml(dept.name)}</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      <form id="editDepartmentForm" class="form-grid" data-department-id="${dept.id}">
        <div class="field"><label>Department name</label><input name="name" value="${escapeHtml(dept.name)}" required></div>
        ${employeeSelect("managerialRole", "Managerial role holder", dept.managerialRole, "all", dept.name)}
        ${employeeSelect("supervisoryRole", "Supervisory role holder", dept.supervisoryRole, "all", dept.name)}
        <div class="field"><label>Status</label><select name="status">${["active", "archived"].map(status => `<option value="${status}" ${dept.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
        <button type="submit">Save department</button>
      </form>
    </section>
  </div>`;
}

function jobRoleModal(role) {
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal narrow-modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>Edit job role</h2><div class="hint">${escapeHtml(role.title)}</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      <form id="editJobRoleForm" class="form-grid" data-role-id="${role.id}">
        <div class="field"><label>Role title</label><input name="title" value="${escapeHtml(role.title)}" required></div>
        <div class="field"><label>Department</label><select name="department">${state.data.departments.map(dept => `<option value="${escapeHtml(dept.name)}" ${role.department === dept.name ? "selected" : ""}>${escapeHtml(dept.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Status</label><select name="status">${["active", "archived"].map(status => `<option value="${status}" ${role.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
        <button type="submit">Save role</button>
      </form>
    </section>
  </div>`;
}

function employeeTable(rows) {
  if (!rows.length) return "<div class='empty'>No records found.</div>";
  return `<div class="table-wrap"><table><thead><tr>
    <th>Employee ID</th><th>Employee</th><th>Department</th><th>Designation</th><th>Role categories</th><th>Manager</th><th>Status</th>
  </tr></thead><tbody>${rows.map(e => `<tr class="clickable-row" data-employee="${e.id}">
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
      <select id="employeePageSize">
        ${[5, 10, 20].map(size => `<option value="${size}" ${state.employeePageSize === size ? "selected" : ""}>${size} per page</option>`).join("")}
      </select>
    </div>
  </div>`;
}

function employeeModal(employee) {
  const history = state.data.appraisals
    .filter(a => a.employee?.id === employee.id && a.status !== "Not Started")
    .sort((a, b) => String(b.periodId).localeCompare(String(a.periodId)))
    .slice(0, 6);
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>${escapeHtml(`${employee.firstName} ${employee.lastName}`)}</h2><div class="hint">${escapeHtml(employee.employeeId)} · ${escapeHtml(employee.department)} · ${escapeHtml(employee.jobTitle)}</div></div>
        <button class="secondary" data-close-modal>Close</button>
      </div>
      <div class="grid cards modal-cards">
        <div class="card"><div class="metric">Status</div><strong>${escapeHtml(employee.status)}</strong></div>
        <div class="card"><div class="metric">Role categories</div><strong>${escapeHtml(roleCategoryLabel(employee))}</strong></div>
        <div class="card"><div class="metric">Line manager</div><strong>${escapeHtml(userName(employee.lineManagerUserId))}</strong></div>
        <div class="card"><div class="metric">KPI template</div><strong>${escapeHtml(templateName(employee.templateId))}</strong></div>
        <div class="card"><div class="metric">Login email</div><strong>${escapeHtml(employee.email)}</strong></div>
        <div class="card"><div class="metric">Default password</div><strong>Password123!</strong></div>
      </div>
      ${canManage() ? employeeEditForm(employee) : ""}
      <h3>Previous performance in the last 6 months</h3>
      ${table(history.map(a => ({ period: periodName(a.periodId), status: a.status, finalScore: a.finalScore, rating: a.rating })), ["period", "status", "finalScore", "rating"], ["status"])}
    </section>
  </div>`;
}

function employeeEditForm(employee) {
  return `<section class="card edit-section">
    <h3>Edit employee master</h3>
    <form id="employeeEditForm" class="form-grid" data-employee-id="${employee.id}">
      <div class="field"><label>Employee ID</label><input name="employeeId" value="${escapeHtml(employee.employeeId)}" required></div>
      <div class="field"><label>First name</label><input name="firstName" value="${escapeHtml(employee.firstName)}" required></div>
      <div class="field"><label>Last name</label><input name="lastName" value="${escapeHtml(employee.lastName)}" required></div>
      <div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(employee.email)}" required></div>
      <div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(employee.phone || "")}"></div>
      <div class="field"><label>Department</label><select name="department">${state.data.departments.map(dept => `<option value="${escapeHtml(dept.name)}" ${employee.department === dept.name ? "selected" : ""}>${escapeHtml(dept.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Job role</label><select name="jobTitle">${state.data.jobRoles.map(role => `<option value="${escapeHtml(role.title)}" ${employee.jobTitle === role.title ? "selected" : ""}>${escapeHtml(role.title)}</option>`).join("")}</select></div>
      <div class="field"><label>Line manager</label><select name="lineManagerUserId">${lineManagerOptions(employee.lineManagerUserId, employee.department)}</select></div>
      <div class="field"><label>KPI template</label><select name="templateId"><option value="">Not assigned</option>${templateOptionsForEmployee(employee).map(t => `<option value="${t.id}" ${employee.templateId === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Employment type</label><input name="employmentType" value="${escapeHtml(employee.employmentType || "Full time")}"></div>
      <div class="field"><label>Date of employment</label><input name="dateOfEmployment" type="date" value="${escapeHtml(employee.dateOfEmployment || "")}"></div>
      <div class="field"><label>Confirmation status</label><select name="confirmationStatus">${["probation", "confirmed", "not confirmed"].map(status => `<option value="${status}" ${employee.confirmationStatus === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
      <div class="field"><label>Work location</label><input name="workLocation" value="${escapeHtml(employee.workLocation || "")}"></div>
      <div class="field"><label>Employee status</label><select name="status">${["active", "probation", "confirmed", "exited", "suspended"].map(status => `<option value="${status}" ${employee.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
      <div class="field"><label>User account status</label><select name="userAccountStatus">${["active", "inactive", "suspended"].map(status => `<option value="${status}" ${employee.userAccountStatus === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
      ${roleCategoryChecks(employee)}
      <div class="field full"><label>Emergency contact</label><input name="emergencyContact" value="${escapeHtml(employee.emergencyContact || "")}"></div>
      <div class="field full"><label>Notes</label><textarea name="notes">${escapeHtml(employee.notes || "")}</textarea></div>
      <button type="submit">Save employee</button>
    </form>
  </section>`;
}

function periodToolbar() {
  return `<div class="toolbar">
    <select id="periodFilter">
      <option value="all" ${state.periodFilter === "all" ? "selected" : ""}>All appraisal periods</option>
      ${state.data.periods.map(p => `<option value="${p.id}" ${state.periodFilter === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
    </select>
  </div>`;
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

function periodModal(period) {
  const selectedDepartments = period.departments || [];
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>Edit appraisal period</h2><div class="hint">${escapeHtml(period.name)}</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      <form id="periodEditForm" class="form-grid" data-period-id="${period.id}">
        <div class="field"><label>Period name</label><input name="name" value="${escapeHtml(period.name)}" required></div>
        <div class="field"><label>Start date</label><input name="startDate" type="date" value="${escapeHtml(period.startDate)}" required></div>
        <div class="field"><label>End date</label><input name="endDate" type="date" value="${escapeHtml(period.endDate)}" required></div>
        <div class="field"><label>Appraisal type</label><select name="type">${["monthly", "quarterly", "biannual", "annual", "probation"].map(type => `<option value="${type}" ${period.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></div>
        <div class="field"><label>Status</label><select name="status">${["open", "closed", "locked"].map(status => `<option value="${status}" ${period.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
        <fieldset class="field role-checks full"><legend>Departments included</legend>
          ${state.data.departments.map(dept => `<label><input type="checkbox" name="departments" value="${escapeHtml(dept.name)}" ${selectedDepartments.includes(dept.name) ? "checked" : ""}> ${escapeHtml(dept.name)}</label>`).join("")}
        </fieldset>
        <button type="submit">Save period</button>
      </form>
    </section>
  </div>`;
}

function filteredPeriods() {
  return state.periodFilter === "all" ? state.data.periods : state.data.periods.filter(period => period.id === state.periodFilter);
}

function filteredAppraisals() {
  return state.periodFilter === "all" ? state.data.appraisals : state.data.appraisals.filter(appraisal => appraisal.periodId === state.periodFilter);
}

function periodForm() {
  return `<form id="periodForm" class="form-grid compact-form">
    ${input("name", "Period name")}
    ${input("startDate", "Start date", "date")}
    ${input("endDate", "End date", "date")}
    <div class="field"><label>Appraisal type</label><select name="type">${["monthly", "quarterly", "biannual", "annual", "probation"].map(type => `<option value="${type}">${type}</option>`).join("")}</select></div>
    <div class="field"><label>Status</label><select name="status">${["open", "closed", "locked"].map(status => `<option value="${status}">${status}</option>`).join("")}</select></div>
    <button type="submit">Add period</button>
  </form>`;
}

function periodCreateModal() {
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal narrow-modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>Add Period</h2><div class="hint">Create a new appraisal period.</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      ${periodForm()}
    </section>
  </div>`;
}

function toolbar(placeholder, filters) {
  return `<div class="toolbar"><input style="max-width:320px" id="search" placeholder="${placeholder}" value="${escapeHtml(state.query)}">${filters.map(f => `<button class="${state.filter === f ? "" : "secondary"}" data-filter="${f}">${f}</button>`).join("")}</div>`;
}

function employeeFilterToolbar() {
  const roleOptions = employeeRoleFilterOptions();
  return `<div class="toolbar">
    ${canManage() ? `<button type="button" data-create-employee>Add Employee</button>` : ""}
    <div class="field inline-filter">
      <label>Search by name</label>
      <input id="employeeNameFilter" placeholder="Type employee name" value="${escapeHtml(state.employeeNameFilter)}">
    </div>
    <div class="field inline-filter">
      <label>Department</label>
      <select id="employeeDepartmentFilter">
        <option value="all" ${state.employeeDepartmentFilter === "all" ? "selected" : ""}>All departments</option>
        ${state.data.departments.map(dept => `<option value="${escapeHtml(dept.name)}" ${state.employeeDepartmentFilter === dept.name ? "selected" : ""}>${escapeHtml(dept.name)}</option>`).join("")}
      </select>
    </div>
    <div class="field inline-filter">
      <label>Role</label>
      <select id="employeeRoleFilter">
        <option value="all" ${state.employeeRoleFilter === "all" ? "selected" : ""}>All roles</option>
        ${roleOptions.map(role => `<option value="${escapeHtml(role.title)}" ${state.employeeRoleFilter === role.title ? "selected" : ""}>${escapeHtml(role.title)}</option>`).join("")}
      </select>
    </div>
  </div>`;
}

function kpiFilterToolbar() {
  const roleOptions = kpiRoleFilterOptions();
  return `<div class="toolbar">
    <div class="field inline-filter">
      <label>Status</label>
      <select id="kpiStatusFilter">
        ${["all", "active", "archived"].map(status => `<option value="${status}" ${state.kpiStatusFilter === status ? "selected" : ""}>${status === "all" ? "All statuses" : status}</option>`).join("")}
      </select>
    </div>
    <div class="field inline-filter">
      <label>Department</label>
      <select id="kpiDepartmentFilter">
        <option value="all" ${state.kpiDepartmentFilter === "all" ? "selected" : ""}>All departments</option>
        ${state.data.departments.map(dept => `<option value="${escapeHtml(dept.name)}" ${state.kpiDepartmentFilter === dept.name ? "selected" : ""}>${escapeHtml(dept.name)}</option>`).join("")}
      </select>
    </div>
    <div class="field inline-filter">
      <label>Job role</label>
      <select id="kpiRoleFilter">
        <option value="all" ${state.kpiRoleFilter === "all" ? "selected" : ""}>All job roles</option>
        ${roleOptions.map(role => `<option value="${escapeHtml(role.title)}" ${state.kpiRoleFilter === role.title ? "selected" : ""}>${escapeHtml(role.title)}</option>`).join("")}
      </select>
    </div>
    <div class="field inline-filter">
      <label>Frequency</label>
      <select id="kpiFrequencyFilter">
        ${["all", "monthly", "quarterly", "biannual", "yearly"].map(freq => `<option value="${freq}" ${state.kpiFrequencyFilter === freq ? "selected" : ""}>${freq === "all" ? "All frequencies" : freq}</option>`).join("")}
      </select>
    </div>
  </div>`;
}

function kpiTable(rows) {
  if (!rows.length) return "<div class='empty'>No KPI records found.</div>";
  return `<div class="table-wrap"><table><thead><tr>
    <th>KPI code</th><th>Title</th><th>Category</th><th>Department</th><th>Job role</th><th>Weight</th><th>Frequency</th><th>Status</th>
  </tr></thead><tbody>${rows.map(kpi => `<tr class="${canManage() ? "clickable-row" : ""}" data-kpi="${kpi.id}">
    <td>${escapeHtml(kpi.code)}</td>
    <td><button class="link-button" type="button">${escapeHtml(kpi.title)}</button></td>
    <td>${escapeHtml(kpi.category)}</td>
    <td>${escapeHtml(kpi.department)}</td>
    <td>${escapeHtml(kpi.jobRole)}</td>
    <td>${escapeHtml(kpi.weight)}</td>
    <td>${escapeHtml(kpi.frequency)}</td>
    <td><span class="badge ${escapeHtml(kpi.status)}">${escapeHtml(kpi.status)}</span></td>
  </tr>`).join("")}</tbody></table></div>`;
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
      <select id="kpiPageSize">
        ${[5, 10, 20].map(size => `<option value="${size}" ${state.kpiPageSize === size ? "selected" : ""}>${size} per page</option>`).join("")}
      </select>
    </div>
  </div>`;
}

function kpiModal(kpi) {
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>Edit KPI record</h2><div class="hint">${escapeHtml(kpi.code)} · ${escapeHtml(kpi.title)}</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      <form id="kpiEditForm" class="form-grid" data-kpi-id="${kpi.id}">
        <div class="field"><label>KPI code</label><input name="code" value="${escapeHtml(kpi.code)}" required></div>
        <div class="field"><label>KPI title</label><input name="title" value="${escapeHtml(kpi.title)}" required></div>
        <div class="field"><label>KPI category</label><select name="category">${kpiCategories().map(item => `<option value="${escapeHtml(item)}" ${kpi.category === item ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}</select></div>
        <div class="field"><label>Department</label><select name="department">${state.data.departments.map(dept => `<option value="${escapeHtml(dept.name)}" ${kpi.department === dept.name ? "selected" : ""}>${escapeHtml(dept.name)}</option>`).join("")}<option value="All" ${kpi.department === "All" ? "selected" : ""}>All</option></select></div>
        <div class="field"><label>Job role</label><select name="jobRole">${state.data.jobRoles.map(role => `<option value="${escapeHtml(role.title)}" ${kpi.jobRole === role.title ? "selected" : ""}>${escapeHtml(role.title)}</option>`).join("")}<option value="All" ${kpi.jobRole === "All" ? "selected" : ""}>All</option></select></div>
        <div class="field"><label>Weight</label><input name="weight" type="number" value="${escapeHtml(kpi.weight)}" required></div>
        <div class="field"><label>Target</label><input name="target" value="${escapeHtml(kpi.target)}" required></div>
        <div class="field"><label>Frequency</label><select name="frequency">${["monthly", "quarterly", "biannual", "yearly"].map(item => `<option value="${item}" ${kpi.frequency === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
        <div class="field"><label>Status</label><select name="status">${["active", "archived"].map(item => `<option value="${item}" ${kpi.status === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
        <div class="field"><label>Measurement formula</label><input name="formula" value="${escapeHtml(kpi.formula || "")}"></div>
        <div class="field"><label>Data source</label><input name="dataSource" value="${escapeHtml(kpi.dataSource || "")}"></div>
        <div class="field full"><label>Description</label><textarea name="description">${escapeHtml(kpi.description || "")}</textarea></div>
        <div class="field full"><label>Scoring guide</label><textarea name="scoringGuide">${escapeHtml(kpi.scoringGuide || "")}</textarea></div>
        <button type="submit">Save KPI</button>
      </form>
    </section>
  </div>`;
}

function templateToolbar(rows) {
  const selected = selectedTemplate(rows);
  return `<div class="toolbar">
    <div class="field inline-filter template-picker">
      <label>KPI template</label>
      <select id="templatePicker">
        ${rows.map(template => `<option value="${template.id}" ${selected?.id === template.id ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}
      </select>
    </div>
    ${canManage() ? `<button type="button" data-create-template>Create New Template</button>${selected ? `<button type="button" class="secondary" data-edit-template="${selected.id}">Edit Template</button>` : ""}` : ""}
  </div>`;
}

function selectedTemplate(rows) {
  if (!rows.length) return null;
  const selected = rows.find(template => template.id === state.selectedTemplateId);
  return selected || rows[0];
}

function templateDetail(template) {
  const total = template.items.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  return `<div class="template-single">
    <div class="topbar">
      <div>
        <h2>${escapeHtml(template.name)}</h2>
        <div class="hint">${escapeHtml(template.department)} · ${escapeHtml(template.jobRole)} · <span class="badge ${template.status}">${escapeHtml(template.status)}</span></div>
      </div>
      <div class="metric"><strong>${total}%</strong> total weight</div>
    </div>
    <div class="progress" title="Total weight"><span style="width:${Math.min(100, total)}%"></span></div>
    ${table(template.items, ["title", "weight"], [])}
  </div>`;
}

function templateModal(template = null) {
  const isEdit = Boolean(template);
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>${isEdit ? "Edit KPI template" : "Create new KPI template"}</h2><div class="hint">Template weights must total 100% before saving.</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      <form id="${isEdit ? "templateEditForm" : "templateCreateForm"}" class="form-grid" ${isEdit ? `data-template-id="${template.id}"` : ""}>
        <div class="field"><label>Template name</label><input name="name" value="${escapeHtml(template?.name || "")}" required></div>
        <div class="field"><label>Department</label><select name="department">${state.data.departments.map(dept => `<option value="${escapeHtml(dept.name)}" ${template?.department === dept.name ? "selected" : ""}>${escapeHtml(dept.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Job role</label><select name="jobRole">${state.data.jobRoles.map(role => `<option value="${escapeHtml(role.title)}" ${template?.jobRole === role.title ? "selected" : ""}>${escapeHtml(role.title)}</option>`).join("")}</select></div>
        <div class="field"><label>Status</label><select name="status">${["draft", "active", "archived"].map(status => `<option value="${status}" ${template?.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
        ${templateKpiPicker(template)}
        <div class="field full"><label>KPI items as title:weight, one per line</label><textarea name="items" required>${escapeHtml(template ? template.items.map(item => `${item.title}:${item.weight}`).join("\n") : "Output achievement:25\nQuality of work:20\nWaste control:15\nAttendance and punctuality:10\nSafety compliance:10\nProcess discipline:10\nTeamwork and attitude:10")}</textarea></div>
        <button type="submit">${isEdit ? "Save template" : "Create template"}</button>
      </form>
    </section>
  </div>`;
}

function templateKpiPicker(template = null) {
  const selectedTitles = new Set((template?.items || []).map(item => item.title));
  const rows = state.data.kpiMaster.filter(kpi => kpi.status !== "archived");
  if (!rows.length) return `<div class="field full"><label>KPI Master records</label><div class="empty">No KPI Master records found.</div></div>`;
  return `<fieldset class="field role-checks full"><legend>KPI Master records</legend>
    ${rows.map(kpi => `<label><input type="checkbox" name="templateKpis" value="${escapeHtml(kpi.id)}" ${selectedTitles.has(kpi.title) ? "checked" : ""}> ${escapeHtml(kpi.code || "")} ${escapeHtml(kpi.title)} - ${escapeHtml(kpi.department)} / ${escapeHtml(kpi.jobRole)} (${escapeHtml(kpi.weight || 0)}%)</label>`).join("")}
  </fieldset>`;
}

function templateItemsFromText(text, prefix = "template-item") {
  return String(text || "").split("\n").map(line => line.trim()).filter(Boolean).map((line, index) => {
    const [title, weight] = line.split(":");
    return { id: `${prefix}-${index + 1}`, title: String(title || "").trim(), weight: Number(weight || 0) };
  });
}

function templateItemsFromForm(form, prefix = "template-item") {
  const data = new FormData(form);
  const selectedKpis = data.getAll("templateKpis");
  if (selectedKpis.length) {
    return selectedKpis.map((id, index) => {
      const kpi = state.data.kpiMaster.find(item => item.id === id);
      return { id: `${prefix}-${index + 1}`, kpiId: id, title: kpi?.title || id, weight: Number(kpi?.weight || 0) };
    });
  }
  return templateItemsFromText(data.get("items"), prefix);
}

function filterRows(rows, fields) {
  return rows.filter(row => {
    const matchesQuery = !state.query || fields.some(field => String(row[field] || "").toLowerCase().includes(state.query.toLowerCase()));
    const matchesFilter = state.filter === "all" || row.status === state.filter;
    return matchesQuery && matchesFilter;
  });
}

function filterEmployees(rows) {
  return rows.filter(employee => {
    const fullName = `${employee.firstName} ${employee.lastName}`.toLowerCase();
    const matchesName = !state.employeeNameFilter || fullName.includes(state.employeeNameFilter.toLowerCase());
    const matchesDepartment = state.employeeDepartmentFilter === "all" || employee.department === state.employeeDepartmentFilter;
    const matchesRole = state.employeeRoleFilter === "all" || employee.jobTitle === state.employeeRoleFilter;
    return matchesName && matchesDepartment && matchesRole;
  });
}

function paginateRows(rows, page, pageSize) {
  return paginateRowsWithState(rows, page, pageSize, "employeePage");
}

function paginateRowsWithState(rows, page, pageSize, pageKey) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  if (page > totalPages) state[pageKey] = totalPages;
  if (state[pageKey] < 1) state[pageKey] = 1;
  const start = (state[pageKey] - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), totalPages };
}

function filterKpis(rows) {
  return rows.filter(kpi => {
    const matchesStatus = state.kpiStatusFilter === "all" || kpi.status === state.kpiStatusFilter;
    const matchesDepartment = state.kpiDepartmentFilter === "all" || kpi.department === state.kpiDepartmentFilter || kpi.department === "All";
    const matchesRole = state.kpiRoleFilter === "all" || kpi.jobRole === state.kpiRoleFilter || kpi.jobRole === "All";
    const matchesFrequency = state.kpiFrequencyFilter === "all" || kpi.frequency === state.kpiFrequencyFilter;
    return matchesStatus && matchesDepartment && matchesRole && matchesFrequency;
  });
}

function employeeRoleFilterOptions() {
  if (state.employeeDepartmentFilter === "all") return state.data.jobRoles;
  return state.data.jobRoles.filter(role => role.department === state.employeeDepartmentFilter);
}

function kpiRoleFilterOptions() {
  if (state.kpiDepartmentFilter === "all") return state.data.jobRoles;
  return state.data.jobRoles.filter(role => role.department === state.kpiDepartmentFilter);
}

function panel(title, body) {
  return `<section class="card"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function table(rows, fields, badgeFields) {
  if (!rows?.length) return "<div class='empty'>No records found.</div>";
  return `<div class="table-wrap"><table><thead><tr>${fields.map(f => `<th>${escapeHtml(f.replace(/([A-Z])/g, " $1"))}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${fields.map(f => {
    const value = row[f];
    return `<td>${badgeFields.includes(f) ? `<span class="badge ${escapeHtml(value)}">${escapeHtml(value)}</span>` : escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function kpiForm() {
  return `<section class="card" style="margin-top:14px"><h2>Add KPI</h2><form id="kpiForm" class="form-grid">
    ${input("code", "KPI code")}${input("title", "KPI title")}
    <div class="field"><label>KPI category</label><select name="category">${kpiCategories().map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}</select></div>
    <div class="field"><label>Department</label><select name="department">${departmentOptions()}</select></div>
    <div class="field"><label>Job role</label><select name="jobRole">${jobRoleOptions()}</select></div>
    ${input("weight", "Weight", "number")}${input("target", "Target")}
    <div class="field"><label>Frequency</label><select name="frequency">${["monthly", "quarterly", "biannual", "annual", "yearly"].map(item => `<option value="${item}">${item}</option>`).join("")}</select></div>
    <div class="field full"><label>Description</label><textarea name="description"></textarea></div>
    <button type="submit">Create KPI</button>
  </form></section>`;
}

function templateForm() {
  return `<section class="card" style="margin-top:14px"><h2>Create KPI Template</h2><form id="templateForm" class="form-grid">
    ${input("name", "Template name")}${input("department", "Department")}${input("jobRole", "Job role")}
    <div class="field full"><label>KPI items as title:weight, one per line</label><textarea name="items">Output achievement:25
Quality of work:20
Waste control:15
Attendance and punctuality:10
Safety compliance:10
Process discipline:10
Teamwork and attitude:10</textarea></div>
    <button type="submit">Create active template</button>
  </form></section>`;
}

function employeeForm() {
  const defaultDepartment = state.data.departments[0]?.name || "Production";
  const nextEmployeeId = generateEmployeeId();
  return `<form id="employeeForm" class="form-grid" novalidate>
    <div class="field"><label>Employee ID</label><input name="employeeId" value="${escapeHtml(nextEmployeeId)}" readonly></div>
    ${input("firstName", "First name")}${input("lastName", "Last name")}${input("email", "Email", "email")}
    <div class="field"><label>Department</label><select name="department">${departmentOptions()}</select></div>
    <div class="field"><label>Job title</label><select name="jobTitle">${jobRoleOptions()}</select></div>
    ${roleCategoryChecks({ roleCategories: ["staff"] })}
    <div class="field"><label>Line manager</label><select name="lineManagerUserId">${lineManagerOptions("", defaultDepartment)}</select></div>
    <div class="field"><label>KPI template</label><select name="templateId"><option value="">Auto assign by job role</option>${state.data.templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Employee status</label><select name="status">${["active", "probation", "confirmed", "exited", "suspended"].map(status => `<option value="${status}">${status}</option>`).join("")}</select></div>
    ${input("phone", "Phone")}${input("workLocation", "Work location")}
    <div class="error full" id="employeeFormError"></div>
    <button type="submit">Create employee</button>
  </form>`;
}

function employeeCreateModal() {
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>Add Employee</h2><div class="hint">Create employee profile and login access.</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      ${employeeForm()}
    </section>
  </div>`;
}

function input(name, label, type = "text") {
  return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" required></div>`;
}

function employeeSelect(name, label, selected = "", category = "all", department = "all") {
  const rows = state.data.employees.filter(employee => {
    const matchesCategory = category === "all" || employeeRoleCategories(employee).includes(category);
    const matchesDepartment = department === "all" || employee.department === department;
    return matchesCategory && matchesDepartment;
  });
  return `<div class="field"><label>${label}</label><select name="${name}">
    <option value="">Not assigned</option>
    ${rows.map(employee => `<option value="${employee.id}" ${selected === employee.id ? "selected" : ""}>${escapeHtml(`${employee.firstName} ${employee.lastName} - ${employee.employeeId} - ${employee.department}`)}</option>`).join("")}
  </select></div>`;
}

function roleCategoryChecks(employee) {
  const selected = employeeRoleCategories(employee);
  return `<fieldset class="field role-checks"><legend>Employee role categories</legend>
    ${["staff", "supervisory", "managerial"].map(role => `<label><input type="checkbox" name="roleCategories" value="${role}" ${selected.includes(role) ? "checked" : ""}> ${role}</label>`).join("")}
  </fieldset>`;
}

function employeeRoleCategories(employee) {
  if (Array.isArray(employee.roleCategories)) return employee.roleCategories.filter(Boolean);
  if (employee.roleCategories) return String(employee.roleCategories).split(",").map(role => role.trim()).filter(Boolean);
  if (employee.roleCategory) return String(employee.roleCategory).split(",").map(role => role.trim()).filter(Boolean);
  return ["staff"];
}

function roleCategoryLabel(employee) {
  return employeeRoleCategories(employee).join(", ");
}

function generateEmployeeId() {
  const maxNumber = state.data.employees.reduce((max, employee) => {
    const match = String(employee.employeeId || "").match(/(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `EMP-${String(maxNumber + 1).padStart(4, "0")}`;
}

function departmentOptions() {
  return state.data.departments.map(dept => `<option value="${escapeHtml(dept.name)}">${escapeHtml(dept.name)}</option>`).join("");
}

function jobRoleOptions() {
  return state.data.jobRoles.map(role => `<option value="${escapeHtml(role.title)}">${escapeHtml(role.title)}</option>`).join("");
}

function kpiCategories() {
  return ["Job-specific performance", "Quality of work", "Productivity", "Timeliness", "Attendance and punctuality", "Safety and compliance", "Teamwork and communication", "Initiative and problem-solving", "Leadership", "Learning and development"];
}

function canManage() {
  return ["SUPER_ADMIN", "HR_ADMIN"].includes(state.user.role);
}

function usersByRole(role) {
  const managerNames = { "u-mgr-1": "Grace Okafor", "u-mgr-2": "Daniel Mensah", "u-mgr-3": "Aisha Bello" };
  return Object.entries(managerNames).map(([id, name]) => ({ id, name })).filter(u => role === "LINE_MANAGER");
}

function userName(id) {
  const employee = state.data.employees.find(item => item.userId === id);
  if (employee) return `${employee.firstName} ${employee.lastName}`;
  return usersByRole("LINE_MANAGER").find(u => u.id === id)?.name || id || "Unassigned";
}

function lineManagerOptions(selected = "", department = "all") {
  const employeeOptions = state.data.employees
    .filter(employee => employee.userId && (department === "all" || employee.department === department))
    .map(employee => ({
      id: employee.userId,
      name: `${employee.firstName} ${employee.lastName}`,
      meta: `${employee.employeeId} - ${employee.department}`
    }));
  const selectedIsVisible = employeeOptions.some(option => option.id === selected);
  const legacyOptions = selected && !selectedIsVisible
    ? usersByRole("LINE_MANAGER").filter(user => selected === user.id).map(user => ({ id: user.id, name: user.name, meta: "current assignment" }))
    : [];
  const options = [...employeeOptions, ...legacyOptions];
  if (!options.length) return `<option value="">No registered employees in selected department</option>`;
  return options.map(option => `<option value="${escapeHtml(option.id)}" ${selected === option.id ? "selected" : ""}>${escapeHtml(`${option.name} - ${option.meta}`)}</option>`).join("");
}

function refreshLineManagerOptions(form) {
  const department = form.querySelector("select[name='department']")?.value || "all";
  const managerSelect = form.querySelector("select[name='lineManagerUserId']");
  if (!managerSelect) return;
  managerSelect.innerHTML = lineManagerOptions("", department);
}

function templateName(id) {
  return state.data.templates.find(t => t.id === id)?.name || "Not assigned";
}

function templateOptionsForEmployee(employee) {
  const matches = state.data.templates.filter(template => template.jobRole === employee.jobTitle && template.status !== "archived");
  return matches.length ? matches : state.data.templates.filter(template => template.status !== "archived");
}

function assignedTemplateForEmployee(employee) {
  if (!employee) return null;
  return state.data.templates.find(template => template.id === employee.templateId)
    || state.data.templates.find(template => template.jobRole === employee.jobTitle && template.status !== "archived")
    || null;
}

function employeeAssignedKpiRows(employee, appraisal = null) {
  if (appraisal?.scores?.length) return appraisal.scores;
  const template = assignedTemplateForEmployee(employee);
  const templateItems = (template?.items || []).map((item, index) => ({
    id: item.id || `template-score-${index + 1}`,
    title: item.title,
    weight: item.weight,
    target: item.target || "Meet or exceed approved target",
    scoringGuide: item.scoringGuide || "Use the approved appraisal guide.",
    employeeComment: "",
    managerConfirmedEmployeeComment: false
  }));
  if (templateItems.length) return templateItems;
  return state.data.kpiMaster.filter(kpi => kpiMatchesEmployee(kpi, employee)).map((kpi, index) => ({
    id: kpi.id || `kpi-score-${index + 1}`,
    title: kpi.title,
    weight: kpi.weight,
    target: kpi.target || "Meet or exceed approved target",
    scoringGuide: kpi.scoringGuide || "Use the approved appraisal guide.",
    employeeComment: "",
    managerConfirmedEmployeeComment: false
  }));
}

function kpiMatchesEmployee(kpi, employee) {
  if (!kpi || !employee) return false;
  const departmentMatch = kpi.department === "All" || kpi.department === employee.department;
  const roleMatch = kpi.jobRole === "All" || kpi.jobRole === employee.jobTitle;
  return kpi.status !== "archived" && departmentMatch && roleMatch;
}

function periodName(id) {
  return state.data.periods.find(period => period.id === id)?.name || id;
}

function employeeName(id) {
  if (!id) return "Not assigned";
  const employee = state.data.employees.find(item => item.id === id);
  return employee ? `${employee.firstName} ${employee.lastName}` : id;
}

function attachHandlers() {
  document.querySelector("#search")?.addEventListener("input", event => {
    state.query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      renderView();
      const search = document.querySelector("#search");
      if (search) {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      }
    }, 120);
  });
  document.querySelector("#periodFilter")?.addEventListener("change", event => {
    state.periodFilter = event.target.value;
    renderView();
  });
  document.querySelector("#employeeNameFilter")?.addEventListener("input", event => {
    state.employeeNameFilter = event.target.value;
    state.employeePage = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      renderView();
      const input = document.querySelector("#employeeNameFilter");
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 120);
  });
  document.querySelector("#employeeDepartmentFilter")?.addEventListener("change", event => {
    state.employeeDepartmentFilter = event.target.value;
    state.employeePage = 1;
    const allowedRoles = employeeRoleFilterOptions().map(role => role.title);
    if (state.employeeRoleFilter !== "all" && !allowedRoles.includes(state.employeeRoleFilter)) {
      state.employeeRoleFilter = "all";
    }
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
  document.querySelector("#kpiStatusFilter")?.addEventListener("change", event => {
    state.kpiStatusFilter = event.target.value;
    state.kpiPage = 1;
    renderView();
  });
  document.querySelector("#kpiDepartmentFilter")?.addEventListener("change", event => {
    state.kpiDepartmentFilter = event.target.value;
    state.kpiPage = 1;
    const allowedRoles = kpiRoleFilterOptions().map(role => role.title);
    if (state.kpiRoleFilter !== "all" && !allowedRoles.includes(state.kpiRoleFilter)) {
      state.kpiRoleFilter = "all";
    }
    renderView();
  });
  document.querySelector("#kpiRoleFilter")?.addEventListener("change", event => {
    state.kpiRoleFilter = event.target.value;
    state.kpiPage = 1;
    renderView();
  });
  document.querySelector("#kpiFrequencyFilter")?.addEventListener("change", event => {
    state.kpiFrequencyFilter = event.target.value;
    state.kpiPage = 1;
    renderView();
  });
  document.querySelectorAll("[data-kpi-page]").forEach(button => button.addEventListener("click", () => {
    state.kpiPage += button.dataset.kpiPage === "next" ? 1 : -1;
    renderView();
  }));
  document.querySelector("#kpiPageSize")?.addEventListener("change", event => {
    state.kpiPageSize = Number(event.target.value);
    state.kpiPage = 1;
    renderView();
  });
  document.querySelector("#templatePicker")?.addEventListener("change", event => {
    state.selectedTemplateId = event.target.value;
    renderView();
  });
  document.querySelector("[data-create-template]")?.addEventListener("click", () => {
    openModal(templateModal());
  });
  document.querySelector("[data-edit-template]")?.addEventListener("click", event => {
    const template = state.data.templates.find(item => item.id === event.currentTarget.dataset.editTemplate);
    if (template) openModal(templateModal(template));
  });
  document.querySelector("[data-training-report]")?.addEventListener("click", () => {
    openModal(trainingReportModal());
  });
  document.querySelector("[data-department-report]")?.addEventListener("click", () => {
    openModal(departmentReportModal());
  });
  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    renderView();
  }));
  document.querySelector("[data-create-department]")?.addEventListener("click", () => openModal(departmentCreateModal()));
  document.querySelector("[data-create-job-role]")?.addEventListener("click", () => openModal(jobRoleCreateModal()));
  document.querySelector("#departmentForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    await api("/api/departments", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) });
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast("Department added");
    renderShell();
  });
  document.querySelectorAll("[data-edit-department]").forEach(button => button.addEventListener("click", () => {
    const dept = state.data.departments.find(item => item.id === button.dataset.editDepartment);
    if (dept) openModal(departmentModal(dept));
  }));
  document.querySelector("#departmentMasterSelect")?.addEventListener("change", event => {
    const dept = state.data.departments.find(item => item.id === event.target.value);
    if (dept) {
      event.target.value = "";
      openModal(departmentModal(dept));
    }
  });
  document.querySelectorAll("[data-edit-role]").forEach(button => button.addEventListener("click", () => {
    const role = state.data.jobRoles.find(item => item.id === button.dataset.editRole);
    if (role) openModal(jobRoleModal(role));
  }));
  document.querySelector("#jobRoleMasterSelect")?.addEventListener("change", event => {
    const role = state.data.jobRoles.find(item => item.id === event.target.value);
    if (role) {
      event.target.value = "";
      openModal(jobRoleModal(role));
    }
  });
  document.querySelector("#jobRoleForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    await api("/api/job-roles", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) });
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast("Job role added");
    renderShell();
  });
  document.querySelector("#kpiForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    await api("/api/kpis", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) });
    state.data = await api("/api/bootstrap");
    toast("KPI created");
    renderShell();
  });
  document.querySelectorAll("[data-kpi]").forEach(row => row.addEventListener("click", () => {
    if (!canManage()) return;
    const kpi = state.data.kpiMaster.find(item => item.id === row.dataset.kpi);
    if (kpi) openModal(kpiModal(kpi));
  }));
  document.querySelector("[data-create-employee]")?.addEventListener("click", () => openModal(employeeCreateModal()));
  bindEmployeeCreateForm();
  bindPeriodCreateForm();
  document.querySelector("[data-create-period]")?.addEventListener("click", () => {
    openModal(periodCreateModal());
    bindPeriodCreateForm();
  });
  document.querySelectorAll("[data-period],[data-edit-period]").forEach(el => el.addEventListener("click", event => {
    event.stopPropagation();
    if (!canManage()) return;
    const periodId = el.dataset.period || el.dataset.editPeriod;
    const period = state.data.periods.find(item => item.id === periodId);
    if (period) openModal(periodModal(period));
  }));
  document.querySelector("#templateForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const items = templateItemsFromForm(event.currentTarget, "new-item");
    await api("/api/templates", { method: "POST", body: { name: form.name, department: form.department, jobRole: form.jobRole, items } });
    state.data = await api("/api/bootstrap");
    toast("Template created");
    renderShell();
  });
  document.querySelectorAll("[data-submit-appraisal],[data-draft-appraisal]").forEach(button => button.addEventListener("click", async () => {
    const id = button.dataset.submitAppraisal || button.dataset.draftAppraisal;
    const appraisal = state.data.appraisals.find(a => a.id === id);
    await api(`/api/appraisals/${id}`, { method: "POST", body: { scores: collectManagerScores(appraisal), submit: Boolean(button.dataset.submitAppraisal) } });
    state.data = await api("/api/bootstrap");
    toast(button.dataset.submitAppraisal ? "Appraisal submitted" : "Draft saved");
    renderShell();
  }));
  document.querySelector("#employeeKpiCommentForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const comments = Array.from(event.currentTarget.querySelectorAll("textarea[name='employeeComment']")).map(input => ({
      scoreId: input.dataset.scoreId,
      title: input.dataset.scoreTitle,
      employeeComment: input.value
    }));
    await api("/api/my-kpi-comments", { method: "POST", body: { periodId: event.currentTarget.dataset.periodId, comments } });
    state.data = await api("/api/bootstrap");
    toast("KPI comments saved");
    renderShell();
  });
  document.querySelectorAll("[data-confirm-comments]").forEach(button => button.addEventListener("click", async () => {
    await api(`/api/appraisals/${button.dataset.confirmComments}`, { method: "POST", body: { confirmEmployeeComments: true } });
    state.data = await api("/api/bootstrap");
    toast("Employee comments confirmed");
    renderShell();
  }));
  document.querySelectorAll("[data-review]").forEach(button => button.addEventListener("click", async () => {
    await api(`/api/appraisals/${button.dataset.review}`, { method: "POST", body: { action: button.dataset.action, hrComment: "Reviewed by HR." } });
    state.data = await api("/api/bootstrap");
    toast(`Appraisal ${button.dataset.action} action completed`);
    renderShell();
  }));
  document.querySelectorAll("[data-ack]").forEach(button => button.addEventListener("click", async () => {
    await api(`/api/acknowledge/${button.dataset.ack}`, { method: "POST" });
    state.data = await api("/api/bootstrap");
    toast("Result acknowledged");
    renderShell();
  }));
  document.querySelectorAll("[data-employee]").forEach(el => el.addEventListener("click", event => {
    event.preventDefault();
    const employee = state.data.employees.find(item => item.id === el.dataset.employee);
    if (employee) openModal(employeeModal(employee));
  }));
  document.querySelectorAll("[data-toggle-appraisal]").forEach(button => button.addEventListener("click", () => {
    const detail = document.querySelector(`#detail-${CSS.escape(button.dataset.toggleAppraisal)}`);
    if (detail) detail.hidden = !detail.hidden;
  }));
  document.querySelectorAll("[data-open-appraisal]").forEach(button => button.addEventListener("click", () => {
    const appraisal = state.data.appraisals.find(item => item.id === button.dataset.openAppraisal);
    if (appraisal) openModal(appraisalModal(appraisal));
  }));
  document.querySelectorAll("[data-score-field='evidenceFile']").forEach(input => input.addEventListener("change", event => {
    const label = event.currentTarget.closest("td")?.querySelector(".evidence-name");
    if (label) label.textContent = event.currentTarget.files?.[0]?.name || "No file attached";
  }));
}

function bindPeriodCreateForm() {
  document.querySelector("#periodForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    await api("/api/periods", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) });
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast("Appraisal period added");
    renderShell();
  });
}

function bindEmployeeCreateForm() {
  document.querySelector("#employeeForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const body = formObject(event.currentTarget);
    body.employeeId = body.employeeId || generateEmployeeId();
    const errorEl = document.querySelector("#employeeFormError");
    const missing = ["firstName", "lastName", "email"].filter(field => !String(body[field] || "").trim());
    if (missing.length) {
      if (errorEl) errorEl.textContent = "Please enter first name, last name, and email.";
      return;
    }
    try {
      await api("/api/employees", { method: "POST", body });
      state.data = await api("/api/bootstrap");
      document.querySelector(".modal-backdrop")?.remove();
      toast("Employee created");
      renderShell();
    } catch (error) {
      if (errorEl) errorEl.textContent = error.message;
      toast(error.message);
    }
  });
  document.querySelector("#employeeForm select[name='department']")?.addEventListener("change", event => {
    refreshLineManagerOptions(event.currentTarget.closest("form"));
  });
}

function openModal(html) {
  document.body.insertAdjacentHTML("beforeend", html);
  document.querySelectorAll("[data-close-modal]").forEach(el => el.addEventListener("click", event => {
    if (event.target === el || event.target.hasAttribute("data-close-modal")) {
      document.querySelector(".modal-backdrop")?.remove();
    }
  }));
  document.querySelector("#employeeEditForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const employeeId = event.currentTarget.dataset.employeeId;
    await api(`/api/employees/${employeeId}`, { method: "PATCH", body: formObject(event.currentTarget) });
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast("Employee master updated");
    renderShell();
  });
  document.querySelector("#employeeEditForm select[name='department']")?.addEventListener("change", event => {
    refreshLineManagerOptions(event.currentTarget.closest("form"));
  });
  document.querySelector("#editDepartmentForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const departmentId = event.currentTarget.dataset.departmentId;
    await api(`/api/departments/${departmentId}`, { method: "PATCH", body: Object.fromEntries(new FormData(event.currentTarget)) });
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast("Department updated");
    renderShell();
  });
  document.querySelector("#editJobRoleForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const roleId = event.currentTarget.dataset.roleId;
    await api(`/api/job-roles/${roleId}`, { method: "PATCH", body: Object.fromEntries(new FormData(event.currentTarget)) });
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast("Job role updated");
    renderShell();
  });
  document.querySelector("#kpiEditForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const kpiId = event.currentTarget.dataset.kpiId;
    await api(`/api/kpis/${kpiId}`, { method: "PATCH", body: Object.fromEntries(new FormData(event.currentTarget)) });
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast("KPI updated");
    renderShell();
  });
  document.querySelector("#templateCreateForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const items = templateItemsFromForm(event.currentTarget, "new-template-item");
    const template = await api("/api/templates", { method: "POST", body: { name: form.name, department: form.department, jobRole: form.jobRole, status: form.status, items } });
    state.selectedTemplateId = template.id;
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast("Template created");
    renderShell();
  });
  document.querySelector("#templateEditForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const items = templateItemsFromForm(event.currentTarget, event.currentTarget.dataset.templateId);
    await api(`/api/templates/${event.currentTarget.dataset.templateId}`, { method: "PATCH", body: { name: form.name, department: form.department, jobRole: form.jobRole, status: form.status, items } });
    state.selectedTemplateId = event.currentTarget.dataset.templateId;
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast("Template updated");
    renderShell();
  });
  document.querySelector("#periodEditForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const periodId = event.currentTarget.dataset.periodId;
    await api(`/api/periods/${periodId}`, { method: "PATCH", body: formObject(event.currentTarget) });
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast("Appraisal period updated");
    renderShell();
  });
  bindAppraisalButtons(document.querySelector(".modal-backdrop"));
  document.querySelectorAll(".modal-backdrop [data-score-field='evidenceFile']").forEach(input => input.addEventListener("change", event => {
    const label = event.currentTarget.closest("td")?.querySelector(".evidence-name");
    if (label) label.textContent = event.currentTarget.files?.[0]?.name || "No file attached";
  }));
  document.querySelector("#trainingReportForm")?.addEventListener("submit", event => {
    event.preventDefault();
    document.querySelector(".modal-backdrop")?.remove();
    toast("Training needs report saved");
  });
  document.querySelector("#departmentReportForm")?.addEventListener("submit", event => {
    event.preventDefault();
    document.querySelector(".modal-backdrop")?.remove();
    toast("Department performance summary saved");
  });
}

function bindAppraisalButtons(root = document) {
  root?.querySelectorAll("[data-submit-appraisal],[data-draft-appraisal]").forEach(button => button.addEventListener("click", async () => {
    const id = button.dataset.submitAppraisal || button.dataset.draftAppraisal;
    const appraisal = state.data.appraisals.find(a => a.id === id);
    await api(`/api/appraisals/${id}`, { method: "POST", body: { scores: collectManagerScores(appraisal), submit: Boolean(button.dataset.submitAppraisal) } });
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast(button.dataset.submitAppraisal ? "Appraisal submitted" : "Draft saved");
    renderShell();
  }));
  root?.querySelectorAll("[data-confirm-comments]").forEach(button => button.addEventListener("click", async () => {
    await api(`/api/appraisals/${button.dataset.confirmComments}`, { method: "POST", body: { confirmEmployeeComments: true } });
    state.data = await api("/api/bootstrap");
    document.querySelector(".modal-backdrop")?.remove();
    toast("Employee comments confirmed");
    renderShell();
  }));
}

function formObject(form) {
  const data = new FormData(form);
  const obj = Object.fromEntries(data);
  const roleCategories = data.getAll("roleCategories");
  if (form.querySelector("[name='roleCategories']")) obj.roleCategories = roleCategories.length ? roleCategories : ["staff"];
  const departments = data.getAll("departments");
  if (form.querySelector("[name='departments']")) obj.departments = departments;
  return obj;
}

function collectManagerScores(appraisal) {
  const form = document.querySelector(`[data-manager-score-form="${CSS.escape(appraisal.id)}"]`);
  if (!form) return appraisal.scores;
  return appraisal.scores.map(score => {
    const row = form.querySelector(`[data-score-row="${CSS.escape(score.id)}"]`);
    if (!row) return score;
    return {
      ...score,
      score: normalizeScoreValue(row.querySelector("[data-score-field='score']")?.value || score.score),
      actualResult: row.querySelector("[data-score-field='actualResult']")?.value || "",
      managerComment: row.querySelector("[data-score-field='managerComment']")?.value || "",
      evidenceNote: row.querySelector("[data-score-field='evidenceFile']")?.files?.[0]?.name || score.evidenceFileName || score.evidenceNote || "",
      evidenceFileName: row.querySelector("[data-score-field='evidenceFile']")?.files?.[0]?.name || score.evidenceFileName || ""
    };
  });
}

function normalizeScoreValue(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 18;
  return Math.min(30, Math.max(1, Math.round(score)));
}

init();
