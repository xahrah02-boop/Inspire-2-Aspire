// Shared, page-agnostic helpers: identity/lookup keys, option builders, filters,
// pagination, and the manager/assigned-staff derivations used across pages.

import { state } from "./state.js";
import { escapeHtml } from "./api.js";

export function canManage() {
  return ["SUPER_ADMIN", "HR_ADMIN"].includes(state.user.role);
}

export function employeeRecordKey(employee) {
  return employee?.id || employee?.employeeId || employee?.userId || employee?.email || "";
}

export function employeeRoleCategories(employee) {
  if (Array.isArray(employee.roleCategories)) return employee.roleCategories.filter(Boolean);
  if (employee.roleCategories) return String(employee.roleCategories).split(",").map(r => r.trim()).filter(Boolean);
  if (employee.roleCategory) return String(employee.roleCategory).split(",").map(r => r.trim()).filter(Boolean);
  return ["staff"];
}

export function roleCategoryLabel(employee) {
  return employeeRoleCategories(employee).join(", ");
}

export function employeeLookupKeys(employee) {
  if (!employee) return [];
  const fullName = `${employee.firstName || ""} ${employee.lastName || ""}`.trim();
  const keys = [employee.id, employee.employeeId, employee.userId, employee.email, fullName, employeeRecordKey(employee)].filter(Boolean).map(String);
  const employeeId = String(employee?.employeeId || employee?.id || "");
  const numeric = employeeId.match(/(\d+)$/)?.[1];
  if (numeric) {
    const compact = String(Number(numeric));
    const isManager = /^MGR-/i.test(employeeId) || employeeRoleCategories(employee).includes("managerial");
    if (isManager) {
      keys.push(`emp-mgr-${compact}`, `emp-mgr-${numeric}`, `MGR-${compact}`, `MGR-${numeric}`, `MGR-${numeric.padStart(3, "0")}`, `MGR-${numeric.padStart(4, "0")}`);
    } else {
      keys.push(`emp-${compact}`, `emp-${numeric}`, `emp-${numeric.padStart(3, "0")}`, `EMP-${compact}`, `EMP-${numeric}`, `EMP-${numeric.padStart(3, "0")}`, `EMP-${numeric.padStart(4, "0")}`);
    }
  }
  return [...new Set(keys.flatMap(key => [key, key.toLowerCase(), key.toUpperCase()]))];
}

export function usersByRole(role) {
  const managerNames = { "u-mgr-1": "Grace Okafor", "u-mgr-2": "Daniel Mensah", "u-mgr-3": "Aisha Bello" };
  return Object.entries(managerNames).map(([id, name]) => ({ id, name })).filter(() => role === "LINE_MANAGER");
}

export function userName(id) {
  const employee = state.data.employees.find(item => item.userId === id);
  if (employee) return `${employee.firstName} ${employee.lastName}`;
  return usersByRole("LINE_MANAGER").find(u => u.id === id)?.name || id || "Unassigned";
}

export function periodName(id) {
  return state.data.periods.find(period => period.id === id)?.name || id;
}

export function looksLikeRawId(value) {
  return /\b(emp|emp-mgr|mgr|u-mgr|u-emp|user|dept|role)[-_]?\w+/i.test(String(value || ""));
}

export function employeeName(id) {
  if (!id) return "Not assigned";
  const key = String(id).trim();
  const keyParts = key.split(/\s+-\s+|[,|]/).map(part => part.trim()).filter(Boolean);
  const possibleKeys = [key, key.toLowerCase(), key.toUpperCase(), ...keyParts, ...keyParts.map(p => p.toLowerCase()), ...keyParts.map(p => p.toUpperCase())];
  const employee = state.data.employees.find(item => {
    const lookupKeys = employeeLookupKeys(item);
    return possibleKeys.some(possibleKey => lookupKeys.includes(possibleKey));
  });
  if (employee) return `${employee.firstName} ${employee.lastName}`;
  const managerNumber = key.match(/^emp-mgr-(\d+)$/i)?.[1];
  const mappedUserId = managerNumber ? `u-mgr-${Number(managerNumber)}` : "";
  const user = (state.data.userList || []).find(item =>
    [item.id, item.email, item.name].filter(Boolean).map(String).some(value =>
      possibleKeys.includes(value) || possibleKeys.includes(value.toLowerCase()) || value === mappedUserId));
  if (user) return user.name;
  return looksLikeRawId(key) || /\b[A-Z]{2,5}-?\d+\b/i.test(key) ? "Employee not found" : key;
}

export function departmentAssigneeName(value, departmentName, roleCategory) {
  const resolved = employeeName(value);
  if (resolved && !looksLikeRawId(resolved) && resolved !== "Employee not found") return resolved;
  const departmentEmployees = state.data.employees.filter(e => e.department === departmentName);
  const categoryMatch = departmentEmployees.find(e => employeeRoleCategories(e).includes(roleCategory));
  if (categoryMatch) return `${categoryMatch.firstName} ${categoryMatch.lastName}`;
  const titleWord = roleCategory === "managerial" ? "manager" : "supervisor";
  const titleMatch = departmentEmployees.find(e => String(e.jobTitle || "").toLowerCase().includes(titleWord));
  if (titleMatch) return `${titleMatch.firstName} ${titleMatch.lastName}`;
  return value ? "Employee not found" : "Not assigned";
}

export function templateName(id) {
  return state.data.templates.find(t => t.id === id)?.name || "Not assigned";
}

export function templateOptionsForEmployee(employee) {
  const matches = state.data.templates.filter(t => t.jobRole === employee.jobTitle && t.status !== "archived");
  return matches.length ? matches : state.data.templates.filter(t => t.status !== "archived");
}

export function assignedTemplateForEmployee(employee) {
  if (!employee) return null;
  return state.data.templates.find(t => t.id === employee.templateId)
    || state.data.templates.find(t => t.jobRole === employee.jobTitle && t.status !== "archived")
    || null;
}

export function kpiMatchesEmployee(kpi, employee) {
  if (!kpi || !employee) return false;
  const departmentMatch = kpi.department === "All" || kpi.department === employee.department;
  const roleMatch = kpi.jobRole === "All" || kpi.jobRole === employee.jobTitle;
  return kpi.status !== "archived" && departmentMatch && roleMatch;
}

export function employeeAssignedKpiRows(employee, appraisal = null) {
  if (appraisal?.scores?.length) return appraisal.scores;
  const template = assignedTemplateForEmployee(employee);
  const templateItems = (template?.items || []).map((item, index) => ({
    id: item.id || `template-score-${index + 1}`,
    title: item.title, weight: item.weight,
    target: item.target || "Meet or exceed approved target",
    scoringGuide: item.scoringGuide || "Use the approved appraisal guide.",
    employeeComment: "", managerConfirmedEmployeeComment: false
  }));
  if (templateItems.length) return templateItems;
  return state.data.kpiMaster.filter(kpi => kpiMatchesEmployee(kpi, employee)).map((kpi, index) => ({
    id: kpi.id || `kpi-score-${index + 1}`,
    title: kpi.title, weight: kpi.weight,
    target: kpi.target || "Meet or exceed approved target",
    scoringGuide: kpi.scoringGuide || "Use the approved appraisal guide.",
    employeeComment: "", managerConfirmedEmployeeComment: false
  }));
}

// --- Option builders ---
export function departmentOptions() {
  return state.data.departments.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join("");
}

export function jobRoleOptions() {
  return state.data.jobRoles.map(r => `<option value="${escapeHtml(r.title)}">${escapeHtml(r.title)}</option>`).join("");
}

export function jobRoleOptionsForDepartment(department, selected = "") {
  const roles = state.data.jobRoles.filter(r => r.department === department);
  if (!roles.length) return `<option value="">No job roles for selected department</option>`;
  return roles.map(r => `<option value="${escapeHtml(r.title)}" ${selected === r.title ? "selected" : ""}>${escapeHtml(r.title)}</option>`).join("");
}

export function kpiCategories() {
  return ["Job-specific performance", "Quality of work", "Productivity", "Timeliness", "Attendance and punctuality", "Safety and compliance", "Teamwork and communication", "Initiative and problem-solving", "Leadership", "Learning and development"];
}

export function lineManagerOptions(selected = "", department = "all") {
  const blankOption = `<option value="nil" ${!selected || selected === "nil" ? "selected" : ""}>Nil / no assignee yet</option>`;
  const employeeOptions = state.data.employees
    .filter(e => e.userId && (department === "all" || e.department === department))
    .map(e => ({ id: e.userId, name: `${e.firstName} ${e.lastName}`, meta: e.department }));
  const selectedIsVisible = employeeOptions.some(o => o.id === selected);
  const legacyOptions = selected && !selectedIsVisible
    ? usersByRole("LINE_MANAGER").filter(u => selected === u.id).map(u => ({ id: u.id, name: u.name, meta: "current assignment" }))
    : [];
  const options = [...employeeOptions, ...legacyOptions];
  if (!options.length) return `${blankOption}<option value="" disabled>No registered employees in selected department</option>`;
  return `${blankOption}${options.map(o => `<option value="${escapeHtml(o.id)}" ${selected === o.id ? "selected" : ""}>${escapeHtml(`${o.name} - ${o.meta}`)}</option>`).join("")}`;
}

export function refreshLineManagerOptions(form) {
  const department = form.querySelector("select[name='department']")?.value || "all";
  const managerSelect = form.querySelector("select[name='lineManagerUserId']");
  if (!managerSelect) return;
  managerSelect.innerHTML = lineManagerOptions("", department);
}

export function generateEmployeeId() {
  const maxNumber = state.data.employees.reduce((max, e) => {
    const match = String(e.employeeId || "").match(/(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `EMP-${String(maxNumber + 1).padStart(4, "0")}`;
}

export function targetOptions(currentTarget = "") {
  const defaults = ["Meet target", "Exceed approved target", "Meet or exceed approved target"];
  return [...new Set([String(currentTarget || "").trim(), ...defaults].filter(Boolean))];
}

// --- Created-record merge helpers ---
export function mergeCreatedRecord(collection, record, matcher) {
  if (!state.data?.[collection] || !record) return;
  const exists = state.data[collection].some(item => matcher(item, record));
  if (!exists) state.data[collection] = [record, ...state.data[collection]];
}

export function normalizeCreatedEmployee(employee, fallback = {}) {
  if (!employee) return employee;
  return {
    id: employeeRecordKey(employee) || `emp-${Date.now()}`,
    employeeId: employee.employeeId || fallback.employeeId || generateEmployeeId(),
    firstName: employee.firstName || fallback.firstName || "",
    lastName: employee.lastName || fallback.lastName || "",
    email: employee.email || fallback.email || "",
    phone: employee.phone || fallback.phone || "",
    department: employee.department || fallback.department || "",
    jobTitle: employee.jobTitle || fallback.jobTitle || "",
    lineManagerUserId: employee.lineManagerUserId || "",
    status: employee.status || fallback.status || "probation",
    userAccountStatus: employee.userAccountStatus || "active",
    templateId: employee.templateId || fallback.templateId || "",
    roleCategories: employee.roleCategories || fallback.roleCategories || ["staff"],
    ...employee
  };
}

// --- Filters & pagination ---
export function filterRows(rows, fields) {
  return rows.filter(row => {
    const matchesQuery = !state.query || fields.some(f => String(row[f] || "").toLowerCase().includes(state.query.toLowerCase()));
    const matchesFilter = state.filter === "all" || row.status === state.filter;
    return matchesQuery && matchesFilter;
  });
}

export function filterEmployees(rows) {
  return rows.filter(e => {
    const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
    const matchesName = !state.employeeNameFilter || fullName.includes(state.employeeNameFilter.toLowerCase());
    const matchesDepartment = state.employeeDepartmentFilter === "all" || e.department === state.employeeDepartmentFilter;
    const matchesRole = state.employeeRoleFilter === "all" || e.jobTitle === state.employeeRoleFilter;
    return matchesName && matchesDepartment && matchesRole;
  });
}

export function filterKpis(rows) {
  return rows.filter(kpi => {
    const matchesStatus = state.kpiStatusFilter === "all" || kpi.status === state.kpiStatusFilter;
    const matchesDepartment = state.kpiDepartmentFilter === "all" || kpi.department === state.kpiDepartmentFilter || kpi.department === "All";
    const matchesRole = state.kpiRoleFilter === "all" || kpi.jobRole === state.kpiRoleFilter || kpi.jobRole === "All";
    const matchesFrequency = state.kpiFrequencyFilter === "all" || kpi.frequency === state.kpiFrequencyFilter;
    return matchesStatus && matchesDepartment && matchesRole && matchesFrequency;
  });
}

export function employeeRoleFilterOptions() {
  if (state.employeeDepartmentFilter === "all") return state.data.jobRoles;
  return state.data.jobRoles.filter(r => r.department === state.employeeDepartmentFilter);
}

export function kpiRoleFilterOptions() {
  if (state.kpiDepartmentFilter === "all") return state.data.jobRoles;
  return state.data.jobRoles.filter(r => r.department === state.kpiDepartmentFilter);
}

export function paginateRowsWithState(rows, page, pageSize, pageKey) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  if (page > totalPages) state[pageKey] = totalPages;
  if (state[pageKey] < 1) state[pageKey] = 1;
  const start = (state[pageKey] - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), totalPages };
}

export function paginateRows(rows, page, pageSize) {
  return paginateRowsWithState(rows, page, pageSize, "employeePage");
}

// --- Manager / assigned-staff derivations ---
export function managerAttachedEmployees() {
  if (state.user.role !== "LINE_MANAGER") return [];
  const managerRecord = state.data.employees.find(e => e.userId === state.user.id);
  const managerKeys = [state.user.id, ...employeeLookupKeys(managerRecord)].filter(Boolean);
  const staffRows = state.data.employees.filter(e => e.userId !== state.user.id);
  const explicitRows = staffRows.filter(e =>
    managerKeys.includes(String(e.lineManagerUserId || "")) ||
    managerKeys.includes(String(e.lineManagerUserId || "").toLowerCase()) ||
    managerKeys.includes(String(e.lineManagerUserId || "").toUpperCase()));
  if (explicitRows.length) return explicitRows;
  const managedDepartments = new Set(state.data.departments
    .filter(d => [d.head, d.managerialRole, d.supervisoryRole].some(v =>
      managerKeys.includes(String(v || "")) || managerKeys.includes(String(v || "").toLowerCase()) || managerKeys.includes(String(v || "").toUpperCase())))
    .map(d => d.name));
  const departmentRows = staffRows.filter(e => managedDepartments.has(e.department));
  return departmentRows.length ? departmentRows : staffRows;
}

export function buildQueuedAppraisal(employee, periodId = state.data.periods.find(p => p.status === "open")?.id || state.data.periods[0]?.id || "") {
  const key = employeeRecordKey(employee);
  const scores = employeeAssignedKpiRows(employee).map((score, index) => ({
    id: score.id || `queue-${key}-score-${index + 1}`,
    title: score.title, weight: score.weight,
    target: score.target || "Meet or exceed approved target",
    score: score.score || 3,
    actualResult: score.actualResult || "",
    managerComment: score.managerComment || "",
    evidenceNote: score.evidenceNote || "",
    evidenceFileId: score.evidenceFileId || "",
    evidenceFileName: score.evidenceFileName || "",
    employeeComment: score.employeeComment || "",
    managerConfirmedEmployeeComment: Boolean(score.managerConfirmedEmployeeComment)
  }));
  return {
    id: `queue-${key}-${periodId}`,
    employeeId: key, employee, periodId,
    managerUserId: employee.lineManagerUserId || state.user.id,
    status: "Not Started", scores, finalScore: 0, rating: "Not rated", percentage: 0
  };
}

export function managerAssignedAppraisals() {
  if (state.user.role !== "LINE_MANAGER" && !(state.data.assignedStaff || []).length) return state.data.appraisals;
  const periodId = state.data.periods.find(p => p.status === "open")?.id || state.data.periods[0]?.id || "";
  const rows = [];
  const added = new Set();
  for (const appraisal of state.data.appraisals) {
    const employee = appraisal.employee || state.data.employees.find(item => employeeLookupKeys(item).includes(String(appraisal.employeeId)));
    if (!employee || employee.userId === state.user.id) continue;
    rows.push({ ...appraisal, employee });
    added.add(employeeRecordKey(employee) || appraisal.employeeId);
  }
  const staffRows = state.user.role === "LINE_MANAGER" ? managerAttachedEmployees() : (state.data.assignedStaff || []);
  for (const employee of staffRows) {
    const key = employeeRecordKey(employee);
    if (added.has(key)) continue;
    const existing = state.data.appraisals.find(a =>
      employeeLookupKeys(employee).includes(String(a.employeeId)) || employeeLookupKeys(a.employee).includes(key));
    if (existing) {
      rows.push({ ...existing, employee: existing.employee || employee });
      added.add(key);
      continue;
    }
    rows.push(buildQueuedAppraisal(employee, periodId));
    added.add(key);
  }
  return rows;
}

export function appraisalMatchesEmployee(appraisal, employeeId, employee = null) {
  const requestedKeys = new Set([String(employeeId || ""), ...employeeLookupKeys(employee)].filter(Boolean).flatMap(k => [k, k.toLowerCase(), k.toUpperCase()]));
  const appraisalKeys = new Set([
    appraisal?.employeeId, appraisal?.employee?.id, appraisal?.employee?.employeeId,
    appraisal?.employee?.userId, appraisal?.employee?.email, employeeRecordKey(appraisal?.employee),
    ...employeeLookupKeys(appraisal?.employee)
  ].filter(Boolean).map(String).flatMap(k => [k, k.toLowerCase(), k.toUpperCase()]));
  return [...requestedKeys].some(k => appraisalKeys.has(k));
}

export function managerAppraisalForEmployee(employeeId) {
  const targetEmployee = [...(state.data.assignedStaff || []), ...state.data.employees]
    .find(e => employeeLookupKeys(e).includes(String(employeeId || "")));
  return managerAssignedAppraisals().find(a => appraisalMatchesEmployee(a, employeeId, targetEmployee));
}

export function staffAppraisalForEmployee(employeeId) {
  const appraisal = managerAppraisalForEmployee(employeeId);
  if (appraisal) return appraisal;
  const employee = [...(state.data.assignedStaff || []), ...state.data.employees].find(item => employeeLookupKeys(item).includes(String(employeeId || "")));
  if (!employee) return null;
  return buildQueuedAppraisal(employee);
}

export function uniqueEmployees(rows) {
  const seen = new Set();
  return rows.filter(employee => {
    const key = employeeRecordKey(employee);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
