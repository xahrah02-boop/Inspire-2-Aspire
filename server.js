import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSeedData } from "./src/data/seed.js";
import { verifyPassword, makeToken, hashPassword } from "./src/core/auth.js";
import { assertCan, canViewEmployee, Roles } from "./src/core/rbac.js";
import { calculateFinalScore, ratingForScore, validateScore, validateTemplateWeight } from "./src/core/scoring.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const data = createSeedData();
const sessions = new Map();

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
    });
  });
}

function currentUser(req) {
  const cookie = req.headers.cookie || "";
  const token = cookie.split(";").map(v => v.trim()).find(v => v.startsWith("hr_session="))?.split("=")[1];
  const userId = sessions.get(token);
  return data.users.find(user => user.id === userId && user.status === "active");
}

function audit(user, action, module, record, oldValue = "", newValue = "") {
  data.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    userId: user?.id || "system",
    action, module, record, oldValue, newValue,
    createdAt: new Date().toISOString()
  });
}

function dashboardFor(user) {
  const totals = {
    employees: data.employees.length,
    departments: data.departments.length,
    activePeriods: data.appraisalPeriods.filter(p => p.status === "open").length,
    pendingAppraisals: data.appraisals.filter(a => ["Draft", "Submitted", "Returned"].includes(a.status)).length,
    completedAppraisals: data.appraisals.filter(a => ["Approved", "Published", "Acknowledged"].includes(a.status)).length
  };
  if (user.role === Roles.LINE_MANAGER) {
    const myEmployees = managerAssignedEmployees(user);
    const myAppraisals = appraisalQueueFor(user, myEmployees);
    return {
      cards: [
        ["My assigned employees", myEmployees.length],
        ["Appraisals due", myAppraisals.filter(a => a.status === "Not Started").length],
        ["Draft appraisals", myAppraisals.filter(a => a.status === "Draft").length],
        ["Submitted appraisals", myAppraisals.filter(a => a.status === "Submitted").length],
        ["Performance attention", myAppraisals.filter(a => finalScore(a) < 12).length]
      ]
    };
  }
  if (user.role === Roles.EMPLOYEE) {
    const employee = data.employees.find(e => e.userId === user.id);
    return {
      cards: [
        ["My profile", employee ? employee.employeeId : "Missing"],
        ["Assigned KPIs", employee ? templateFor(employee)?.items.length || 0 : 0],
        ["Appraisal status", employee ? appraisalForEmployee(employee.id)?.status || "Not Started" : "No appraisal"],
        ["Onboarding guide", data.guides.length]
      ]
    };
  }
  if (user.role === Roles.HR_ADMIN) {
    return {
      cards: [
        ["Total employees", totals.employees],
        ["Employees without assigned KPIs", data.employees.filter(e => !e.templateId).length],
        ["Employees without line managers", data.employees.filter(e => !e.lineManagerUserId).length],
        ["Pending manager appraisals", totals.pendingAppraisals],
        ["Completed appraisals", totals.completedAppraisals],
        ["KPI templates", data.templates.length]
      ]
    };
  }
  return {
    cards: [
      ["Total employees", totals.employees],
      ["Total departments", totals.departments],
      ["Active appraisal periods", totals.activePeriods],
      ["Pending appraisals", totals.pendingAppraisals],
      ["Completed appraisals", totals.completedAppraisals],
      ["Users by role", data.users.reduce((acc, u) => ({ ...acc, [u.role]: (acc[u.role] || 0) + 1 }), {})]
    ]
  };
}

function templateFor(employee) {
  return data.templates.find(template => template.id === employee.templateId)
    || data.templates.find(template => template.jobRole === employee.jobTitle && template.status !== "archived");
}

function appraisalForEmployee(employeeId) {
  return data.appraisals.find(appraisal => appraisal.employeeId === employeeId);
}

function finalScore(appraisal) {
  return calculateFinalScore(appraisal.scores);
}

function visibleEmployees(user) {
  if (user.role === Roles.LINE_MANAGER) {
    const managerProfiles = data.employees.filter(employee => employee.userId === user.id);
    return uniqueById([...managerProfiles, ...managerAssignedEmployees(user)]);
  }
  return data.employees.filter(employee => canViewEmployee(user, employee));
}

function managerKeys(user) {
  return [
    user.id,
    ...data.employees
      .filter(employee => employee.userId === user.id)
      .flatMap(employee => employeeLookupKeys(employee))
  ].filter(Boolean);
}

function managerDepartmentNames(user) {
  const keys = managerKeys(user);
  return data.departments
    .filter(department => [department.head, department.managerialRole, department.supervisoryRole].some(value => keys.includes(String(value || "")) || keys.includes(String(value || "").toLowerCase()) || keys.includes(String(value || "").toUpperCase())))
    .map(department => department.name);
}

function managerAssignedEmployees(user) {
  const keys = managerKeys(user);
  const departments = managerDepartmentNames(user);
  return data.employees.filter(employee =>
    employee.userId !== user.id &&
    (keys.includes(String(employee.lineManagerUserId || "")) || keys.includes(String(employee.lineManagerUserId || "").toLowerCase()) || keys.includes(String(employee.lineManagerUserId || "").toUpperCase()) || departments.includes(employee.department))
  );
}

function uniqueById(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const key = row.id || row.employeeId || row.userId || row.email;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function normalizeRoleCategories(value) {
  const list = Array.isArray(value) ? value : String(value || "staff").split(",");
  const clean = [...new Set(list.map(item => String(item).trim()).filter(Boolean))];
  return clean.length ? clean : ["staff"];
}

function accountRoleForCategories(value) {
  const categories = normalizeRoleCategories(value);
  return categories.includes("managerial") || categories.includes("supervisory") ? Roles.LINE_MANAGER : Roles.EMPLOYEE;
}

function templateIdForEmployeeBody(body) {
  if (body.templateId) return body.templateId;
  return data.templates.find(template => template.jobRole === body.jobTitle && template.status !== "archived")?.id || "";
}

function nextEmployeeId() {
  const maxNumber = data.employees.reduce((max, employee) => {
    const match = String(employee.employeeId || "").match(/(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `EMP-${String(maxNumber + 1).padStart(4, "0")}`;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === "/api/login" && req.method === "POST") {
      const body = await readBody(req);
      const user = data.users.find(item => item.email.toLowerCase() === String(body.email || "").toLowerCase());
      if (!user || !verifyPassword(body.password || "", user.passwordHash)) {
        return sendJson(res, 401, { error: "Invalid email or password." });
      }
      const token = makeToken();
      sessions.set(token, user.id);
      audit(user, "User login", "Authentication", user.email);
      res.writeHead(200, { "content-type": "application/json", "set-cookie": `hr_session=${token}; HttpOnly; SameSite=Lax; Path=/` });
      return res.end(JSON.stringify({ user: publicUser(user) }));
    }

    if (url.pathname === "/api/logout" && req.method === "POST") {
      const token = (req.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith("hr_session="))?.split("=")[1];
      if (token) sessions.delete(token);
      res.writeHead(204, { "set-cookie": "hr_session=; Max-Age=0; Path=/" });
      return res.end();
    }

    const user = currentUser(req);
    if (!user) return sendJson(res, 401, { error: "Authentication required." });

    if (url.pathname === "/api/me") return sendJson(res, 200, { user: publicUser(user), dashboard: dashboardFor(user), notifications: data.notifications.filter(n => n.userId === user.id) });
    if (url.pathname === "/api/bootstrap") return sendJson(res, 200, bootstrapPayload(user));

    if (url.pathname === "/api/kpis" && req.method === "POST") {
      assertCan(user.role, "manageKpis");
      const body = await readBody(req);
      const record = {
        id: `kpi-${Date.now()}`,
        code: body.code,
        title: body.title,
        description: body.description,
        category: body.category,
        department: body.department,
        jobRole: body.jobRole,
        formula: body.formula || "Actual / Target",
        target: body.target,
        weight: Number(body.weight),
        scoringGuide: body.scoringGuide || "Score 1 to 5 using evidence.",
        dataSource: body.dataSource || "Manager evidence",
        frequency: body.frequency || "quarterly",
        status: "active",
        createdBy: user.id,
        createdAt: new Date().toISOString(),
        modifiedBy: user.id
      };
      data.kpiMaster.unshift(record);
      audit(user, "KPI created", "KPI Master", record.code, "", JSON.stringify(record));
      return sendJson(res, 201, record);
    }

    if (url.pathname.startsWith("/api/kpis/") && url.pathname.endsWith("/delete") && req.method === "POST") {
      assertCan(user.role, "manageKpis");
      const id = url.pathname.split("/").at(-2);
      const index = data.kpiMaster.findIndex(item => item.id === id);
      if (index === -1) return sendJson(res, 404, { error: "KPI record not found." });
      const [record] = data.kpiMaster.splice(index, 1);
      audit(user, "KPI deleted", "KPI Master", record.code, JSON.stringify(record), "");
      return sendJson(res, 200, { ok: true, id });
    }

    if (url.pathname.startsWith("/api/kpis/") && req.method === "PATCH") {
      assertCan(user.role, "manageKpis");
      const id = url.pathname.split("/").pop();
      const body = await readBody(req);
      if (body.action === "delete") {
        const index = data.kpiMaster.findIndex(item => item.id === id);
        if (index === -1) return sendJson(res, 404, { error: "KPI record not found." });
        const [deleted] = data.kpiMaster.splice(index, 1);
        audit(user, "KPI deleted", "KPI Master", deleted.code, JSON.stringify(deleted), "");
        return sendJson(res, 200, { ok: true, id });
      }
      const record = data.kpiMaster.find(item => item.id === id);
      if (!record) return sendJson(res, 404, { error: "KPI record not found." });
      const oldValue = JSON.stringify(record);
      for (const field of [
        "code", "title", "description", "category", "department", "jobRole", "formula",
        "target", "scoringGuide", "dataSource", "frequency", "status"
      ]) {
        if (body[field] !== undefined) record[field] = body[field];
      }
      if (body.weight !== undefined) record.weight = Number(body.weight);
      record.modifiedBy = user.id;
      record.modifiedAt = new Date().toISOString();
      audit(user, "KPI edited", "KPI Master", record.code, oldValue, JSON.stringify(record));
      return sendJson(res, 200, record);
    }

    if (url.pathname === "/api/departments" && req.method === "POST") {
      assertCan(user.role, "manageEmployees");
      const body = await readBody(req);
      const department = {
        id: `dept-${Date.now()}`,
        name: body.name,
        head: body.head || "",
        managerialRole: body.managerialRole || "",
        supervisoryRole: body.supervisoryRole || "",
        status: "active"
      };
      data.departments.unshift(department);
      audit(user, "Department created", "Department Master", department.name);
      return sendJson(res, 201, department);
    }

    if (url.pathname.startsWith("/api/departments/") && req.method === "PATCH") {
      assertCan(user.role, "manageEmployees");
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const body = await readBody(req);
      if (body.action === "delete") {
        const index = data.departments.findIndex(item => item.id === id || item.name === id || item.name === body.name);
        if (index === -1) return sendJson(res, 404, { error: "Department not found." });
        const [department] = data.departments.splice(index, 1);
        audit(user, "Department deleted", "Department Master", department.name, JSON.stringify(department), "");
        return sendJson(res, 200, { ok: true, id: department.id });
      }
      const department = data.departments.find(item => item.id === id);
      if (!department) return sendJson(res, 404, { error: "Department not found." });
      const oldName = department.name;
      const oldValue = JSON.stringify(department);
      department.name = body.name || department.name;
      department.head = body.head ?? department.head;
      department.managerialRole = body.managerialRole ?? department.managerialRole;
      department.supervisoryRole = body.supervisoryRole ?? department.supervisoryRole;
      department.status = body.status || department.status;
      if (oldName !== department.name) {
        for (const employee of data.employees.filter(item => item.department === oldName)) employee.department = department.name;
        for (const role of data.jobRoles.filter(item => item.department === oldName)) role.department = department.name;
        for (const kpi of data.kpiMaster.filter(item => item.department === oldName)) kpi.department = department.name;
        for (const template of data.templates.filter(item => item.department === oldName)) template.department = department.name;
      }
      audit(user, "Department updated", "Department Master", department.name, oldValue, JSON.stringify(department));
      return sendJson(res, 200, department);
    }

    if (url.pathname.startsWith("/api/job-roles/") && req.method === "PATCH") {
      assertCan(user.role, "manageEmployees");
      const id = url.pathname.split("/").pop();
      const body = await readBody(req);
      const role = data.jobRoles.find(item => item.id === id);
      if (!role) return sendJson(res, 404, { error: "Job role not found." });
      const oldTitle = role.title;
      const oldValue = JSON.stringify(role);
      role.title = body.title || role.title;
      role.department = body.department || role.department;
      role.status = body.status || role.status;
      if (oldTitle !== role.title) {
        for (const employee of data.employees.filter(item => item.jobTitle === oldTitle)) employee.jobTitle = role.title;
        for (const kpi of data.kpiMaster.filter(item => item.jobRole === oldTitle)) kpi.jobRole = role.title;
        for (const template of data.templates.filter(item => item.jobRole === oldTitle)) template.jobRole = role.title;
      }
      audit(user, "Job role updated", "Department Master", role.title, oldValue, JSON.stringify(role));
      return sendJson(res, 200, role);
    }

    if (url.pathname === "/api/job-roles" && req.method === "POST") {
      assertCan(user.role, "manageEmployees");
      const body = await readBody(req);
      if (!body.title || !body.department) return sendJson(res, 422, { error: "Job role requires a title and department." });
      const role = {
        id: `role-${Date.now()}`,
        title: body.title,
        department: body.department,
        status: body.status || "active"
      };
      data.jobRoles.unshift(role);
      audit(user, "Job role created", "Department Master", role.title);
      return sendJson(res, 201, role);
    }

    if (url.pathname === "/api/employees" && req.method === "POST") {
      assertCan(user.role, "manageEmployees");
      const body = await readBody(req);
      if (!body.department) return sendJson(res, 422, { error: "Employee must have a department." });
      const roleCategories = normalizeRoleCategories(body.roleCategories);
      const employeeUser = {
        id: `u-emp-${Date.now()}`,
        email: body.email,
        name: `${body.firstName} ${body.lastName}`,
        role: accountRoleForCategories(roleCategories),
        status: "active",
        passwordHash: hashPassword("Password123!")
      };
      data.users.push(employeeUser);
      const employee = { id: `emp-${Date.now()}`, userId: employeeUser.id, employeeId: body.employeeId || nextEmployeeId(), firstName: body.firstName, lastName: body.lastName, email: body.email, phone: body.phone || "", department: body.department, jobTitle: body.jobTitle, employmentType: body.employmentType || "Full time", dateOfEmployment: body.dateOfEmployment || new Date().toISOString().slice(0, 10), confirmationStatus: "probation", lineManagerUserId: body.lineManagerUserId, workLocation: body.workLocation || "Plant A", status: body.status || "probation", userAccountStatus: "active", templateId: templateIdForEmployeeBody(body), emergencyContact: body.emergencyContact || "", notes: body.notes || "", roleCategories };
      data.employees.unshift(employee);
      audit(user, "Employee created with login access", "Employee Master", employee.employeeId, "", employeeUser.email);
      return sendJson(res, 201, employee);
    }

    if (url.pathname.startsWith("/api/employees/") && req.method === "PATCH") {
      assertCan(user.role, "manageEmployees");
      const id = url.pathname.split("/").pop();
      const body = await readBody(req);
      const employee = data.employees.find(item => item.id === id);
      if (!employee) return sendJson(res, 404, { error: "Employee not found." });
      const oldValue = JSON.stringify({ status: employee.status, roleCategories: employee.roleCategories || employee.roleCategory });
      for (const field of [
        "employeeId", "firstName", "lastName", "email", "phone", "department", "jobTitle",
        "employmentType", "dateOfEmployment", "confirmationStatus", "lineManagerUserId",
        "workLocation", "status", "userAccountStatus", "templateId", "emergencyContact", "notes"
      ]) {
        if (body[field] !== undefined) employee[field] = body[field];
      }
      if (body.roleCategories) employee.roleCategories = normalizeRoleCategories(body.roleCategories);
      employee.templateId = templateIdForEmployeeBody(employee);
      const linkedUser = data.users.find(item => item.id === employee.userId);
      if (linkedUser) {
        linkedUser.email = employee.email;
        linkedUser.name = `${employee.firstName} ${employee.lastName}`;
        linkedUser.status = employee.userAccountStatus === "active" ? "active" : "inactive";
        linkedUser.role = accountRoleForCategories(employee.roleCategories);
      }
      audit(user, "Employee updated", "Employee Master", employee.employeeId, oldValue, JSON.stringify(employee));
      return sendJson(res, 200, employee);
    }

    if (url.pathname === "/api/templates" && req.method === "POST") {
      assertCan(user.role, "manageKpis");
      const body = await readBody(req);
      validateTemplateWeight(body.items || []);
      const template = { id: `tpl-${Date.now()}`, name: body.name, department: body.department, jobRole: body.jobRole, status: body.status || "active", items: body.items };
      data.templates.unshift(template);
      audit(user, "KPI template created", "KPI Templates", template.name);
      return sendJson(res, 201, template);
    }

    if (url.pathname.startsWith("/api/templates/") && req.method === "PATCH") {
      assertCan(user.role, "manageKpis");
      const id = url.pathname.split("/").pop();
      const body = await readBody(req);
      const template = data.templates.find(item => item.id === id);
      if (!template) return sendJson(res, 404, { error: "KPI template not found." });
      if (body.items) validateTemplateWeight(body.items);
      const oldValue = JSON.stringify(template);
      template.name = body.name || template.name;
      template.department = body.department || template.department;
      template.jobRole = body.jobRole || template.jobRole;
      template.status = body.status || template.status;
      if (body.items) template.items = body.items;
      audit(user, "KPI template edited", "KPI Templates", template.name, oldValue, JSON.stringify(template));
      return sendJson(res, 200, template);
    }

    if (url.pathname === "/api/periods" && req.method === "POST") {
      assertCan(user.role, "managePeriods");
      const body = await readBody(req);
      const period = {
        id: `period-${Date.now()}`,
        name: body.name,
        startDate: body.startDate,
        endDate: body.endDate,
        type: body.type || "quarterly",
        status: body.status || "open",
        departments: body.departments || data.departments.map(d => d.name)
      };
      data.appraisalPeriods.unshift(period);
      audit(user, "Appraisal period created", "Appraisal Periods", period.name);
      return sendJson(res, 201, period);
    }

    if (url.pathname.startsWith("/api/periods/") && req.method === "PATCH") {
      assertCan(user.role, "managePeriods");
      const id = url.pathname.split("/").pop();
      const body = await readBody(req);
      const period = data.appraisalPeriods.find(item => item.id === id);
      if (!period) return sendJson(res, 404, { error: "Appraisal period not found." });
      const oldValue = JSON.stringify(period);
      for (const field of ["name", "startDate", "endDate", "type", "status"]) {
        if (body[field] !== undefined) period[field] = body[field];
      }
      if (body.departments !== undefined) period.departments = normalizeList(body.departments);
      audit(user, "Appraisal period updated", "Appraisal Periods", period.name, oldValue, JSON.stringify(period));
      return sendJson(res, 200, period);
    }

    if (url.pathname.startsWith("/api/appraisals/") && req.method === "POST") {
      const id = url.pathname.split("/").pop();
      let appraisal = data.appraisals.find(a => a.id === id);
      if (!appraisal && id.startsWith("queue-")) {
        const [, employeeId, periodId] = id.match(/^queue-(.+)-(period-.+)$/) || [];
        const employee = data.employees.find(e => employeeLookupKeys(e).includes(String(employeeId || "")));
        if (employee) {
          appraisal = { ...makeEmptyAppraisal(employee, periodId), id: `app-${Date.now()}` };
          data.appraisals.unshift(appraisal);
        }
      }
      if (!appraisal) return sendJson(res, 404, { error: "Appraisal not found." });
      const employee = data.employees.find(e => employeeLookupKeys(e).includes(String(appraisal.employeeId || "")));
      const body = await readBody(req);
      if (managerCanAccessEmployee(user, employee)) {
        if (!managerCanAccessEmployee(user, employee)) return sendJson(res, 403, { error: "Line managers can only appraise assigned employees." });
        if (!data.appraisalPeriods.find(p => p.id === appraisal.periodId && p.status === "open")) return sendJson(res, 423, { error: "Appraisal period is not open." });
        if (body.confirmEmployeeComments) {
          const scoreIds = body.scoreIds || appraisal.scores.map(score => score.id);
          for (const score of appraisal.scores.filter(score => scoreIds.includes(score.id))) {
            score.managerConfirmedEmployeeComment = true;
            score.managerCommentConfirmationAt = new Date().toISOString();
          }
          audit(user, "Employee KPI comments confirmed", "Appraisals", appraisal.id);
          return sendJson(res, 200, decorateAppraisal(appraisal));
        }
        for (const score of body.scores || []) validateScore(score.score);
        appraisal.scores = body.scores || appraisal.scores;
        appraisal.overallComment = body.overallComment || appraisal.overallComment;
        appraisal.status = body.submit ? "Submitted" : "Draft";
        audit(user, body.submit ? "Appraisal submitted" : "Appraisal saved as draft", "Appraisals", appraisal.id);
        return sendJson(res, 200, decorateAppraisal(appraisal));
      }
      if ([Roles.HR_ADMIN, Roles.SUPER_ADMIN].includes(user.role)) {
        if (body.action === "return") appraisal.status = "Returned";
        if (body.action === "approve") appraisal.status = "Approved";
        if (body.action === "publish" && appraisal.status === "Approved") {
          appraisal.status = "Published";
          appraisal.published = true;
        }
        appraisal.hrComment = body.hrComment || appraisal.hrComment;
        audit(user, `Appraisal ${appraisal.status.toLowerCase()}`, "HR Review", appraisal.id);
        return sendJson(res, 200, decorateAppraisal(appraisal));
      }
    }

    if (url.pathname === "/api/my-kpi-comments" && req.method === "POST") {
      if (user.role !== Roles.EMPLOYEE) return sendJson(res, 403, { error: "Only employees can comment on assigned KPIs." });
      const employee = data.employees.find(e => e.userId === user.id);
      if (!employee) return sendJson(res, 404, { error: "Employee profile not found." });
      const body = await readBody(req);
      const periodId = body.periodId || data.appraisalPeriods.find(p => p.status === "open")?.id || data.appraisalPeriods[0]?.id;
      let appraisal = data.appraisals.find(a => a.employeeId === employee.id && a.periodId === periodId);
      if (!appraisal) {
        appraisal = { ...makeEmptyAppraisal(employee, periodId), id: `app-${Date.now()}` };
        data.appraisals.unshift(appraisal);
      }
      for (const item of body.comments || []) {
        const score = appraisal.scores.find(row => row.id === item.scoreId || row.title === item.title);
        if (score) {
          if (item.target !== undefined) score.target = item.target || score.target || "";
          score.employeeComment = item.employeeComment || "";
          score.managerConfirmedEmployeeComment = false;
          score.employeeCommentedAt = new Date().toISOString();
        }
      }
      audit(user, "Employee KPI comment submitted", "Employee KPIs", appraisal.id);
      return sendJson(res, 200, decorateAppraisal(appraisal));
    }

    if (url.pathname.startsWith("/api/acknowledge/") && req.method === "POST") {
      if (user.role !== Roles.EMPLOYEE) return sendJson(res, 403, { error: "Only employees can acknowledge results." });
      const employee = data.employees.find(e => e.userId === user.id);
      const appraisal = data.appraisals.find(a => a.id === url.pathname.split("/").pop() && a.employeeId === employee?.id);
      if (!appraisal || appraisal.status !== "Published") return sendJson(res, 422, { error: "Only published appraisals can be acknowledged." });
      appraisal.status = "Acknowledged";
      appraisal.acknowledged = true;
      audit(user, "Employee acknowledgement", "Appraisals", appraisal.id);
      return sendJson(res, 200, decorateAppraisal(appraisal));
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    sendJson(res, error.message.includes("not allowed") ? 403 : 400, { error: error.message });
  }
}

function bootstrapPayload(user) {
  const employees = visibleEmployees(user);
  const appraisals = appraisalQueueFor(user, employees);
  const employeeKpis = data.kpiMaster.filter(kpi => employees.some(employee => kpiMatchesEmployee(kpi, employee)));
  return {
    user: publicUser(user),
    dashboard: dashboardFor(user),
    departments: data.departments.map(decorateDepartment),
    jobRoles: data.jobRoles,
    employees,
    kpiMaster: [Roles.SUPER_ADMIN, Roles.HR_ADMIN].includes(user.role) ? data.kpiMaster : employeeKpis,
    templates: [Roles.EMPLOYEE].includes(user.role) ? data.templates.filter(t => employees.some(e => e.templateId === t.id)) : data.templates,
    periods: data.appraisalPeriods,
    appraisals,
    assignedStaff: managerAssignedEmployees(user),
    userList: [Roles.SUPER_ADMIN, Roles.HR_ADMIN].includes(user.role) ? data.users.map(publicUser) : [],
    reports: reports(),
    guides: data.guides,
    auditLogs: [Roles.SUPER_ADMIN, Roles.HR_ADMIN].includes(user.role) ? data.auditLogs : []
  };
}

function decorateDepartment(department) {
  return {
    ...department,
    managerialRoleName: assigneeNameForDepartment(department.managerialRole, department.name, "managerial"),
    supervisoryRoleName: assigneeNameForDepartment(department.supervisoryRole, department.name, "supervisory")
  };
}

function assigneeNameForDepartment(value, departmentName, roleCategory) {
  if (!value) return "Not assigned";
  const key = String(value).trim();
  const employee = data.employees.find(item => employeeLookupKeys(item).includes(key) || employeeLookupKeys(item).includes(key.toLowerCase()) || employeeLookupKeys(item).includes(key.toUpperCase()));
  if (employee) return `${employee.firstName} ${employee.lastName}`;
  const user = data.users.find(item => item.id === key || item.email === key || item.name === key);
  if (user) return user.name;
  const employeesInDepartment = data.employees.filter(item => item.department === departmentName);
  const categoryMatch = employeesInDepartment.find(item => normalizeRoleCategories(item.roleCategories).includes(roleCategory));
  if (categoryMatch) return `${categoryMatch.firstName} ${categoryMatch.lastName}`;
  const titleWord = roleCategory === "managerial" ? "manager" : "supervisor";
  const titleMatch = employeesInDepartment.find(item => String(item.jobTitle || "").toLowerCase().includes(titleWord));
  if (titleMatch) return `${titleMatch.firstName} ${titleMatch.lastName}`;
  return "Employee not found";
}

function employeeLookupKeys(employee) {
  if (!employee) return [];
  const fullName = `${employee.firstName || ""} ${employee.lastName || ""}`.trim();
  const keys = [employee.id, employee.employeeId, employee.userId, employee.email, fullName].filter(Boolean).map(String);
  const employeeId = String(employee.employeeId || employee.id || "");
  const numeric = employeeId.match(/(\d+)$/)?.[1];
  if (numeric) {
    const compactNumber = String(Number(numeric));
    const isManagerRecord = /^MGR-/i.test(employeeId) || normalizeRoleCategories(employee.roleCategories).includes("managerial");
    if (isManagerRecord) {
      keys.push(`emp-mgr-${compactNumber}`, `emp-mgr-${numeric}`, `MGR-${compactNumber}`, `MGR-${numeric}`, `MGR-${numeric.padStart(3, "0")}`, `MGR-${numeric.padStart(4, "0")}`);
    } else {
      keys.push(`emp-${compactNumber}`, `emp-${numeric}`, `emp-${numeric.padStart(3, "0")}`, `EMP-${compactNumber}`, `EMP-${numeric}`, `EMP-${numeric.padStart(3, "0")}`, `EMP-${numeric.padStart(4, "0")}`);
    }
  }
  return [...new Set(keys.flatMap(key => [key, key.toLowerCase(), key.toUpperCase()]))];
}

function kpiMatchesEmployee(kpi, employee) {
  const departmentMatch = kpi.department === "All" || kpi.department === employee.department;
  const roleMatch = kpi.jobRole === "All" || kpi.jobRole === employee.jobTitle;
  return kpi.status !== "archived" && departmentMatch && roleMatch;
}

function managerCanAccessEmployee(user, employee) {
  if (!employee) return false;
  return managerAssignedEmployees(user).some(item => item.id === employee.id || item.employeeId === employee.employeeId);
}

function appraisalQueueFor(user, employees) {
  const periodId = user.selectedPeriodId || data.appraisalPeriods.find(p => p.status === "open")?.id || data.appraisalPeriods[0]?.id;
  const allVisible = [Roles.SUPER_ADMIN, Roles.HR_ADMIN].includes(user.role)
    ? data.appraisals.map(decorateAppraisal)
    : employees.map(employee => {
        const appraisal = data.appraisals.find(a => a.employeeId === employee.id && a.periodId === periodId);
        if (appraisal) return decorateAppraisal(appraisal);
        return decorateAppraisal(makeEmptyAppraisal(employee, periodId));
      });
  return allVisible;
}

function makeEmptyAppraisal(employee, periodId) {
  const template = templateFor(employee);
  const items = template?.items?.length
    ? template.items
    : data.kpiMaster.filter(kpi => kpiMatchesEmployee(kpi, employee));
  return {
    id: `queue-${employee.id}-${periodId}`,
    employeeId: employee.id,
    periodId,
    managerUserId: employee.lineManagerUserId,
    status: "Not Started",
    overallComment: "",
    strengths: "",
    improvement: "",
    trainingRecommendation: "",
    promotionRecommendation: "",
    confirmationRecommendation: "",
    hrComment: "",
    published: false,
    acknowledged: false,
    scores: items.map((item, index) => ({
      id: `queue-${employee.id}-score-${index + 1}`,
      title: item.title,
      weight: item.weight,
      target: "Meet or exceed approved target",
      score: 18,
      actualResult: "",
      managerComment: "",
      evidenceNote: "",
      employeeComment: "",
      managerConfirmedEmployeeComment: false
    }))
  };
}

function decorateAppraisal(appraisal) {
  const employee = data.employees.find(e => e.id === appraisal.employeeId);
  const score = finalScore(appraisal);
  return { ...appraisal, employee, finalScore: score, rating: ratingForScore(score) };
}

function reports() {
  const decorated = data.appraisals.map(decorateAppraisal);
  const byDepartment = data.departments.map(department => {
    const rows = decorated.filter(a => a.employee?.department === department.name);
    const average = rows.length ? Math.round(rows.reduce((s, a) => s + a.finalScore, 0) / rows.length * 100) / 100 : 0;
    return { department: department.name, appraisals: rows.length, average };
  });
  return {
    completion: {
      total: decorated.length,
      totalEmployees: data.employees.length,
      approved: decorated.filter(a => ["Approved", "Published", "Acknowledged"].includes(a.status)).length,
      completed: decorated.filter(a => ["Approved", "Published", "Acknowledged"].includes(a.status)).length,
      pending: decorated.filter(a => ["Draft", "Submitted", "Returned"].includes(a.status)).length
    },
    topPerformers: decorated.filter(a => a.finalScore >= 4).map(a => `${a.employee.firstName} ${a.employee.lastName}`),
    needsImprovement: decorated.filter(a => a.finalScore < 3).map(a => `${a.employee.firstName} ${a.employee.lastName}`),
    trainingNeeds: decorated.map(a => ({ employee: `${a.employee.firstName} ${a.employee.lastName}`, recommendation: a.trainingRecommendation })),
    byDepartment
  };
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  return serveStatic(req, res, url);
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`HR Performance App running at http://localhost:${port}`);
});
