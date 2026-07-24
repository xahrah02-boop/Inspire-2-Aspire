// Idempotent seed for the SQLite store. Runs on boot; only populates when the
// users collection is empty, so real data entered later is never overwritten.

import { collection } from "./index.js";
import { hashPassword } from "../core/auth.js";

export function seedDatabase() {
  const users = collection("users");
  if (users.count() > 0) return { seeded: false };

  const now = new Date().toISOString();
  const data = buildSeedData(now);
  for (const [name, rows] of Object.entries(data)) {
    const store = collection(name);
    for (const row of rows) store.save(row);
  }
  return { seeded: true };
}

function buildSeedData(now) {
  const departments = [
    "Production", "Quality Control / Quality Assurance", "Maintenance / Engineering",
    "Warehouse / Stores", "Procurement", "Sales", "Logistics / Dispatch",
    "Finance / Accounts", "HR / Admin", "HSE / Safety"
  ].map((name, i) => ({
    id: `dept-${i + 1}`,
    name,
    head: i === 0 ? "emp-mgr-1" : "",
    managerialRole: i === 0 ? "emp-mgr-1" : "",
    supervisoryRole: i === 0 ? "emp-7" : "",
    status: "active"
  }));

  const jobRoles = [
    ["Production Operator", "Production"], ["Sales Officer", "Sales"],
    ["Warehouse Officer", "Warehouse / Stores"], ["Maintenance Technician", "Maintenance / Engineering"],
    ["HR Officer", "HR / Admin"], ["Quality Analyst", "Quality Control / Quality Assurance"]
  ].map(([title, department], i) => ({ id: `role-${i + 1}`, title, department, status: "active" }));

  const users = [
    ["u-super", "super.admin@company.test", "Super Admin", "SUPER_ADMIN"],
    ["u-hr", "hr.admin@company.test", "HR Admin", "HR_ADMIN"],
    ["u-mgr-1", "grace.manager@company.test", "Grace Okafor", "LINE_MANAGER"],
    ["u-mgr-2", "daniel.manager@company.test", "Daniel Mensah", "LINE_MANAGER"],
    ["u-mgr-3", "aisha.manager@company.test", "Aisha Bello", "LINE_MANAGER"],
    ["u-emp-1", "john.operator@company.test", "John Okorie", "EMPLOYEE"],
    ["u-emp-2", "mary.sales@company.test", "Mary Adeyemi", "EMPLOYEE"],
    ["u-emp-3", "kevin.warehouse@company.test", "Kevin Boateng", "EMPLOYEE"],
    ["u-emp-4", "linda.maintenance@company.test", "Linda Eze", "EMPLOYEE"],
    ["u-emp-5", "samuel.hr@company.test", "Samuel Ibe", "EMPLOYEE"],
    ["u-emp-6", "amina.quality@company.test", "Amina Yusuf", "EMPLOYEE"],
    ["u-emp-7", "peter.operator@company.test", "Peter Nwosu", "EMPLOYEE"],
    ["u-emp-8", "esther.sales@company.test", "Esther Obi", "EMPLOYEE"],
    ["u-emp-9", "victor.store@company.test", "Victor Sule", "EMPLOYEE"],
    ["u-emp-10", "rose.dispatch@company.test", "Rose Udo", "EMPLOYEE"]
  ].map(([id, email, name, role]) => ({
    id, email, name, role, status: "active", passwordHash: hashPassword("Password123!")
  }));

  const categories = [
    "Job-specific performance", "Quality of work", "Productivity", "Timeliness",
    "Attendance and punctuality", "Safety and compliance", "Teamwork and communication",
    "Initiative and problem-solving", "Leadership", "Learning and development"
  ].map((name, i) => ({ id: `cat-${i + 1}`, name }));

  const kpiMaster = [
    ["KPI-PROD-001", "Output achievement", "Production", "Production Operator", "Job-specific performance", 25],
    ["KPI-PROD-002", "Quality of work", "Production", "Production Operator", "Quality of work", 20],
    ["KPI-PROD-003", "Waste control", "Production", "Production Operator", "Productivity", 15],
    ["KPI-SALES-001", "Sales volume achievement", "Sales", "Sales Officer", "Job-specific performance", 25],
    ["KPI-SALES-002", "Revenue achievement", "Sales", "Sales Officer", "Productivity", 20],
    ["KPI-WH-001", "Inventory accuracy", "Warehouse / Stores", "Warehouse Officer", "Quality of work", 25],
    ["KPI-MAINT-001", "Breakdown response time", "Maintenance / Engineering", "Maintenance Technician", "Timeliness", 20],
    ["KPI-HR-001", "Recruitment and onboarding efficiency", "HR / Admin", "HR Officer", "Timeliness", 15],
    ["KPI-COM-001", "Attendance and punctuality", "All", "All", "Attendance and punctuality", 10],
    ["KPI-COM-002", "Safety compliance", "All", "All", "Safety and compliance", 10],
    ["KPI-COM-003", "Teamwork and attitude", "All", "All", "Teamwork and communication", 10]
  ].map(([code, title, department, jobRole, category, weight], i) => ({
    id: `kpi-${i + 1}`, code, title, description: `${title} measured against approved departmental expectations.`,
    category, department, jobRole, formula: "Actual performance / target performance", target: "Meet or exceed target",
    weight, scoringGuide: "Score 1 to 5 based on documented evidence.", dataSource: "Supervisor records",
    frequency: "quarterly", status: "active", createdBy: "u-hr", createdAt: now, modifiedBy: "u-hr"
  }));

  const templates = [
    ["tpl-prod", "Production Operator KPI Template", "Production", "Production Operator", [
      ["Output achievement", 25], ["Quality of work", 20], ["Waste control", 15], ["Attendance and punctuality", 10],
      ["Safety compliance", 10], ["Process discipline", 10], ["Teamwork and attitude", 10]
    ]],
    ["tpl-sales", "Sales Officer KPI Template", "Sales", "Sales Officer", [
      ["Sales volume achievement", 25], ["Revenue achievement", 20], ["New customer acquisition", 15], ["Customer retention", 10],
      ["Collection/payment follow-up", 10], ["Market visits and reporting", 10], ["Conduct and brand representation", 5], ["Attendance/availability", 5]
    ]],
    ["tpl-warehouse", "Warehouse Officer KPI Template", "Warehouse / Stores", "Warehouse Officer", [
      ["Inventory accuracy", 25], ["Timely material issuance", 15], ["Documentation accuracy", 20], ["Stock variance control", 15],
      ["Housekeeping", 10], ["Safety compliance", 5], ["Attendance and discipline", 10]
    ]],
    ["tpl-maint", "Maintenance Technician KPI Template", "Maintenance / Engineering", "Maintenance Technician", [
      ["Breakdown response time", 20], ["Quality of repair work", 20], ["Preventive maintenance completion", 20], ["Reduction of repeat faults", 15],
      ["Safety compliance", 10], ["Documentation/job card completion", 5], ["Attendance and teamwork", 10]
    ]],
    ["tpl-hr", "HR Officer KPI Template", "HR / Admin", "HR Officer", [
      ["Recruitment and onboarding efficiency", 15], ["Payroll/attendance accuracy", 20], ["Employee records management", 15],
      ["Training and appraisal coordination", 15], ["Employee relations/case handling", 15], ["Policy compliance and documentation", 10],
      ["Professional conduct/confidentiality", 10]
    ]]
  ].map(([id, name, department, jobRole, items]) => ({
    id, name, department, jobRole, status: "active",
    items: items.map(([title, weight], idx) => ({ id: `${id}-item-${idx + 1}`, title, weight }))
  }));

  const managerEmployees = [
    ["MGR-001", "Grace", "Okafor", "Production", "Production Manager", "u-mgr-1", "u-mgr-1", "tpl-prod"],
    ["MGR-002", "Daniel", "Mensah", "Sales", "Sales Manager", "u-mgr-2", "u-mgr-2", "tpl-sales"],
    ["MGR-003", "Aisha", "Bello", "Warehouse / Stores", "Warehouse Manager", "u-mgr-3", "u-mgr-3", "tpl-warehouse"]
  ].map(([employeeId, firstName, lastName, department, jobTitle, lineManagerUserId, userId, templateId], i) => ({
    id: `emp-mgr-${i + 1}`, employeeId, firstName, lastName, email: users.find(u => u.id === userId).email,
    phone: `080${20000000 + i}`, department, jobTitle, employmentType: "Full time",
    dateOfEmployment: `2023-${String(i + 1).padStart(2, "0")}-01`, confirmationStatus: "confirmed",
    lineManagerUserId, workLocation: i % 2 ? "Plant B" : "Plant A", status: "confirmed",
    userAccountStatus: "active", templateId, emergencyContact: "Next of kin - 08030000000", notes: "Seeded line manager employee profile.", userId,
    roleCategories: ["staff", "managerial", "supervisory"]
  }));

  const employees = managerEmployees.concat([
    ["EMP-0001", "John", "Okorie", "Production", "Production Operator", "u-mgr-1", "u-emp-1", "tpl-prod"],
    ["EMP-002", "Mary", "Adeyemi", "Sales", "Sales Officer", "u-mgr-2", "u-emp-2", "tpl-sales"],
    ["EMP-003", "Kevin", "Boateng", "Warehouse / Stores", "Warehouse Officer", "u-mgr-3", "u-emp-3", "tpl-warehouse"],
    ["EMP-004", "Linda", "Eze", "Maintenance / Engineering", "Maintenance Technician", "u-mgr-1", "u-emp-4", "tpl-maint"],
    ["EMP-005", "Samuel", "Ibe", "HR / Admin", "HR Officer", "u-mgr-2", "u-emp-5", "tpl-hr"],
    ["EMP-006", "Amina", "Yusuf", "Quality Control / Quality Assurance", "Quality Analyst", "u-mgr-3", "u-emp-6", "tpl-prod"],
    ["EMP-007", "Peter", "Nwosu", "Production", "Production Operator", "u-mgr-1", "u-emp-7", "tpl-prod"],
    ["EMP-008", "Esther", "Obi", "Sales", "Sales Officer", "u-mgr-2", "u-emp-8", "tpl-sales"],
    ["EMP-009", "Victor", "Sule", "Warehouse / Stores", "Warehouse Officer", "u-mgr-3", "u-emp-9", "tpl-warehouse"],
    ["EMP-010", "Rose", "Udo", "Logistics / Dispatch", "Dispatch Officer", "u-mgr-3", "u-emp-10", "tpl-warehouse"]
  ].map(([employeeId, firstName, lastName, department, jobTitle, lineManagerUserId, userId, templateId], i) => ({
    id: `emp-${i + 1}`, employeeId, firstName, lastName, email: users.find(u => u.id === userId).email,
    phone: `080${10000000 + i}`, department, jobTitle, employmentType: "Full time",
    dateOfEmployment: `2024-${String((i % 9) + 1).padStart(2, "0")}-15`, confirmationStatus: i < 6 ? "confirmed" : "probation",
    lineManagerUserId, workLocation: i % 2 ? "Plant B" : "Plant A", status: i < 6 ? "confirmed" : "probation",
    userAccountStatus: "active", templateId, emergencyContact: "Next of kin - 08030000000", notes: "", userId,
    roleCategories: i === 0 ? ["staff", "managerial", "supervisory"] : i === 3 ? ["staff", "supervisory"] : ["staff"]
  })));

  const appraisalPeriods = [
    { id: "period-1", name: "Q2 2026 Performance Review", startDate: "2026-04-01", endDate: "2026-06-30", type: "quarterly", status: "open", departments: departments.map(d => d.name) },
    { id: "period-2", name: "May 2026 Monthly Check-in", startDate: "2026-05-01", endDate: "2026-05-31", type: "monthly", status: "closed", departments: departments.map(d => d.name) },
    { id: "period-3", name: "April 2026 Monthly Check-in", startDate: "2026-04-01", endDate: "2026-04-30", type: "monthly", status: "locked", departments: departments.map(d => d.name) }
  ];

  const templateById = Object.fromEntries(templates.map(t => [t.id, t]));
  // Scores are now on the 1-5 scale.
  const appraisals = [
    makeAppraisal("app-1", "emp-1", "period-1", "u-mgr-1", "Draft", templateById["tpl-prod"], [4, 4, 3, 5, 4, 3, 4]),
    makeAppraisal("app-2", "emp-2", "period-1", "u-mgr-2", "Submitted", templateById["tpl-sales"], [4, 3, 4, 4, 3, 4, 5, 4]),
    makeAppraisal("app-3", "emp-3", "period-1", "u-mgr-3", "Approved", templateById["tpl-warehouse"], [5, 4, 4, 4, 4, 5, 4]),
    makeAppraisal("app-4", "emp-1", "period-2", "u-mgr-1", "Published", templateById["tpl-prod"], [4, 3, 4, 4, 5, 4, 4]),
    makeAppraisal("app-5", "emp-1", "period-3", "u-mgr-1", "Acknowledged", templateById["tpl-prod"], [3, 4, 3, 4, 4, 3, 4]),
    makeAppraisal("app-6", "emp-4", "period-2", "u-mgr-1", "Published", templateById["tpl-maint"], [4, 4, 3, 4, 5, 4, 4]),
    makeAppraisal("app-7", "emp-2", "period-2", "u-mgr-2", "Published", templateById["tpl-sales"], [3, 4, 4, 3, 4, 4, 4, 5])
  ];

  const notifications = [
    ["n-1", "u-emp-1", "KPI assigned to employee", "Your Production Operator KPI template is active."],
    ["n-2", "u-mgr-2", "Manager submits appraisal", "Mary Adeyemi appraisal is awaiting HR review."],
    ["n-3", "u-hr", "Appraisal period opened", "Q2 2026 Performance Review is open."]
  ].map(([id, userId, title, message]) => ({ id, userId, title, message, read: false, createdAt: now }));

  const guides = [
    { id: "guide-1", audience: "All Users", title: "How appraisal works", body: "KPIs define measurable performance expectations. Managers score each KPI from 1 to 5 using evidence, and each KPI's weight determines how much it contributes to the final score." },
    { id: "guide-2", audience: "HR Admin", title: "HR workflow", body: "Create KPI masters, build templates, maintain employee records, open periods, review submissions, approve and publish results." },
    { id: "guide-3", audience: "Line Manager", title: "Manager workflow", body: "Open My Appraisals, start or continue an appraisal, enter 1-5 scores and comments, save drafts, then submit to HR." },
    { id: "guide-4", audience: "Employee", title: "Employee checklist", body: "Review your profile, read KPI guidance, view assigned KPIs, confirm expectations, read policy, and acknowledge completion." }
  ];

  const auditLogs = [
    { id: "audit-1", userId: "u-hr", action: "KPI template assigned", module: "Employee Master", record: "EMP-0001", createdAt: now, oldValue: "", newValue: "tpl-prod" },
    { id: "audit-2", userId: "u-mgr-2", action: "Appraisal submitted", module: "Appraisals", record: "app-2", createdAt: now, oldValue: "Draft", newValue: "Submitted" }
  ];

  return {
    users, departments, jobRoles, categories, kpiMaster, templates, employees,
    appraisalPeriods, appraisals, notifications, guides, auditLogs
  };
}

function makeAppraisal(id, employeeId, periodId, managerUserId, status, template, scores) {
  return {
    id, employeeId, periodId, managerUserId, status,
    overallComment: "Performance reviewed against assigned manufacturing KPIs.",
    strengths: "Reliable execution and good collaboration.",
    improvement: "Continue improving documentation and proactive reporting.",
    trainingRecommendation: "Refresher training on process documentation.",
    promotionRecommendation: "Not at this time",
    confirmationRecommendation: "Confirm where applicable",
    hrComment: status === "Approved" ? "Reviewed and approved by HR." : "",
    published: status === "Published" || status === "Acknowledged",
    acknowledged: status === "Acknowledged",
    scores: template.items.map((item, index) => ({
      id: `${id}-score-${index + 1}`,
      title: item.title,
      weight: item.weight,
      target: "Meet or exceed approved target",
      score: scores[index] ?? 3,
      actualResult: "Documented result available",
      managerComment: "Assessment supported by operational evidence.",
      evidenceNote: "Supervisor log / ERP report",
      evidenceFileId: "",
      employeeComment: "",
      managerConfirmedEmployeeComment: false
    }))
  };
}
