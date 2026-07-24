// API route handlers. Reads use a fresh snapshot; writes go through the SQLite
// collections. Auth, CSRF, and session resolution happen in server.js before
// any of these run, so every handler here already has an authenticated `user`.

import { collection } from "../db/index.js";
import { Roles, assertCan } from "../core/rbac.js";
import { validateScore, validateTemplateWeight } from "../core/scoring.js";
import { HttpError, sendJson } from "./http.js";
import { saveEvidence, getEvidence } from "./evidence.js";
import {
  snapshot, audit, publicUser, normalizeRoleCategories, accountRoleForCategories,
  normalizeList, templateIdForEmployeeBody, nextEmployeeId, employeeLookupKeys,
  managerCanAccessEmployee, decorateAppraisal, makeEmptyAppraisal, dashboardFor,
  bootstrapPayload
} from "./domain.js";
import { hashPassword } from "../core/auth.js";

const MANAGER_EDITABLE_STATUSES = ["Not Started", "Draft", "Returned"];

// Dispatch an authenticated API request. Returns nothing; writes to `res`.
export async function dispatchApi(req, res, url, ctx) {
  const { user, method, body } = ctx;
  const path = url.pathname;

  if (path === "/api/me" && method === "GET") {
    const data = snapshot();
    return sendJson(res, 200, {
      user: publicUser(user),
      dashboard: dashboardFor(data, user),
      notifications: data.notifications.filter(n => n.userId === user.id),
      csrfToken: ctx.session.csrfToken
    });
  }

  if (path === "/api/bootstrap" && method === "GET") {
    return sendJson(res, 200, bootstrapPayload(snapshot(), user));
  }

  // ---- KPI master ----
  if (path === "/api/kpis" && method === "POST") {
    assertCan(user.role, "manageKpis");
    const record = {
      id: `kpi-${Date.now()}`,
      code: body.code, title: body.title, description: body.description,
      category: body.category, department: body.department, jobRole: body.jobRole,
      formula: body.formula || "Actual / Target", target: body.target,
      weight: Number(body.weight), scoringGuide: body.scoringGuide || "Score 1 to 5 using evidence.",
      dataSource: body.dataSource || "Manager evidence", frequency: body.frequency || "quarterly",
      status: "active", createdBy: user.id, createdAt: new Date().toISOString(), modifiedBy: user.id
    };
    collection("kpiMaster").save(record);
    audit(user, "KPI created", "KPI Master", record.code, "", JSON.stringify(record));
    return sendJson(res, 201, record);
  }

  if (path.startsWith("/api/kpis/") && path.endsWith("/delete") && method === "POST") {
    assertCan(user.role, "manageKpis");
    return deleteKpi(res, user, path.split("/").at(-2));
  }

  if (path.startsWith("/api/kpis/") && method === "PATCH") {
    assertCan(user.role, "manageKpis");
    const id = path.split("/").pop();
    if (body.action === "delete") return deleteKpi(res, user, id);
    const store = collection("kpiMaster");
    const record = store.get(id);
    if (!record) throw new HttpError(404, "KPI record not found.");
    const oldValue = JSON.stringify(record);
    for (const field of ["code", "title", "description", "category", "department", "jobRole", "formula", "target", "scoringGuide", "dataSource", "frequency", "status"]) {
      if (body[field] !== undefined) record[field] = body[field];
    }
    if (body.weight !== undefined) record.weight = Number(body.weight);
    record.modifiedBy = user.id;
    record.modifiedAt = new Date().toISOString();
    store.save(record);
    audit(user, "KPI edited", "KPI Master", record.code, oldValue, JSON.stringify(record));
    return sendJson(res, 200, record);
  }

  // ---- Departments ----
  if (path === "/api/departments" && method === "POST") {
    assertCan(user.role, "manageEmployees");
    const department = {
      id: `dept-${Date.now()}`, name: body.name, head: body.head || "",
      managerialRole: body.managerialRole || "", supervisoryRole: body.supervisoryRole || "", status: "active"
    };
    collection("departments").save(department);
    audit(user, "Department created", "Department Master", department.name);
    return sendJson(res, 201, department);
  }

  if (path.startsWith("/api/departments/") && method === "PATCH") {
    assertCan(user.role, "manageEmployees");
    const id = decodeURIComponent(path.split("/").pop());
    const store = collection("departments");
    if (body.action === "delete") {
      const department = store.all().find(d => d.id === id || d.name === id || d.name === body.name);
      if (!department) throw new HttpError(404, "Department not found.");
      store.remove(department.id);
      audit(user, "Department deleted", "Department Master", department.name, JSON.stringify(department), "");
      return sendJson(res, 200, { ok: true, id: department.id });
    }
    const department = store.get(id);
    if (!department) throw new HttpError(404, "Department not found.");
    const oldName = department.name;
    const oldValue = JSON.stringify(department);
    department.name = body.name || department.name;
    department.head = body.head ?? department.head;
    department.managerialRole = body.managerialRole ?? department.managerialRole;
    department.supervisoryRole = body.supervisoryRole ?? department.supervisoryRole;
    department.status = body.status || department.status;
    store.save(department);
    if (oldName !== department.name) cascadeDepartmentRename(oldName, department.name);
    audit(user, "Department updated", "Department Master", department.name, oldValue, JSON.stringify(department));
    return sendJson(res, 200, department);
  }

  // ---- Job roles ----
  if (path === "/api/job-roles" && method === "POST") {
    assertCan(user.role, "manageEmployees");
    if (!body.title || !body.department) throw new HttpError(422, "Job role requires a title and department.");
    const role = { id: `role-${Date.now()}`, title: body.title, department: body.department, status: body.status || "active" };
    collection("jobRoles").save(role);
    audit(user, "Job role created", "Department Master", role.title);
    return sendJson(res, 201, role);
  }

  if (path.startsWith("/api/job-roles/") && method === "PATCH") {
    assertCan(user.role, "manageEmployees");
    const store = collection("jobRoles");
    const role = store.get(path.split("/").pop());
    if (!role) throw new HttpError(404, "Job role not found.");
    const oldTitle = role.title;
    const oldValue = JSON.stringify(role);
    role.title = body.title || role.title;
    role.department = body.department || role.department;
    role.status = body.status || role.status;
    store.save(role);
    if (oldTitle !== role.title) cascadeJobRoleRename(oldTitle, role.title);
    audit(user, "Job role updated", "Department Master", role.title, oldValue, JSON.stringify(role));
    return sendJson(res, 200, role);
  }

  // ---- Employees ----
  if (path === "/api/employees" && method === "POST") {
    assertCan(user.role, "manageEmployees");
    if (!body.department) throw new HttpError(422, "Employee must have a department.");
    if (!body.lineManagerUserId) throw new HttpError(422, "Employee must have a line manager.");
    const data = snapshot();
    const roleCategories = normalizeRoleCategories(body.roleCategories);
    const employeeUser = {
      id: `u-emp-${Date.now()}`, email: body.email, name: `${body.firstName} ${body.lastName}`,
      role: accountRoleForCategories(roleCategories), status: "active", passwordHash: hashPassword("Password123!")
    };
    collection("users").save(employeeUser);
    const employee = {
      id: `emp-${Date.now()}`, userId: employeeUser.id, employeeId: body.employeeId || nextEmployeeId(data),
      firstName: body.firstName, lastName: body.lastName, email: body.email, phone: body.phone || "",
      department: body.department, jobTitle: body.jobTitle, employmentType: body.employmentType || "Full time",
      dateOfEmployment: body.dateOfEmployment || new Date().toISOString().slice(0, 10), confirmationStatus: "probation",
      lineManagerUserId: body.lineManagerUserId, workLocation: body.workLocation || "Plant A", status: body.status || "probation",
      userAccountStatus: "active", templateId: templateIdForEmployeeBody(data, body),
      emergencyContact: body.emergencyContact || "", notes: body.notes || "", roleCategories
    };
    collection("employees").save(employee);
    audit(user, "Employee created with login access", "Employee Master", employee.employeeId, "", employeeUser.email);
    return sendJson(res, 201, employee);
  }

  if (path.startsWith("/api/employees/") && method === "PATCH") {
    assertCan(user.role, "manageEmployees");
    const store = collection("employees");
    const employee = store.get(path.split("/").pop());
    if (!employee) throw new HttpError(404, "Employee not found.");
    const oldValue = JSON.stringify({ status: employee.status, roleCategories: employee.roleCategories });
    for (const field of ["employeeId", "firstName", "lastName", "email", "phone", "department", "jobTitle", "employmentType", "dateOfEmployment", "confirmationStatus", "lineManagerUserId", "workLocation", "status", "userAccountStatus", "templateId", "emergencyContact", "notes"]) {
      if (body[field] !== undefined) employee[field] = body[field];
    }
    if (body.roleCategories) employee.roleCategories = normalizeRoleCategories(body.roleCategories);
    employee.templateId = templateIdForEmployeeBody(snapshot(), employee);
    store.save(employee);
    const users = collection("users");
    const linkedUser = users.get(employee.userId);
    if (linkedUser) {
      linkedUser.email = employee.email;
      linkedUser.name = `${employee.firstName} ${employee.lastName}`;
      linkedUser.status = employee.userAccountStatus === "active" ? "active" : "inactive";
      linkedUser.role = accountRoleForCategories(employee.roleCategories);
      users.save(linkedUser);
    }
    audit(user, "Employee updated", "Employee Master", employee.employeeId, oldValue, JSON.stringify(employee));
    return sendJson(res, 200, employee);
  }

  // ---- Templates ----
  if (path === "/api/templates" && method === "POST") {
    assertCan(user.role, "manageKpis");
    validateTemplateWeight(body.items || []);
    const template = { id: `tpl-${Date.now()}`, name: body.name, department: body.department, jobRole: body.jobRole, status: body.status || "active", items: body.items };
    collection("templates").save(template);
    audit(user, "KPI template created", "KPI Templates", template.name);
    return sendJson(res, 201, template);
  }

  if (path.startsWith("/api/templates/") && method === "PATCH") {
    assertCan(user.role, "manageKpis");
    const store = collection("templates");
    const template = store.get(path.split("/").pop());
    if (!template) throw new HttpError(404, "KPI template not found.");
    if (body.items) validateTemplateWeight(body.items);
    const oldValue = JSON.stringify(template);
    template.name = body.name || template.name;
    template.department = body.department || template.department;
    template.jobRole = body.jobRole || template.jobRole;
    template.status = body.status || template.status;
    if (body.items) template.items = body.items;
    store.save(template);
    audit(user, "KPI template edited", "KPI Templates", template.name, oldValue, JSON.stringify(template));
    return sendJson(res, 200, template);
  }

  // ---- Appraisal periods ----
  if (path === "/api/periods" && method === "POST") {
    assertCan(user.role, "managePeriods");
    const data = snapshot();
    const period = {
      id: `period-${Date.now()}`, name: body.name, startDate: body.startDate, endDate: body.endDate,
      type: body.type || "quarterly", status: body.status || "open",
      departments: body.departments || data.departments.map(d => d.name)
    };
    collection("appraisalPeriods").save(period);
    audit(user, "Appraisal period created", "Appraisal Periods", period.name);
    return sendJson(res, 201, period);
  }

  if (path.startsWith("/api/periods/") && method === "PATCH") {
    assertCan(user.role, "managePeriods");
    const store = collection("appraisalPeriods");
    const period = store.get(path.split("/").pop());
    if (!period) throw new HttpError(404, "Appraisal period not found.");
    const oldValue = JSON.stringify(period);
    for (const field of ["name", "startDate", "endDate", "type", "status"]) {
      if (body[field] !== undefined) period[field] = body[field];
    }
    if (body.departments !== undefined) period.departments = normalizeList(body.departments);
    store.save(period);
    audit(user, "Appraisal period updated", "Appraisal Periods", period.name, oldValue, JSON.stringify(period));
    return sendJson(res, 200, period);
  }

  // ---- Evidence upload/download ----
  if (path === "/api/evidence" && method === "POST") {
    if (![Roles.LINE_MANAGER, Roles.HR_ADMIN, Roles.SUPER_ADMIN].includes(user.role)) {
      throw new HttpError(403, "Only managers or HR can attach evidence.");
    }
    const meta = saveEvidence(user, body);
    audit(user, "Evidence uploaded", "Appraisals", meta.id, "", meta.filename);
    return sendJson(res, 201, meta);
  }

  if (path.startsWith("/api/evidence/") && method === "GET") {
    return getEvidence(res, path.split("/").pop());
  }

  // ---- Appraisal workflow ----
  if (path.startsWith("/api/appraisals/") && method === "POST") {
    return handleAppraisalAction(res, user, path.split("/").pop(), body);
  }

  if (path === "/api/my-kpi-comments" && method === "POST") {
    return handleEmployeeKpiComments(res, user, body);
  }

  if (path.startsWith("/api/acknowledge/") && method === "POST") {
    return handleAcknowledge(res, user, path.split("/").pop());
  }

  throw new HttpError(404, "Not found.");
}

function deleteKpi(res, user, id) {
  const store = collection("kpiMaster");
  const record = store.get(id);
  if (!record) throw new HttpError(404, "KPI record not found.");
  store.remove(id);
  audit(user, "KPI deleted", "KPI Master", record.code, JSON.stringify(record), "");
  return sendJson(res, 200, { ok: true, id });
}

function cascadeDepartmentRename(oldName, newName) {
  for (const [name, key] of [["employees", "department"], ["jobRoles", "department"], ["kpiMaster", "department"], ["templates", "department"]]) {
    const store = collection(name);
    for (const row of store.all().filter(r => r[key] === oldName)) {
      row[key] = newName;
      store.save(row);
    }
  }
}

function cascadeJobRoleRename(oldTitle, newTitle) {
  for (const [name, key] of [["employees", "jobTitle"], ["kpiMaster", "jobRole"], ["templates", "jobRole"]]) {
    const store = collection(name);
    for (const row of store.all().filter(r => r[key] === oldTitle)) {
      row[key] = newTitle;
      store.save(row);
    }
  }
}

function handleAppraisalAction(res, user, id, body) {
  const store = collection("appraisals");
  const data = snapshot();
  let appraisal = store.get(id);

  // Virtual queue id: materialise a real appraisal row on first write.
  if (!appraisal && String(id).startsWith("queue-")) {
    const [, employeeId, periodId] = String(id).match(/^queue-(.+)-(period-.+)$/) || [];
    const employee = data.employees.find(e => employeeLookupKeys(e).includes(String(employeeId || "")));
    if (employee) {
      appraisal = { ...makeEmptyAppraisal(data, employee, periodId), id: `app-${Date.now()}` };
    }
  }
  if (!appraisal) throw new HttpError(404, "Appraisal not found.");

  const employee = data.employees.find(e => employeeLookupKeys(e).includes(String(appraisal.employeeId || "")));

  // Manager actions.
  if (user.role === Roles.LINE_MANAGER) {
    if (!managerCanAccessEmployee(data, user, employee)) {
      throw new HttpError(403, "Line managers can only appraise assigned employees.");
    }
    const period = data.appraisalPeriods.find(p => p.id === appraisal.periodId);
    if (!period || period.status !== "open") throw new HttpError(423, "Appraisal period is not open.");

    if (body.confirmEmployeeComments) {
      const scoreIds = body.scoreIds || appraisal.scores.map(s => s.id);
      for (const score of appraisal.scores.filter(s => scoreIds.includes(s.id))) {
        score.managerConfirmedEmployeeComment = true;
        score.managerCommentConfirmationAt = new Date().toISOString();
      }
      store.save(appraisal);
      audit(user, "Employee KPI comments confirmed", "Appraisals", appraisal.id);
      return sendJson(res, 200, decorateAppraisal(snapshot(), appraisal));
    }

    if (!MANAGER_EDITABLE_STATUSES.includes(appraisal.status)) {
      throw new HttpError(409, `Appraisal is ${appraisal.status} and can no longer be edited by the manager.`);
    }
    for (const score of body.scores || []) validateScore(score.score);
    if (body.scores) appraisal.scores = mergeScores(appraisal.scores, body.scores);
    appraisal.overallComment = body.overallComment ?? appraisal.overallComment;
    appraisal.status = body.submit ? "Submitted" : "Draft";
    if (body.submit) appraisal.submittedAt = new Date().toISOString();
    store.save(appraisal);
    audit(user, body.submit ? "Appraisal submitted" : "Appraisal saved as draft", "Appraisals", appraisal.id);
    return sendJson(res, 200, decorateAppraisal(snapshot(), appraisal));
  }

  // HR / Super Admin review actions.
  if ([Roles.HR_ADMIN, Roles.SUPER_ADMIN].includes(user.role)) {
    if (body.action === "return") appraisal.status = "Returned";
    else if (body.action === "approve") appraisal.status = "Approved";
    else if (body.action === "publish") {
      if (appraisal.status !== "Approved") throw new HttpError(409, "Only approved appraisals can be published.");
      appraisal.status = "Published";
      appraisal.published = true;
      appraisal.publishedAt = new Date().toISOString();
    }
    if (body.hrComment !== undefined) appraisal.hrComment = body.hrComment || appraisal.hrComment;
    store.save(appraisal);
    audit(user, `Appraisal ${appraisal.status.toLowerCase()}`, "HR Review", appraisal.id);
    return sendJson(res, 200, decorateAppraisal(snapshot(), appraisal));
  }

  throw new HttpError(403, "You are not allowed to act on this appraisal.");
}

// Preserve manager evidence/score edits while accepting an incoming score set.
function mergeScores(existing, incoming) {
  return incoming.map(next => {
    const prior = existing.find(s => s.id === next.id) || {};
    return { ...prior, ...next };
  });
}

function handleEmployeeKpiComments(res, user, body) {
  if (user.role !== Roles.EMPLOYEE) throw new HttpError(403, "Only employees can comment on assigned KPIs.");
  const data = snapshot();
  const employee = data.employees.find(e => e.userId === user.id);
  if (!employee) throw new HttpError(404, "Employee profile not found.");
  const store = collection("appraisals");
  const periodId = body.periodId || data.appraisalPeriods.find(p => p.status === "open")?.id || data.appraisalPeriods[0]?.id;
  let appraisal = data.appraisals.find(a => a.employeeId === employee.id && a.periodId === periodId);
  if (!appraisal) appraisal = { ...makeEmptyAppraisal(data, employee, periodId), id: `app-${Date.now()}` };

  for (const item of body.comments || []) {
    const score = appraisal.scores.find(row => row.id === item.scoreId || row.title === item.title);
    if (score) {
      if (item.target !== undefined) score.target = item.target || score.target || "";
      score.employeeComment = item.employeeComment || "";
      score.managerConfirmedEmployeeComment = false;
      score.employeeCommentedAt = new Date().toISOString();
    }
  }
  store.save(appraisal);
  audit(user, "Employee KPI comment submitted", "Employee KPIs", appraisal.id);
  return sendJson(res, 200, decorateAppraisal(snapshot(), appraisal));
}

function handleAcknowledge(res, user, id) {
  if (user.role !== Roles.EMPLOYEE) throw new HttpError(403, "Only employees can acknowledge results.");
  const store = collection("appraisals");
  const data = snapshot();
  const employee = data.employees.find(e => e.userId === user.id);
  const appraisal = store.get(id);
  if (!appraisal || appraisal.employeeId !== employee?.id) throw new HttpError(404, "Appraisal not found.");
  if (appraisal.status !== "Published") throw new HttpError(422, "Only published appraisals can be acknowledged.");
  appraisal.status = "Acknowledged";
  appraisal.acknowledged = true;
  appraisal.acknowledgedAt = new Date().toISOString();
  store.save(appraisal);
  audit(user, "Employee acknowledgement", "Appraisals", appraisal.id);
  return sendJson(res, 200, decorateAppraisal(snapshot(), appraisal));
}
