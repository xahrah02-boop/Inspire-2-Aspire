// Read-model + shared domain helpers. Reads come from a per-request snapshot of
// the SQLite collections (arrays), so this logic stays close to the original
// in-memory implementation while writes go through the collections directly.

import { collection } from "../db/index.js";
import { Roles, canViewEmployee } from "../core/rbac.js";
import { calculateFinalScore, ratingForScore, scorePercentage } from "../core/scoring.js";

const READ_COLLECTIONS = [
  "users", "departments", "jobRoles", "categories", "kpiMaster", "templates",
  "employees", "appraisalPeriods", "appraisals", "notifications", "guides", "auditLogs"
];

export function snapshot() {
  const data = {};
  for (const name of READ_COLLECTIONS) data[name] = collection(name).all();
  return data;
}

export function audit(user, action, module, record, oldValue = "", newValue = "") {
  collection("auditLogs").save({
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    userId: user?.id || "system",
    action, module, record, oldValue, newValue,
    createdAt: new Date().toISOString()
  });
}

export function publicUser(user) {
  if (!user) return user;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function normalizeRoleCategories(value) {
  const list = Array.isArray(value) ? value : String(value || "staff").split(",");
  const clean = [...new Set(list.map(item => String(item).trim()).filter(Boolean))];
  return clean.length ? clean : ["staff"];
}

export function accountRoleForCategories(value) {
  const categories = normalizeRoleCategories(value);
  return categories.includes("managerial") || categories.includes("supervisory")
    ? Roles.LINE_MANAGER : Roles.EMPLOYEE;
}

export function normalizeList(value) {
  if (Array.isArray(value)) return value;
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean);
}

export function employeeLookupKeys(employee) {
  if (!employee) return [];
  const fullName = `${employee.firstName || ""} ${employee.lastName || ""}`.trim();
  const keys = [employee.id, employee.employeeId, employee.userId, employee.email, fullName].filter(Boolean).map(String);
  const employeeId = String(employee.employeeId || employee.id || "");
  const numeric = employeeId.match(/(\d+)$/)?.[1];
  if (numeric) {
    const compact = String(Number(numeric));
    const isManager = /^MGR-/i.test(employeeId) || normalizeRoleCategories(employee.roleCategories).includes("managerial");
    if (isManager) {
      keys.push(`emp-mgr-${compact}`, `emp-mgr-${numeric}`, `MGR-${compact}`, `MGR-${numeric}`, `MGR-${numeric.padStart(3, "0")}`, `MGR-${numeric.padStart(4, "0")}`);
    } else {
      keys.push(`emp-${compact}`, `emp-${numeric}`, `emp-${numeric.padStart(3, "0")}`, `EMP-${compact}`, `EMP-${numeric}`, `EMP-${numeric.padStart(3, "0")}`, `EMP-${numeric.padStart(4, "0")}`);
    }
  }
  return [...new Set(keys.flatMap(key => [key, key.toLowerCase(), key.toUpperCase()]))];
}

export function uniqueById(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const key = row.id || row.employeeId || row.userId || row.email;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function templateFor(data, employee) {
  return data.templates.find(t => t.id === employee.templateId)
    || data.templates.find(t => t.jobRole === employee.jobTitle && t.status !== "archived");
}

export function templateIdForEmployeeBody(data, body) {
  if (body.templateId) return body.templateId;
  return data.templates.find(t => t.jobRole === body.jobTitle && t.status !== "archived")?.id || "";
}

export function kpiMatchesEmployee(kpi, employee) {
  const departmentMatch = kpi.department === "All" || kpi.department === employee.department;
  const roleMatch = kpi.jobRole === "All" || kpi.jobRole === employee.jobTitle;
  return kpi.status !== "archived" && departmentMatch && roleMatch;
}

export function nextEmployeeId(data) {
  const max = data.employees.reduce((acc, e) => {
    const match = String(e.employeeId || "").match(/(\d+)$/);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}

function managerKeys(data, user) {
  return [
    user.id,
    ...data.employees.filter(e => e.userId === user.id).flatMap(e => employeeLookupKeys(e))
  ].filter(Boolean);
}

function managerDepartmentNames(data, user) {
  const keys = managerKeys(data, user);
  return data.departments
    .filter(d => [d.head, d.managerialRole, d.supervisoryRole].some(v =>
      keys.includes(String(v || "")) || keys.includes(String(v || "").toLowerCase()) || keys.includes(String(v || "").toUpperCase())))
    .map(d => d.name);
}

export function managerAssignedEmployees(data, user) {
  const keys = managerKeys(data, user);
  const departments = managerDepartmentNames(data, user);
  return data.employees.filter(e =>
    e.userId !== user.id &&
    (keys.includes(String(e.lineManagerUserId || "")) ||
     keys.includes(String(e.lineManagerUserId || "").toLowerCase()) ||
     keys.includes(String(e.lineManagerUserId || "").toUpperCase()) ||
     departments.includes(e.department))
  );
}

export function managerCanAccessEmployee(data, user, employee) {
  if (!employee) return false;
  return managerAssignedEmployees(data, user).some(e => e.id === employee.id || e.employeeId === employee.employeeId);
}

export function visibleEmployees(data, user) {
  if (user.role === Roles.LINE_MANAGER) {
    const own = data.employees.filter(e => e.userId === user.id);
    return uniqueById([...own, ...managerAssignedEmployees(data, user)]);
  }
  return data.employees.filter(e => canViewEmployee(user, e));
}

export function appraisalForEmployee(data, employeeId) {
  return data.appraisals.find(a => a.employeeId === employeeId);
}

export function decorateAppraisal(data, appraisal) {
  const employee = data.employees.find(e => e.id === appraisal.employeeId);
  const score = calculateFinalScore(appraisal.scores);
  return { ...appraisal, employee, finalScore: score, rating: ratingForScore(score), percentage: scorePercentage(score) };
}

export function makeEmptyAppraisal(data, employee, periodId) {
  const template = templateFor(data, employee);
  const items = template?.items?.length
    ? template.items
    : data.kpiMaster.filter(kpi => kpiMatchesEmployee(kpi, employee));
  return {
    id: `queue-${employee.id}-${periodId}`,
    employeeId: employee.id,
    periodId,
    managerUserId: employee.lineManagerUserId,
    status: "Not Started",
    overallComment: "", strengths: "", improvement: "",
    trainingRecommendation: "", promotionRecommendation: "", confirmationRecommendation: "",
    hrComment: "", published: false, acknowledged: false,
    scores: items.map((item, index) => ({
      id: `queue-${employee.id}-score-${index + 1}`,
      title: item.title,
      weight: item.weight,
      target: "Meet or exceed approved target",
      score: 3,
      actualResult: "",
      managerComment: "",
      evidenceNote: "",
      evidenceFileId: "",
      employeeComment: "",
      managerConfirmedEmployeeComment: false
    }))
  };
}

export function appraisalQueueFor(data, user, employees) {
  const periodId = data.appraisalPeriods.find(p => p.status === "open")?.id || data.appraisalPeriods[0]?.id;
  if ([Roles.SUPER_ADMIN, Roles.HR_ADMIN].includes(user.role)) {
    return data.appraisals.map(a => decorateAppraisal(data, a));
  }
  return employees.map(employee => {
    const existing = data.appraisals.find(a => a.employeeId === employee.id && a.periodId === periodId);
    return decorateAppraisal(data, existing || makeEmptyAppraisal(data, employee, periodId));
  });
}

export function dashboardFor(data, user) {
  const totals = {
    employees: data.employees.length,
    departments: data.departments.length,
    activePeriods: data.appraisalPeriods.filter(p => p.status === "open").length,
    pendingAppraisals: data.appraisals.filter(a => ["Draft", "Submitted", "Returned"].includes(a.status)).length,
    completedAppraisals: data.appraisals.filter(a => ["Approved", "Published", "Acknowledged"].includes(a.status)).length
  };
  if (user.role === Roles.LINE_MANAGER) {
    const myEmployees = managerAssignedEmployees(data, user);
    const myAppraisals = appraisalQueueFor(data, user, myEmployees);
    return {
      cards: [
        ["My assigned employees", myEmployees.length],
        ["Appraisals due", myAppraisals.filter(a => a.status === "Not Started").length],
        ["Draft appraisals", myAppraisals.filter(a => a.status === "Draft").length],
        ["Submitted appraisals", myAppraisals.filter(a => a.status === "Submitted").length],
        ["Performance attention", myAppraisals.filter(a => a.finalScore > 0 && a.finalScore < 2.5).length]
      ]
    };
  }
  if (user.role === Roles.EMPLOYEE) {
    const employee = data.employees.find(e => e.userId === user.id);
    return {
      cards: [
        ["My profile", employee ? employee.employeeId : "Missing"],
        ["Assigned KPIs", employee ? templateFor(data, employee)?.items.length || 0 : 0],
        ["Appraisal status", employee ? appraisalForEmployee(data, employee.id)?.status || "Not Started" : "No appraisal"],
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

export function reports(data) {
  const decorated = data.appraisals.map(a => decorateAppraisal(data, a));
  const byDepartment = data.departments.map(department => {
    const rows = decorated.filter(a => a.employee?.department === department.name);
    const average = rows.length ? Math.round(rows.reduce((s, a) => s + a.finalScore, 0) / rows.length * 100) / 100 : 0;
    return { department: department.name, appraisals: rows.length, average };
  });
  const name = a => `${a.employee?.firstName || ""} ${a.employee?.lastName || ""}`.trim();
  return {
    completion: {
      total: decorated.length,
      totalEmployees: data.employees.length,
      approved: decorated.filter(a => ["Approved", "Published", "Acknowledged"].includes(a.status)).length,
      completed: decorated.filter(a => ["Approved", "Published", "Acknowledged"].includes(a.status)).length,
      pending: decorated.filter(a => ["Draft", "Submitted", "Returned"].includes(a.status)).length
    },
    topPerformers: decorated.filter(a => a.finalScore >= 4).map(name),
    needsImprovement: decorated.filter(a => a.finalScore > 0 && a.finalScore < 2.5).map(name),
    trainingNeeds: decorated.map(a => ({ employee: name(a), recommendation: a.trainingRecommendation })),
    byDepartment
  };
}

function assigneeNameForDepartment(data, value, departmentName, roleCategory) {
  if (!value) return "Not assigned";
  const key = String(value).trim();
  const employee = data.employees.find(item =>
    employeeLookupKeys(item).includes(key) || employeeLookupKeys(item).includes(key.toLowerCase()) || employeeLookupKeys(item).includes(key.toUpperCase()));
  if (employee) return `${employee.firstName} ${employee.lastName}`;
  const user = data.users.find(item => item.id === key || item.email === key || item.name === key);
  if (user) return user.name;
  const inDept = data.employees.filter(item => item.department === departmentName);
  const categoryMatch = inDept.find(item => normalizeRoleCategories(item.roleCategories).includes(roleCategory));
  if (categoryMatch) return `${categoryMatch.firstName} ${categoryMatch.lastName}`;
  const titleWord = roleCategory === "managerial" ? "manager" : "supervisor";
  const titleMatch = inDept.find(item => String(item.jobTitle || "").toLowerCase().includes(titleWord));
  if (titleMatch) return `${titleMatch.firstName} ${titleMatch.lastName}`;
  return "Employee not found";
}

export function decorateDepartment(data, department) {
  return {
    ...department,
    managerialRoleName: assigneeNameForDepartment(data, department.managerialRole, department.name, "managerial"),
    supervisoryRoleName: assigneeNameForDepartment(data, department.supervisoryRole, department.name, "supervisory")
  };
}

export function bootstrapPayload(data, user) {
  const employees = visibleEmployees(data, user);
  const appraisals = appraisalQueueFor(data, user, employees);
  const employeeKpis = data.kpiMaster.filter(kpi => employees.some(e => kpiMatchesEmployee(kpi, e)));
  const isAdmin = [Roles.SUPER_ADMIN, Roles.HR_ADMIN].includes(user.role);
  return {
    user: publicUser(user),
    dashboard: dashboardFor(data, user),
    departments: data.departments.map(d => decorateDepartment(data, d)),
    jobRoles: data.jobRoles,
    employees,
    kpiMaster: isAdmin ? data.kpiMaster : employeeKpis,
    templates: user.role === Roles.EMPLOYEE ? data.templates.filter(t => employees.some(e => e.templateId === t.id)) : data.templates,
    periods: data.appraisalPeriods,
    appraisals,
    assignedStaff: managerAssignedEmployees(data, user),
    userList: isAdmin ? data.users.map(publicUser) : [],
    reports: reports(data),
    guides: data.guides,
    auditLogs: isAdmin ? data.auditLogs : []
  };
}
