// Shared modal + form layer: builders for every dialog, the create/edit form
// submit wiring, and the delete flows. Kept together because openModal binds all
// of them generically and pages simply open the relevant modal.

import { state } from "./state.js";
import { api, escapeHtml, toast } from "./api.js";
import { table, input, employeeSelect, roleCategoryChecks } from "./ui.js";
import {
  canManage, departmentOptions, jobRoleOptions, jobRoleOptionsForDepartment, kpiCategories,
  lineManagerOptions, refreshLineManagerOptions, templateOptionsForEmployee, templateName,
  userName, roleCategoryLabel, generateEmployeeId, employeeRecordKey, periodName,
  mergeCreatedRecord, normalizeCreatedEmployee, departmentAssigneeName
} from "./helpers.js";

// Lazily pull in the sibling modules that form a cycle with this one, at call
// time, to avoid touching their exports before they finish initialising.
async function shell() { return import("./shell.js"); }
async function appraisalMod() { return import("./appraisal.js"); }

export function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
}

export function formObject(form) {
  const data = new FormData(form);
  const obj = Object.fromEntries(data);
  if (obj.lineManagerUserId === "nil") obj.lineManagerUserId = "";
  const roleCategories = data.getAll("roleCategories");
  if (form.querySelector("[name='roleCategories']")) obj.roleCategories = roleCategories.length ? roleCategories : ["staff"];
  const departments = data.getAll("departments");
  if (form.querySelector("[name='departments']")) obj.departments = departments;
  return obj;
}

async function refreshAndRender(message) {
  state.data = await api("/api/bootstrap");
  closeModal();
  if (message) toast(message);
  (await shell()).renderShell();
}

// ---------- Builders ----------
export function departmentForm() {
  return `<form id="departmentForm" class="form-grid compact-form">
    ${input("name", "Department name")}
    ${employeeSelect("managerialRole", "Managerial role holder", "", "all")}
    ${employeeSelect("supervisoryRole", "Supervisory role holder", "", "all")}
    <button type="submit">Add department</button>
  </form>`;
}
export function departmentCreateModal() {
  return modalShell("Add Department", "Create a department master record.", departmentForm(), "narrow-modal");
}
export function jobRoleForm() {
  return `<form id="jobRoleForm" class="form-grid compact-form">
    <div class="field"><label>Role title</label><input name="title" required></div>
    <div class="field"><label>Department</label><select name="department">${departmentOptions()}</select></div>
    <div class="field"><label>Status</label><select name="status">${["active", "archived"].map(s => `<option value="${s}">${s}</option>`).join("")}</select></div>
    <button type="submit">Add job role</button>
  </form>`;
}
export function jobRoleCreateModal() {
  return modalShell("Add Job Role", "Create a job role and link it to a department.", jobRoleForm(), "narrow-modal");
}
export function departmentModal(dept) {
  return modalShell("Edit department", escapeHtml(dept.name), `
    <form id="editDepartmentForm" class="form-grid" data-department-id="${dept.id}">
      <div class="field"><label>Department name</label><input name="name" value="${escapeHtml(dept.name)}" required></div>
      ${employeeSelect("managerialRole", "Managerial role holder", dept.managerialRole, "all", dept.name)}
      ${employeeSelect("supervisoryRole", "Supervisory role holder", dept.supervisoryRole, "all", dept.name)}
      <div class="field"><label>Status</label><select name="status">${["active", "archived"].map(s => `<option value="${s}" ${dept.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <button type="submit">Save department</button>
    </form>`, "narrow-modal");
}
export function departmentDetailModal(dept) {
  return modalShell("Department details", escapeHtml(dept.name), `
    <div class="table-wrap"><table><thead><tr>
      <th>Department name</th><th>Managerial role holder</th><th>Supervisory role holder</th><th>Status</th><th>Action</th>
    </tr></thead><tbody><tr>
      <td>${escapeHtml(dept.name)}</td>
      <td>${escapeHtml(dept.managerialRoleName || departmentAssigneeName(dept.managerialRole, dept.name, "managerial"))}</td>
      <td>${escapeHtml(dept.supervisoryRoleName || departmentAssigneeName(dept.supervisoryRole, dept.name, "supervisory"))}</td>
      <td><span class="badge ${escapeHtml(dept.status)}">${escapeHtml(dept.status)}</span></td>
      <td>${canManage() ? `<button type="button" data-edit-department-detail="${escapeHtml(dept.id)}">Edit</button>` : ""}</td>
    </tr></tbody></table></div>`);
}
export function jobRoleModal(role) {
  return modalShell("Edit job role", escapeHtml(role.title), `
    <form id="editJobRoleForm" class="form-grid" data-role-id="${role.id}">
      <div class="field"><label>Role title</label><input name="title" value="${escapeHtml(role.title)}" required></div>
      <div class="field"><label>Department</label><select name="department">${state.data.departments.map(d => `<option value="${escapeHtml(d.name)}" ${role.department === d.name ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Status</label><select name="status">${["active", "archived"].map(s => `<option value="${s}" ${role.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <button type="submit">Save role</button>
    </form>`, "narrow-modal");
}
export function kpiForm() {
  const selectedDepartment = state.data.departments[0]?.name || "";
  return `<form id="kpiForm" class="form-grid">
    ${input("code", "KPI code")}${input("title", "KPI title")}
    <div class="field"><label>KPI category</label><select name="category">${kpiCategories().map(i => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join("")}</select></div>
    <div class="field"><label>Department</label><select name="department" data-kpi-department>${departmentOptions()}</select></div>
    <div class="field"><label>Job role</label><select name="jobRole" data-kpi-job-role>${jobRoleOptionsForDepartment(selectedDepartment)}</select></div>
    ${input("weight", "Weight", "number")}${input("target", "Target")}
    <div class="field"><label>Frequency</label><select name="frequency">${["monthly", "quarterly", "biannual", "annual", "yearly"].map(i => `<option value="${i}">${i}</option>`).join("")}</select></div>
    <div class="field full"><label>Description</label><textarea name="description"></textarea></div>
    <div class="error full" id="kpiFormError"></div>
    <button type="submit" data-create-kpi-submit>Create KPI</button>
  </form>`;
}
export function kpiCreateModal() {
  return modalShell("Add KPI", "Create KPI records by department and job role.", kpiForm());
}
export function kpiModal(kpi) {
  return modalShell("Edit KPI record", `${escapeHtml(kpi.code)} · ${escapeHtml(kpi.title)}`, `
    <form id="kpiEditForm" class="form-grid" data-kpi-id="${kpi.id}">
      <div class="field"><label>KPI code</label><input name="code" value="${escapeHtml(kpi.code)}" required></div>
      <div class="field"><label>KPI title</label><input name="title" value="${escapeHtml(kpi.title)}" required></div>
      <div class="field"><label>KPI category</label><select name="category">${kpiCategories().map(i => `<option value="${escapeHtml(i)}" ${kpi.category === i ? "selected" : ""}>${escapeHtml(i)}</option>`).join("")}</select></div>
      <div class="field"><label>Department</label><select name="department">${state.data.departments.map(d => `<option value="${escapeHtml(d.name)}" ${kpi.department === d.name ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}<option value="All" ${kpi.department === "All" ? "selected" : ""}>All</option></select></div>
      <div class="field"><label>Job role</label><select name="jobRole">${state.data.jobRoles.map(r => `<option value="${escapeHtml(r.title)}" ${kpi.jobRole === r.title ? "selected" : ""}>${escapeHtml(r.title)}</option>`).join("")}<option value="All" ${kpi.jobRole === "All" ? "selected" : ""}>All</option></select></div>
      <div class="field"><label>Weight</label><input name="weight" type="number" value="${escapeHtml(kpi.weight)}" required></div>
      <div class="field"><label>Target</label><input name="target" value="${escapeHtml(kpi.target)}" required></div>
      <div class="field"><label>Frequency</label><select name="frequency">${["monthly", "quarterly", "biannual", "yearly"].map(i => `<option value="${i}" ${kpi.frequency === i ? "selected" : ""}>${i}</option>`).join("")}</select></div>
      <div class="field"><label>Status</label><select name="status">${["active", "archived"].map(i => `<option value="${i}" ${kpi.status === i ? "selected" : ""}>${i}</option>`).join("")}</select></div>
      <div class="field"><label>Measurement formula</label><input name="formula" value="${escapeHtml(kpi.formula || "")}"></div>
      <div class="field"><label>Data source</label><input name="dataSource" value="${escapeHtml(kpi.dataSource || "")}"></div>
      <div class="field full"><label>Description</label><textarea name="description">${escapeHtml(kpi.description || "")}</textarea></div>
      <div class="field full"><label>Scoring guide</label><textarea name="scoringGuide">${escapeHtml(kpi.scoringGuide || "")}</textarea></div>
      <button type="submit">Save KPI</button>
    </form>`);
}
export function employeeForm() {
  const defaultDepartment = state.data.departments[0]?.name || "Production";
  return `<form id="employeeForm" class="form-grid" novalidate>
    <div class="field"><label>Employee ID</label><input name="employeeId" value="${escapeHtml(generateEmployeeId())}" readonly></div>
    ${input("firstName", "First name")}${input("lastName", "Last name")}${input("email", "Email", "email")}
    <div class="field"><label>Department</label><select name="department">${departmentOptions()}</select></div>
    <div class="field"><label>Job title</label><select name="jobTitle">${jobRoleOptions()}</select></div>
    ${roleCategoryChecks({ roleCategories: ["staff"] })}
    <div class="field"><label>Line manager</label><select name="lineManagerUserId">${lineManagerOptions("", defaultDepartment)}</select></div>
    <div class="field"><label>KPI template</label><select name="templateId"><option value="">Auto assign by job role</option>${state.data.templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Employee status</label><select name="status">${["active", "probation", "confirmed", "exited", "suspended"].map(s => `<option value="${s}">${s}</option>`).join("")}</select></div>
    ${input("phone", "Phone")}${input("workLocation", "Work location")}
    <div class="error full" id="employeeFormError"></div>
    <button type="submit">Create employee</button>
  </form>`;
}
export function employeeCreateModal() {
  return modalShell("Add Employee", "Create employee profile and login access.", employeeForm());
}
export function employeeEditForm(employee) {
  return `<section class="card edit-section">
    <h3>Edit employee master</h3>
    <form id="employeeEditForm" class="form-grid" data-employee-id="${escapeHtml(employeeRecordKey(employee))}">
      <div class="field"><label>Employee ID</label><input name="employeeId" value="${escapeHtml(employee.employeeId)}" required></div>
      <div class="field"><label>First name</label><input name="firstName" value="${escapeHtml(employee.firstName)}" required></div>
      <div class="field"><label>Last name</label><input name="lastName" value="${escapeHtml(employee.lastName)}" required></div>
      <div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(employee.email)}" required></div>
      <div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(employee.phone || "")}"></div>
      <div class="field"><label>Department</label><select name="department">${state.data.departments.map(d => `<option value="${escapeHtml(d.name)}" ${employee.department === d.name ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Job role</label><select name="jobTitle">${state.data.jobRoles.map(r => `<option value="${escapeHtml(r.title)}" ${employee.jobTitle === r.title ? "selected" : ""}>${escapeHtml(r.title)}</option>`).join("")}</select></div>
      <div class="field"><label>Line manager</label><select name="lineManagerUserId">${lineManagerOptions(employee.lineManagerUserId, employee.department)}</select></div>
      <div class="field"><label>KPI template</label><select name="templateId"><option value="">Not assigned</option>${templateOptionsForEmployee(employee).map(t => `<option value="${t.id}" ${employee.templateId === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Employment type</label><input name="employmentType" value="${escapeHtml(employee.employmentType || "Full time")}"></div>
      <div class="field"><label>Date of employment</label><input name="dateOfEmployment" type="date" value="${escapeHtml(employee.dateOfEmployment || "")}"></div>
      <div class="field"><label>Confirmation status</label><select name="confirmationStatus">${["probation", "confirmed", "not confirmed"].map(s => `<option value="${s}" ${employee.confirmationStatus === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Work location</label><input name="workLocation" value="${escapeHtml(employee.workLocation || "")}"></div>
      <div class="field"><label>Employee status</label><select name="status">${["active", "probation", "confirmed", "exited", "suspended"].map(s => `<option value="${s}" ${employee.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>User account status</label><select name="userAccountStatus">${["active", "inactive", "suspended"].map(s => `<option value="${s}" ${employee.userAccountStatus === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      ${roleCategoryChecks(employee)}
      <div class="field full"><label>Emergency contact</label><input name="emergencyContact" value="${escapeHtml(employee.emergencyContact || "")}"></div>
      <div class="field full"><label>Notes</label><textarea name="notes">${escapeHtml(employee.notes || "")}</textarea></div>
      <button type="submit">Save employee</button>
    </form>
  </section>`;
}
export function employeeModal(employee) {
  const history = state.data.appraisals
    .filter(a => employeeRecordKey(a.employee) === employeeRecordKey(employee) && a.status !== "Not Started")
    .sort((a, b) => String(b.periodId).localeCompare(String(a.periodId)))
    .slice(0, 6);
  return modalShell(escapeHtml(`${employee.firstName} ${employee.lastName}`), `${escapeHtml(employee.employeeId)} · ${escapeHtml(employee.department)} · ${escapeHtml(employee.jobTitle)}`, `
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
    ${table(history.map(a => ({ period: periodName(a.periodId), status: a.status, finalScore: a.finalScore, rating: a.rating })), ["period", "status", "finalScore", "rating"], ["status"])}`);
}
export function periodForm() {
  return `<form id="periodForm" class="form-grid compact-form">
    ${input("name", "Period name")}${input("startDate", "Start date", "date")}${input("endDate", "End date", "date")}
    <div class="field"><label>Appraisal type</label><select name="type">${["monthly", "quarterly", "biannual", "annual", "probation"].map(t => `<option value="${t}">${t}</option>`).join("")}</select></div>
    <div class="field"><label>Status</label><select name="status">${["open", "closed", "locked"].map(s => `<option value="${s}">${s}</option>`).join("")}</select></div>
    <button type="submit">Add period</button>
  </form>`;
}
export function periodCreateModal() {
  return modalShell("Add Period", "Create a new appraisal period.", periodForm(), "narrow-modal");
}
export function periodModal(period) {
  const selectedDepartments = period.departments || [];
  return modalShell("Edit appraisal period", escapeHtml(period.name), `
    <form id="periodEditForm" class="form-grid" data-period-id="${period.id}">
      <div class="field"><label>Period name</label><input name="name" value="${escapeHtml(period.name)}" required></div>
      <div class="field"><label>Start date</label><input name="startDate" type="date" value="${escapeHtml(period.startDate)}" required></div>
      <div class="field"><label>End date</label><input name="endDate" type="date" value="${escapeHtml(period.endDate)}" required></div>
      <div class="field"><label>Appraisal type</label><select name="type">${["monthly", "quarterly", "biannual", "annual", "probation"].map(t => `<option value="${t}" ${period.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label>Status</label><select name="status">${["open", "closed", "locked"].map(s => `<option value="${s}" ${period.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <fieldset class="field role-checks full"><legend>Departments included</legend>
        ${state.data.departments.map(d => `<label><input type="checkbox" name="departments" value="${escapeHtml(d.name)}" ${selectedDepartments.includes(d.name) ? "checked" : ""}> ${escapeHtml(d.name)}</label>`).join("")}
      </fieldset>
      <button type="submit">Save period</button>
    </form>`);
}
export function templateModal(template = null) {
  const isEdit = Boolean(template);
  return modalShell(isEdit ? "Edit KPI template" : "Create new KPI template", "Template weights must total 100% before saving.", `
    <form id="${isEdit ? "templateEditForm" : "templateCreateForm"}" class="form-grid" ${isEdit ? `data-template-id="${template.id}"` : ""}>
      <div class="field"><label>Template name</label><input name="name" value="${escapeHtml(template?.name || "")}" required></div>
      <div class="field"><label>Department</label><select name="department">${state.data.departments.map(d => `<option value="${escapeHtml(d.name)}" ${template?.department === d.name ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Job role</label><select name="jobRole">${state.data.jobRoles.map(r => `<option value="${escapeHtml(r.title)}" ${template?.jobRole === r.title ? "selected" : ""}>${escapeHtml(r.title)}</option>`).join("")}</select></div>
      <div class="field"><label>Status</label><select name="status">${["draft", "active", "archived"].map(s => `<option value="${s}" ${template?.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      ${templateKpiPicker(template)}
      <div class="field full"><label>KPI items as title:weight, one per line</label><textarea name="items" required>${escapeHtml(template ? template.items.map(i => `${i.title}:${i.weight}`).join("\n") : "Output achievement:25\nQuality of work:20\nWaste control:15\nAttendance and punctuality:10\nSafety compliance:10\nProcess discipline:10\nTeamwork and attitude:10")}</textarea></div>
      <button type="submit">${isEdit ? "Save template" : "Create template"}</button>
    </form>`);
}
export function templateKpiPicker(template = null) {
  const selectedTitles = new Set((template?.items || []).map(i => i.title));
  const rows = state.data.kpiMaster.filter(kpi => kpi.status !== "archived");
  if (!rows.length) return `<div class="field full"><label>KPI Master records</label><div class="empty">No KPI Master records found.</div></div>`;
  return `<fieldset class="field role-checks full"><legend>KPI Master records</legend>
    ${rows.map(kpi => `<label><input type="checkbox" name="templateKpis" value="${escapeHtml(kpi.id)}" ${selectedTitles.has(kpi.title) ? "checked" : ""}> ${escapeHtml(kpi.code || "")} ${escapeHtml(kpi.title)} - ${escapeHtml(kpi.department)} / ${escapeHtml(kpi.jobRole)} (${escapeHtml(kpi.weight || 0)}%)</label>`).join("")}
  </fieldset>`;
}
export function templateItemsFromText(text, prefix = "template-item") {
  return String(text || "").split("\n").map(l => l.trim()).filter(Boolean).map((line, index) => {
    const [title, weight] = line.split(":");
    return { id: `${prefix}-${index + 1}`, title: String(title || "").trim(), weight: Number(weight || 0) };
  });
}
export function templateItemsFromForm(form, prefix = "template-item") {
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
export function departmentReportModal() {
  return modalShell("Department Performance Summary", "Review department averages and save the report snapshot.", `
    ${table(state.data.reports.byDepartment || [], ["department", "appraisals", "average"], [])}
    <form id="departmentReportForm" class="form-grid compact-form">
      <div class="field full"><label>Report note</label><textarea name="note">Department performance summary reviewed by HR.</textarea></div>
      <button type="submit">Save report</button>
    </form>`);
}
export function trainingReportModal() {
  return modalShell("Training Needs Report", "Review recommendations and save the report snapshot.", `
    ${table(state.data.reports.trainingNeeds || [], ["employee", "recommendation"], [])}
    <form id="trainingReportForm" class="form-grid compact-form">
      <div class="field full"><label>Report note</label><textarea name="note">Training needs reviewed by HR.</textarea></div>
      <button type="submit">Save report</button>
    </form>`);
}
export function onboardingVideoModal() {
  return modalShell("Onboarding Demo Video", "ForgeHR appraisal workflow walkthrough.", `
    <div class="onboarding-video-player">
      <object data="./assets/onboarding-demo.svg?v=play" type="image/svg+xml" aria-label="ForgeHR onboarding demo video">
        <img src="./assets/onboarding-demo.svg?v=play" alt="ForgeHR onboarding demo video">
      </object>
    </div>`);
}

function modalShell(title, hint, body, extraClass = "") {
  return `<div class="modal-backdrop" data-close-modal>
    <section class="modal ${extraClass}" role="dialog" aria-modal="true">
      <div class="topbar">
        <div><h2>${title}</h2><div class="hint">${hint}</div></div>
        <button class="secondary" data-close-modal type="button">Close</button>
      </div>
      ${body}
    </section>
  </div>`;
}

// ---------- Create-form binders ----------
export function bindDepartmentCreateForm() {
  bindOnce("#departmentForm", form => form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const created = await api("/api/departments", { method: "POST", body: Object.fromEntries(new FormData(form)) });
      state.data = await api("/api/bootstrap");
      mergeCreatedRecord("departments", created, (i, r) => i.id === r.id || i.name === r.name);
      await refreshAndRender("Department added");
    } catch (error) { toast(error.message); }
  }));
}
export function bindJobRoleCreateForm() {
  bindOnce("#jobRoleForm", form => form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const created = await api("/api/job-roles", { method: "POST", body: Object.fromEntries(new FormData(form)) });
      state.data = await api("/api/bootstrap");
      mergeCreatedRecord("jobRoles", created, (i, r) => i.id === r.id || (i.title === r.title && i.department === r.department));
      await refreshAndRender("Job role added");
    } catch (error) { toast(error.message); }
  }));
}
export function bindPeriodCreateForm() {
  bindOnce("#periodForm", form => form.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await api("/api/periods", { method: "POST", body: Object.fromEntries(new FormData(form)) });
      await refreshAndRender("Appraisal period added");
    } catch (error) { toast(error.message); }
  }));
}
export function bindKpiCreateForm() {
  bindOnce("#kpiForm", form => {
    form.querySelector("[data-kpi-department]")?.addEventListener("change", event => {
      const roleSelect = form.querySelector("[data-kpi-job-role]");
      if (roleSelect) roleSelect.innerHTML = jobRoleOptionsForDepartment(event.currentTarget.value);
    });
    const submit = e => { e.preventDefault(); saveKpiCreateForm(form); };
    form.querySelector("[data-create-kpi-submit]")?.addEventListener("click", submit);
    form.addEventListener("submit", submit);
  });
}
async function saveKpiCreateForm(form) {
  const errorEl = form.querySelector("#kpiFormError");
  const body = Object.fromEntries(new FormData(form));
  const missing = ["code", "title", "category", "department", "jobRole", "weight", "target", "frequency"].filter(f => !String(body[f] || "").trim());
  if (missing.length) { if (errorEl) errorEl.textContent = "Please complete all KPI fields, including job role."; return; }
  try {
    const created = await api("/api/kpis", { method: "POST", body });
    state.data = await api("/api/bootstrap");
    mergeCreatedRecord("kpiMaster", created, (i, r) => i.id === r.id || i.code === r.code);
    await refreshAndRender("KPI created");
  } catch (error) { if (errorEl) errorEl.textContent = error.message; toast(error.message); }
}
export function bindEmployeeCreateForm() {
  bindOnce("#employeeForm", form => {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const body = formObject(form);
      body.employeeId = body.employeeId || generateEmployeeId();
      const errorEl = document.querySelector("#employeeFormError");
      const missing = ["firstName", "lastName", "email"].filter(f => !String(body[f] || "").trim());
      if (missing.length) { if (errorEl) errorEl.textContent = "Please enter first name, last name, and email."; return; }
      try {
        const created = normalizeCreatedEmployee(await api("/api/employees", { method: "POST", body }), body);
        state.data = await api("/api/bootstrap");
        mergeCreatedRecord("employees", created, (i, r) => i.id === r.id || i.employeeId === r.employeeId || i.email === r.email);
        Object.assign(state, { employeeNameFilter: "", employeeDepartmentFilter: "all", employeeRoleFilter: "all", employeePage: 1, view: "employees" });
        await refreshAndRender("Employee created");
      } catch (error) { if (errorEl) errorEl.textContent = error.message; toast(error.message); }
    });
    form.querySelector("select[name='department']")?.addEventListener("change", event => refreshLineManagerOptions(event.currentTarget.closest("form")));
  });
}

export async function deleteKpiRecord(kpiId) {
  const kpi = state.data.kpiMaster.find(i => i.id === kpiId);
  if (!kpi) { toast("KPI record not found"); return; }
  if (!window.confirm(`Delete KPI "${kpi.title}"?`)) return;
  try {
    await api(`/api/kpis/${kpi.id}`, { method: "PATCH", body: { action: "delete" } });
    await refreshAndRender("KPI deleted");
  } catch (error) { toast(error.message); }
}
export async function deleteDepartmentRecord(departmentId) {
  const department = state.data.departments.find(i => i.id === departmentId || i.name === departmentId);
  if (!department) { toast("Department record not found"); return; }
  if (!window.confirm(`Delete department "${department.name}"?`)) return;
  try {
    await api(`/api/departments/${encodeURIComponent(department.id || department.name)}`, { method: "PATCH", body: { action: "delete", name: department.name } });
    await refreshAndRender("Department deleted");
  } catch (error) { toast(error.message); }
}

function bindOnce(selector, setup) {
  const form = document.querySelector(selector);
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";
  setup(form);
}

// ---------- openModal: insert + wire all dialog handlers ----------
export async function openModal(html) {
  document.body.insertAdjacentHTML("beforeend", html);
  document.querySelectorAll("[data-close-modal]").forEach(el => el.addEventListener("click", event => {
    if (event.target === el || event.target.hasAttribute("data-close-modal")) closeModal();
  }));
  bindKpiCreateForm();
  bindEmployeeCreateForm();
  document.querySelector("[data-edit-department-detail]")?.addEventListener("click", event => {
    const dept = state.data.departments.find(i => i.id === event.currentTarget.dataset.editDepartmentDetail);
    if (!dept) return;
    closeModal();
    openModal(departmentModal(dept));
  });
  bindSubmit("#employeeEditForm", async form => { await api(`/api/employees/${form.dataset.employeeId}`, { method: "PATCH", body: formObject(form) }); await refreshAndRender("Employee master updated"); });
  document.querySelector("#employeeEditForm select[name='department']")?.addEventListener("change", event => refreshLineManagerOptions(event.currentTarget.closest("form")));
  bindSubmit("#editDepartmentForm", async form => { await api(`/api/departments/${form.dataset.departmentId}`, { method: "PATCH", body: Object.fromEntries(new FormData(form)) }); await refreshAndRender("Department updated"); });
  bindSubmit("#editJobRoleForm", async form => { await api(`/api/job-roles/${form.dataset.roleId}`, { method: "PATCH", body: Object.fromEntries(new FormData(form)) }); await refreshAndRender("Job role updated"); });
  bindSubmit("#kpiEditForm", async form => { await api(`/api/kpis/${form.dataset.kpiId}`, { method: "PATCH", body: Object.fromEntries(new FormData(form)) }); await refreshAndRender("KPI updated"); });
  bindSubmit("#templateCreateForm", async form => {
    const values = Object.fromEntries(new FormData(form));
    const items = templateItemsFromForm(form, "new-template-item");
    const template = await api("/api/templates", { method: "POST", body: { name: values.name, department: values.department, jobRole: values.jobRole, status: values.status, items } });
    state.selectedTemplateId = template.id;
    await refreshAndRender("Template created");
  });
  bindSubmit("#templateEditForm", async form => {
    const values = Object.fromEntries(new FormData(form));
    const items = templateItemsFromForm(form, form.dataset.templateId);
    await api(`/api/templates/${form.dataset.templateId}`, { method: "PATCH", body: { name: values.name, department: values.department, jobRole: values.jobRole, status: values.status, items } });
    state.selectedTemplateId = form.dataset.templateId;
    await refreshAndRender("Template updated");
  });
  bindSubmit("#periodEditForm", async form => { await api(`/api/periods/${form.dataset.periodId}`, { method: "PATCH", body: formObject(form) }); await refreshAndRender("Appraisal period updated"); });
  (await appraisalMod()).attachAppraisalHandlers(document.querySelector(".modal-backdrop"));
  bindSubmit("#trainingReportForm", async () => { closeModal(); toast("Training needs report saved"); });
  bindSubmit("#departmentReportForm", async () => { closeModal(); toast("Department performance summary saved"); });
}

function bindSubmit(selector, handler) {
  document.querySelector(selector)?.addEventListener("submit", async event => {
    event.preventDefault();
    try { await handler(event.currentTarget); } catch (error) { toast(error.message); }
  });
}
