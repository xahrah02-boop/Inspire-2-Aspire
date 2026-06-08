var SHEETS = {
  users: "Users",
  employees: "Employees",
  departments: "Departments",
  jobRoles: "JobRoles",
  kpiMaster: "KpiMaster",
  templates: "KpiTemplates",
  periods: "AppraisalPeriods",
  appraisals: "Appraisals",
  auditLogs: "AuditLogs"
};

function doGet(e) {
  return handleRequest_(e, "GET");
}

function doPost(e) {
  return handleRequest_(e, "POST");
}

function handleRequest_(e, method) {
  try {
    const path = String(e.parameter.path || "");
    const body = parseBody_(e);
    const token = e.parameter.token || body.token || "";
    const user = token ? getUserByToken_(token) : null;

    if (path === "/api/login" && method === "POST") return json_({ user: login_(body) });
    if (!user && path !== "/api/health") return json_({ error: "Authentication required." }, 401);
    if (path === "/api/health") return json_({ ok: true });
    if (path === "/api/me") return json_({ user: publicUser_(user), dashboard: dashboardFor_(user), notifications: [] });
    if (path === "/api/bootstrap") return json_(bootstrap_(user));
    if (path === "/api/departments" && method === "POST") return json_(createDepartment_(user, body), 201);
    if (path.indexOf("/api/departments/") === 0 && method === "POST") return json_(updateDepartment_(user, path.split("/").pop(), body));
    if (path === "/api/job-roles" && method === "POST") return json_(createJobRole_(user, body), 201);
    if (path.indexOf("/api/job-roles/") === 0 && method === "POST") return json_(updateJobRole_(user, path.split("/").pop(), body));
    if (path === "/api/employees" && method === "POST") return json_(createEmployee_(user, body), 201);
    if (path.indexOf("/api/employees/") === 0 && method === "POST") return json_(updateEmployee_(user, path.split("/").pop(), body));
    if (path === "/api/kpis" && method === "POST") return json_(createKpi_(user, body), 201);
    if (path.indexOf("/api/kpis/") === 0 && path.indexOf("/delete") !== -1 && method === "POST") return json_(deleteKpi_(user, path.split("/")[3]));
    if (path.indexOf("/api/kpis/") === 0 && body.action === "delete" && method === "POST") return json_(deleteKpi_(user, path.split("/").pop()));
    if (path.indexOf("/api/kpis/") === 0 && method === "POST") return json_(updateKpi_(user, path.split("/").pop(), body));
    if (path === "/api/templates" && method === "POST") return json_(createTemplate_(user, body), 201);
    if (path.indexOf("/api/templates/") === 0 && method === "POST") return json_(updateTemplate_(user, path.split("/").pop(), body));
    if (path === "/api/my-kpi-comments" && method === "POST") return json_(saveEmployeeKpiComments_(user, body));
    if (path.indexOf("/api/appraisals/") === 0 && method === "POST") return json_(updateAppraisal_(user, path.split("/").pop(), body));
    return json_({ error: "Route not found.", path }, 404);
  } catch (error) {
    return json_({ error: error.message }, 400);
  }
}

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.values(SHEETS).forEach(name => {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
  setHeaders_("Users", ["id", "email", "name", "role", "status", "password", "token"]);
  setHeaders_("Employees", ["id", "employeeId", "firstName", "lastName", "email", "phone", "department", "jobTitle", "lineManagerUserId", "status", "userAccountStatus", "templateId", "roleCategories", "userId", "workLocation", "emergencyContact", "notes"]);
  setHeaders_("Departments", ["id", "name", "managerialRole", "supervisoryRole", "status"]);
  setHeaders_("JobRoles", ["id", "title", "department", "status"]);
  setHeaders_("KpiMaster", ["id", "code", "title", "description", "category", "department", "jobRole", "formula", "target", "weight", "scoringGuide", "dataSource", "frequency", "status"]);
  setHeaders_("KpiTemplates", ["id", "name", "department", "jobRole", "status", "itemsJson"]);
  setHeaders_("AppraisalPeriods", ["id", "name", "startDate", "endDate", "type", "status", "departmentsJson"]);
  setHeaders_("Appraisals", ["id", "employeeId", "periodId", "managerUserId", "status", "scoresJson", "overallComment", "hrComment", "published", "acknowledged"]);
  setHeaders_("AuditLogs", ["id", "userId", "action", "module", "record", "oldValue", "newValue", "createdAt"]);
  seedIfEmpty_();
  ensureKpiMasterSeeds_();
}

function seedIfEmpty_() {
  if (readRows_("Users").length) return;
  appendRow_("Users", { id: "u-hr", email: "hr.admin@company.test", name: "HR Admin", role: "HR_ADMIN", status: "active", password: "Password123!", token: "" });
  appendRow_("Users", { id: "u-mgr-1", email: "grace.manager@company.test", name: "Grace Okafor", role: "LINE_MANAGER", status: "active", password: "Password123!", token: "" });
  appendRow_("Users", { id: "u-emp-1", email: "john.operator@company.test", name: "John Okorie", role: "EMPLOYEE", status: "active", password: "Password123!", token: "" });
  appendRow_("Departments", { id: "dept-1", name: "Production", managerialRole: "emp-1", supervisoryRole: "emp-1", status: "active" });
  appendRow_("JobRoles", { id: "role-1", title: "Production Operator", department: "Production", status: "active" });
  appendRow_("Employees", { id: "emp-1", employeeId: "EMP-0001", firstName: "John", lastName: "Okorie", email: "john.operator@company.test", phone: "", department: "Production", jobTitle: "Production Operator", lineManagerUserId: "u-mgr-1", status: "confirmed", userAccountStatus: "active", templateId: "tpl-prod", roleCategories: "staff", userId: "u-emp-1", workLocation: "Plant A", emergencyContact: "", notes: "" });
  appendRow_("KpiTemplates", { id: "tpl-prod", name: "Production Operator KPI Template", department: "Production", jobRole: "Production Operator", status: "active", itemsJson: JSON.stringify([{ id: "tpl-prod-1", title: "Output achievement", weight: 25 }, { id: "tpl-prod-2", title: "Quality of work", weight: 20 }, { id: "tpl-prod-3", title: "Attendance", weight: 55 }]) });
  appendRow_("AppraisalPeriods", { id: "period-1", name: "Current Annual Review", startDate: "2026-01-01", endDate: "2026-12-31", type: "annual", status: "open", departmentsJson: JSON.stringify(["Production"]) });
}

function ensureKpiMasterSeeds_() {
  ensureDepartment_("Production");
  ensureDepartment_("Sales");
  ensureJobRole_("Production Operator", "Production");
  ensureJobRole_("Sales Officer", "Sales");
  ensureKpi_("kpi-prod-001", "KPI-PROD-001", "Output achievement", "Production", "Production Operator", "Job-specific performance", 25);
  ensureKpi_("kpi-prod-002", "KPI-PROD-002", "Quality of work", "Production", "Production Operator", "Quality of work", 20);
  ensureKpi_("kpi-prod-003", "KPI-PROD-003", "Waste control", "Production", "Production Operator", "Productivity", 15);
  ensureKpi_("kpi-sales-001", "KPI-SALES-001", "Sales volume achievement", "Sales", "Sales Officer", "Job-specific performance", 25);
  ensureKpi_("kpi-sales-002", "KPI-SALES-002", "Revenue achievement", "Sales", "Sales Officer", "Productivity", 20);
  ensureTemplate_("tpl-sales", "Sales Officer KPI Template", "Sales", "Sales Officer", [
    { id: "tpl-sales-1", title: "Sales volume achievement", weight: 25 },
    { id: "tpl-sales-2", title: "Revenue achievement", weight: 20 },
    { id: "tpl-sales-3", title: "New customer acquisition", weight: 15 },
    { id: "tpl-sales-4", title: "Customer retention", weight: 40 }
  ]);
}

function ensureDepartment_(name) {
  const exists = readRows_("Departments").some(function(row) { return row.name === name; });
  if (!exists) appendRow_("Departments", { id: "dept-" + Date.now() + "-" + name.replace(/\W/g, ""), name: name, managerialRole: "", supervisoryRole: "", status: "active" });
}

function ensureJobRole_(title, department) {
  const exists = readRows_("JobRoles").some(function(row) { return row.title === title && row.department === department; });
  if (!exists) appendRow_("JobRoles", { id: "role-" + Date.now() + "-" + title.replace(/\W/g, ""), title: title, department: department, status: "active" });
}

function ensureKpi_(id, code, title, department, jobRole, category, weight) {
  const exists = readRows_("KpiMaster").some(function(row) { return row.code === code; });
  if (exists) return;
  appendRow_("KpiMaster", {
    id: id,
    code: code,
    title: title,
    description: title + " measured against approved departmental expectations.",
    category: category,
    department: department,
    jobRole: jobRole,
    formula: "Actual performance / target performance",
    target: "Meet or exceed target",
    weight: weight,
    scoringGuide: "Use approved evidence and score fairly.",
    dataSource: "Manager evidence",
    frequency: "quarterly",
    status: "active"
  });
}

function ensureTemplate_(id, name, department, jobRole, items) {
  const exists = readRows_("KpiTemplates").some(function(row) { return row.id === id || row.name === name; });
  if (!exists) appendRow_("KpiTemplates", { id: id, name: name, department: department, jobRole: jobRole, status: "active", itemsJson: JSON.stringify(items) });
}

function login_(body) {
  const user = readRows_("Users").find(row => row.email === body.email && row.password === body.password && row.status === "active");
  if (!user) throw new Error("Invalid email or password.");
  user.token = Utilities.getUuid();
  updateRow_("Users", user.id, user);
  return publicUser_(user);
}

function publicUser_(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, token: user.token };
}

function getUserByToken_(token) {
  return readRows_("Users").find(row => row.token === token && row.status === "active");
}

function bootstrap_(user) {
  const employees = visibleEmployees_(user);
  const allKpis = readRows_("KpiMaster");
  const visibleKpis = user.role === "EMPLOYEE" ? allKpis.filter(function(kpi) {
    return employees.some(function(employee) {
      return kpiMatchesEmployee_(kpi, employee);
    });
  }) : allKpis;
  const appraisals = readRows_("Appraisals").map(parseAppraisal_).filter(appraisal => {
    return user.role === "HR_ADMIN" || employees.some(employee => employee.id === appraisal.employeeId);
  });
  return {
    user: publicUser_(user),
    dashboard: dashboardFor_(user),
    departments: readRows_("Departments"),
    jobRoles: readRows_("JobRoles"),
    employees,
    kpiMaster: visibleKpis,
    templates: readRows_("KpiTemplates").map(parseTemplate_),
    periods: readRows_("AppraisalPeriods").map(parsePeriod_),
    appraisals,
    reports: reports_(),
    guides: [],
    auditLogs: user.role === "HR_ADMIN" ? readRows_("AuditLogs") : []
  };
}

function kpiMatchesEmployee_(kpi, employee) {
  const departmentMatch = kpi.department === "All" || kpi.department === employee.department;
  const roleMatch = kpi.jobRole === "All" || kpi.jobRole === employee.jobTitle;
  return kpi.status !== "archived" && departmentMatch && roleMatch;
}

function visibleEmployees_(user) {
  const employees = readRows_("Employees");
  if (user.role === "HR_ADMIN") return employees;
  if (user.role === "LINE_MANAGER") {
    const managerEmployeeIds = employees.filter(function(employee) {
      return employee.userId === user.id;
    }).map(function(employee) {
      return employee.id;
    });
    return employees.filter(function(employee) {
      return employee.lineManagerUserId === user.id || managerEmployeeIds.indexOf(employee.lineManagerUserId) !== -1;
    });
  }
  return employees.filter(employee => employee.userId === user.id);
}

function createDepartment_(user, body) {
  requireRole_(user, ["HR_ADMIN"]);
  if (!body.name) throw new Error("Department name is required.");
  const department = {
    id: "dept-" + Date.now(),
    name: body.name,
    managerialRole: body.managerialRole || "",
    supervisoryRole: body.supervisoryRole || "",
    status: body.status || "active"
  };
  appendRow_("Departments", department);
  audit_(user, "Department created", "Department Master", department.name, "", JSON.stringify(department));
  return department;
}

function updateDepartment_(user, id, body) {
  requireRole_(user, ["HR_ADMIN"]);
  const department = readById_("Departments", id);
  const oldName = department.name;
  const oldValue = JSON.stringify(department);
  department.name = body.name || department.name;
  department.managerialRole = body.managerialRole !== undefined ? body.managerialRole : department.managerialRole;
  department.supervisoryRole = body.supervisoryRole !== undefined ? body.supervisoryRole : department.supervisoryRole;
  department.status = body.status || department.status || "active";
  updateRow_("Departments", id, department);
  if (oldName !== department.name) renameDepartmentReferences_(oldName, department.name);
  audit_(user, "Department updated", "Department Master", department.name, oldValue, JSON.stringify(department));
  return department;
}

function createJobRole_(user, body) {
  requireRole_(user, ["HR_ADMIN"]);
  if (!body.title || !body.department) throw new Error("Job role requires a title and department.");
  const role = {
    id: "role-" + Date.now(),
    title: body.title,
    department: body.department,
    status: body.status || "active"
  };
  appendRow_("JobRoles", role);
  audit_(user, "Job role created", "Department Master", role.title, "", JSON.stringify(role));
  return role;
}

function updateJobRole_(user, id, body) {
  requireRole_(user, ["HR_ADMIN"]);
  const role = readById_("JobRoles", id);
  const oldTitle = role.title;
  const oldValue = JSON.stringify(role);
  role.title = body.title || role.title;
  role.department = body.department || role.department;
  role.status = body.status || role.status || "active";
  updateRow_("JobRoles", id, role);
  if (oldTitle !== role.title) renameJobRoleReferences_(oldTitle, role.title);
  audit_(user, "Job role updated", "Department Master", role.title, oldValue, JSON.stringify(role));
  return role;
}

function renameDepartmentReferences_(oldName, newName) {
  updateMatchingRows_("Employees", "department", oldName, function(row) { row.department = newName; return row; });
  updateMatchingRows_("JobRoles", "department", oldName, function(row) { row.department = newName; return row; });
  updateMatchingRows_("KpiMaster", "department", oldName, function(row) { row.department = newName; return row; });
  updateMatchingRows_("KpiTemplates", "department", oldName, function(row) { row.department = newName; return row; });
}

function renameJobRoleReferences_(oldTitle, newTitle) {
  updateMatchingRows_("Employees", "jobTitle", oldTitle, function(row) { row.jobTitle = newTitle; return row; });
  updateMatchingRows_("KpiMaster", "jobRole", oldTitle, function(row) { row.jobRole = newTitle; return row; });
  updateMatchingRows_("KpiTemplates", "jobRole", oldTitle, function(row) { row.jobRole = newTitle; return row; });
}

function createEmployee_(user, body) {
  requireRole_(user, ["HR_ADMIN"]);
  const id = "emp-" + Date.now();
  const userId = "u-emp-" + Date.now();
  const employee = Object.assign({ id, userId, userAccountStatus: "active", roleCategories: "staff" }, body);
  employee.employeeId = employee.employeeId || nextEmployeeId_();
  employee.roleCategories = normalizeRoleCategories_(employee.roleCategories).join(", ");
  employee.templateId = templateIdForEmployee_(employee);
  appendRow_("Users", { id: userId, email: body.email, name: body.firstName + " " + body.lastName, role: accountRoleForCategories_(employee.roleCategories), status: "active", password: "Password123!", token: "" });
  appendRow_("Employees", employee);
  audit_(user, "Employee created", "Employee Master", employee.employeeId, "", employee.email);
  return employee;
}

function updateEmployee_(user, id, body) {
  requireRole_(user, ["HR_ADMIN"]);
  if (body.roleCategories !== undefined) body.roleCategories = normalizeRoleCategories_(body.roleCategories).join(", ");
  const employee = Object.assign(readById_("Employees", id), body);
  employee.employeeId = employee.employeeId || nextEmployeeId_();
  employee.templateId = templateIdForEmployee_(employee);
  updateRow_("Employees", id, employee);
  updateLinkedEmployeeUser_(employee);
  audit_(user, "Employee updated", "Employee Master", employee.employeeId, "", JSON.stringify(body));
  return employee;
}

function normalizeRoleCategories_(value) {
  const source = Array.isArray(value) ? value : String(value || "staff").split(",");
  const seen = {};
  const result = [];
  source.forEach(function(item) {
    const role = String(item || "").trim();
    if (role && !seen[role]) {
      seen[role] = true;
      result.push(role);
    }
  });
  return result.length ? result : ["staff"];
}

function accountRoleForCategories_(value) {
  const categories = normalizeRoleCategories_(value);
  return categories.indexOf("managerial") !== -1 || categories.indexOf("supervisory") !== -1 ? "LINE_MANAGER" : "EMPLOYEE";
}

function templateIdForEmployee_(employee) {
  if (employee.templateId) return employee.templateId;
  const template = readRows_("KpiTemplates").map(parseTemplate_).find(function(row) {
    return row.jobRole === employee.jobTitle && row.status !== "archived";
  });
  return template ? template.id : "";
}

function updateLinkedEmployeeUser_(employee) {
  if (!employee.userId) return;
  const linkedUser = readById_("Users", employee.userId);
  linkedUser.email = employee.email;
  linkedUser.name = employee.firstName + " " + employee.lastName;
  linkedUser.role = accountRoleForCategories_(employee.roleCategories);
  linkedUser.status = employee.userAccountStatus === "active" ? "active" : "inactive";
  updateRow_("Users", linkedUser.id, linkedUser);
}

function nextEmployeeId_() {
  const maxNumber = readRows_("Employees").reduce(function(max, employee) {
    const match = String(employee.employeeId || "").match(/(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const nextNumber = String(maxNumber + 1);
  return "EMP-" + ("0000" + nextNumber).slice(-4);
}

function createKpi_(user, body) {
  requireRole_(user, ["HR_ADMIN"]);
  const kpi = Object.assign({ id: "kpi-" + Date.now(), status: "active" }, body);
  appendRow_("KpiMaster", kpi);
  return kpi;
}

function updateKpi_(user, id, body) {
  requireRole_(user, ["HR_ADMIN"]);
  const kpi = Object.assign(readById_("KpiMaster", id), body);
  updateRow_("KpiMaster", id, kpi);
  return kpi;
}

function deleteKpi_(user, id) {
  requireRole_(user, ["HR_ADMIN"]);
  const kpi = readById_("KpiMaster", id);
  deleteRow_("KpiMaster", id);
  audit_(user, "KPI deleted", "KPI Master", kpi.code, JSON.stringify(kpi), "");
  return { ok: true, id: id };
}

function createTemplate_(user, body) {
  requireRole_(user, ["HR_ADMIN"]);
  const items = body.items || [];
  validateTemplateWeight_(items);
  const template = {
    id: "tpl-" + Date.now(),
    name: body.name,
    department: body.department,
    jobRole: body.jobRole,
    status: body.status || "active",
    itemsJson: JSON.stringify(items)
  };
  appendRow_("KpiTemplates", template);
  audit_(user, "KPI template created", "KPI Templates", template.name, "", JSON.stringify(template));
  return parseTemplate_(template);
}

function updateTemplate_(user, id, body) {
  requireRole_(user, ["HR_ADMIN"]);
  const template = readById_("KpiTemplates", id);
  const oldValue = JSON.stringify(template);
  if (body.items) validateTemplateWeight_(body.items);
  template.name = body.name || template.name;
  template.department = body.department || template.department;
  template.jobRole = body.jobRole || template.jobRole;
  template.status = body.status || template.status || "active";
  if (body.items) template.itemsJson = JSON.stringify(body.items);
  updateRow_("KpiTemplates", id, template);
  audit_(user, "KPI template updated", "KPI Templates", template.name, oldValue, JSON.stringify(template));
  return parseTemplate_(template);
}

function validateTemplateWeight_(items) {
  const total = (items || []).reduce(function(sum, item) {
    return sum + Number(item.weight || 0);
  }, 0);
  if (total !== 100) throw new Error("KPI template weight must equal 100%.");
}

function saveEmployeeKpiComments_(user, body) {
  requireRole_(user, ["EMPLOYEE"]);
  const employee = readRows_("Employees").find(row => row.userId === user.id);
  if (!employee) throw new Error("Employee profile not found.");
  let appraisal = readRows_("Appraisals").map(parseAppraisal_).find(row => row.employeeId === employee.id && row.periodId === body.periodId);
  if (!appraisal) {
    appraisal = makeAppraisal_(employee, body.periodId);
    appendRow_("Appraisals", serializeAppraisal_(appraisal));
  }
  appraisal.scores.forEach(score => {
    const item = (body.comments || []).find(comment => comment.scoreId === score.id || comment.title === score.title);
    if (item) {
      score.employeeComment = item.employeeComment || "";
      score.managerConfirmedEmployeeComment = false;
    }
  });
  updateRow_("Appraisals", appraisal.id, serializeAppraisal_(appraisal));
  return appraisal;
}

function updateAppraisal_(user, id, body) {
  const appraisal = parseAppraisal_(readById_("Appraisals", id));
  if (user.role === "LINE_MANAGER") {
    const employee = readById_("Employees", appraisal.employeeId);
    if (!managerCanAccessEmployee_(user, employee)) throw new Error("Line managers can only update assigned employees.");
    if (body.confirmEmployeeComments) appraisal.scores.forEach(score => score.managerConfirmedEmployeeComment = true);
    if (body.scores) appraisal.scores = body.scores;
    if (body.submit) appraisal.status = "Submitted";
  }
  updateRow_("Appraisals", id, serializeAppraisal_(appraisal));
  return appraisal;
}

function dashboardFor_(user) {
  const employees = visibleEmployees_(user);
  return { cards: [["Total employees", employees.length], ["Departments", readRows_("Departments").length], ["Open periods", readRows_("AppraisalPeriods").filter(p => p.status === "open").length]] };
}

function managerCanAccessEmployee_(user, employee) {
  const employees = readRows_("Employees");
  const managerEmployeeIds = employees.filter(function(item) {
    return item.userId === user.id;
  }).map(function(item) {
    return item.id;
  });
  return employee.lineManagerUserId === user.id || managerEmployeeIds.indexOf(employee.lineManagerUserId) !== -1;
}

function reports_() {
  return { completion: { completed: 0, pending: 0 }, byDepartment: [], trainingNeeds: [] };
}

function makeAppraisal_(employee, periodId) {
  const templates = readRows_("KpiTemplates").map(parseTemplate_);
  const template = templates.find(row => row.id === employee.templateId)
    || templates.find(row => row.jobRole === employee.jobTitle && row.status !== "archived");
  const items = template ? template.items : readRows_("KpiMaster").filter(function(kpi) {
    return kpiMatchesEmployee_(kpi, employee);
  });
  return {
    id: "app-" + Date.now(),
    employeeId: employee.id,
    periodId,
    managerUserId: employee.lineManagerUserId,
    status: "Draft",
    scores: items.map((item, i) => ({ id: "score-" + Date.now() + "-" + i, title: item.title, weight: item.weight, target: item.target || "", score: 18, employeeComment: "", managerConfirmedEmployeeComment: false }))
  };
}

function parseTemplate_(row) {
  row.items = safeJson_(row.itemsJson, []);
  return row;
}

function parsePeriod_(row) {
  row.departments = safeJson_(row.departmentsJson, []);
  return row;
}

function parseAppraisal_(row) {
  row.scores = safeJson_(row.scoresJson, []);
  return row;
}

function serializeAppraisal_(appraisal) {
  const row = Object.assign({}, appraisal);
  row.scoresJson = JSON.stringify(appraisal.scores || []);
  delete row.scores;
  return row;
}

function safeJson_(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch (e) { return fallback; }
}

function requireRole_(user, roles) {
  if (user.role === "SUPER_ADMIN" && roles.indexOf("HR_ADMIN") !== -1) return;
  if (roles.indexOf(user.role) === -1) throw new Error("Not allowed.");
}

function audit_(user, action, module, record, oldValue, newValue) {
  appendRow_("AuditLogs", { id: "audit-" + Date.now(), userId: user.id, action, module, record, oldValue, newValue, createdAt: new Date().toISOString() });
}

function setHeaders_(sheetName, headers) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
}

function readRows_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row.some(cell => cell !== "")).map(row => {
    const obj = {};
    headers.forEach((header, i) => obj[header] = row[i]);
    return obj;
  });
}

function readById_(sheetName, id) {
  const row = readRows_(sheetName).find(item => item.id === id);
  if (!row) throw new Error(sheetName + " record not found.");
  return row;
}

function appendRow_(sheetName, obj) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(header => obj[header] || ""));
}

function updateRow_(sheetName, id, obj) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === id) {
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([headers.map(header => obj[header] || "")]);
      return;
    }
  }
  throw new Error(sheetName + " record not found.");
}

function deleteRow_(sheetName, id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === id) {
      sheet.deleteRow(r + 1);
      return;
    }
  }
  throw new Error(sheetName + " record not found.");
}

function updateMatchingRows_(sheetName, fieldName, fieldValue, mapper) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0];
  const fieldIndex = headers.indexOf(fieldName);
  if (fieldIndex === -1) return;
  for (let r = 1; r < values.length; r++) {
    if (values[r][fieldIndex] === fieldValue) {
      const row = {};
      headers.forEach((header, i) => row[header] = values[r][i]);
      const updated = mapper(row);
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([headers.map(header => updated[header] || "")]);
    }
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try { return JSON.parse(e.postData.contents); } catch (error) { return {}; }
}

function json_(payload, status) {
  const output = ContentService.createTextOutput(JSON.stringify(Object.assign({ status: status || 200 }, payload)));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
