// App shell: login, sidebar, and a lazy-loading router. Each page lives in its
// own folder under /pages and is dynamically imported the first time it is
// viewed, so the browser only downloads the code for the page in use.

import { state, resetState } from "./state.js";
import { api, escapeHtml, toast } from "./api.js";
import { staffAppraisalForEmployee, managerAssignedAppraisals } from "./helpers.js";
import { openModal, kpiCreateModal, bindKpiCreateForm } from "./modals.js";
import { appraisalModal } from "./appraisal.js";

const app = document.querySelector("#app");
let searchTimer;
let globalHandlersBound = false;

export const roleMenus = {
  SUPER_ADMIN: ["dashboard", "users", "departments", "kpis", "templates", "employees", "periods", "appraisals", "reports", "help", "audit"],
  HR_ADMIN: ["dashboard", "departments", "kpis", "templates", "employees", "periods", "appraisals", "reports", "help", "audit"],
  LINE_MANAGER: ["dashboard", "profile", "assignedStaff", "employees", "appraisals", "results", "help"],
  EMPLOYEE: ["profile", "kpis", "assignedStaff", "results", "help"]
};

const labels = {
  dashboard: "Dashboard", users: "Users", departments: "Departments & Roles", kpis: "KPI Master",
  templates: "KPI Templates", employees: "Employee Master", periods: "Appraisal Periods",
  appraisals: "My Appraisals / HR Review", reports: "Reports", help: "Onboarding & Help",
  audit: "Audit Trail", profile: "My Profile", assignedStaff: "Assigned Staff", results: "Appraisal Results"
};

// One folder per page. Values are lazy import() thunks -> code-split per page.
const pageLoaders = {
  dashboard: () => import("../pages/dashboard/index.js"),
  users: () => import("../pages/users/index.js"),
  departments: () => import("../pages/departments/index.js"),
  kpis: () => import("../pages/kpis/index.js"),
  templates: () => import("../pages/templates/index.js"),
  employees: () => import("../pages/employees/index.js"),
  periods: () => import("../pages/periods/index.js"),
  appraisals: () => import("../pages/appraisals/index.js"),
  reports: () => import("../pages/reports/index.js"),
  help: () => import("../pages/help/index.js"),
  audit: () => import("../pages/audit/index.js"),
  profile: () => import("../pages/profile/index.js"),
  assignedStaff: () => import("../pages/assigned-staff/index.js"),
  results: () => import("../pages/results/index.js")
};

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
    assignedStaff: "Staff linked to the logged-in employee.",
    help: "Guidance for HR admins, line managers, employees, and new starters.",
    reports: "Performance, completion, training, probation, and department summaries.",
    audit: "Traceable system actions for compliance and governance."
  }[view] || "Manufacturing HR performance workflow.";
}

function setDefaultViewForRole() {
  const menu = roleMenus[state.user?.role] || ["dashboard"];
  state.view = menu[0];
}

export function renderLogin() {
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
      state.user = result.user;
      state.csrfToken = result.csrfToken || "";
      state.data = await api("/api/bootstrap");
      setDefaultViewForRole();
      renderShell();
    } catch (error) {
      document.querySelector("#loginError").textContent = error.message;
    }
  });
}

export function renderShell() {
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
        <div id="view"><div class="empty">Loading…</div></div>
      </section>
    </section>`;
  document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => {
    state.view = btn.dataset.view;
    state.query = "";
    renderShell();
  }));
  document.querySelector("#logout").addEventListener("click", logout);
  renderView();
}

export async function renderView() {
  const target = document.querySelector("#view");
  try {
    const load = pageLoaders[state.view] || pageLoaders.dashboard;
    const mod = await load();
    target.innerHTML = mod.render();
    bindCommonControls();
    mod.attach?.(target);
  } catch (error) {
    target.innerHTML = `<section class="card"><h2>Unable to render this view</h2><div class="error">${escapeHtml(error.message)}</div></section>`;
  }
}

// Controls that appear on many pages (search box, generic status filters).
function bindCommonControls() {
  document.querySelector("#search")?.addEventListener("input", event => {
    state.query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      renderView();
      const search = document.querySelector("#search");
      if (search) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
    }, 120);
  });
  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    renderView();
  }));
}

function bindGlobalHandlers() {
  if (globalHandlersBound) return;
  globalHandlersBound = true;
  document.addEventListener("click", event => {
    const assessStaff = event.target.closest?.("[data-assess-staff]");
    if (assessStaff) {
      event.preventDefault(); event.stopPropagation();
      const appraisal = staffAppraisalForEmployee(assessStaff.dataset.assessStaff);
      if (appraisal) openModal(appraisalModal(appraisal));
      return;
    }
    const managerReview = event.target.closest?.("[data-open-manager-review]");
    if (managerReview) {
      event.preventDefault(); event.stopPropagation();
      const appraisal = state.data.appraisals.find(i => i.id === managerReview.dataset.openManagerReview)
        || managerAssignedAppraisals().find(i => i.id === managerReview.dataset.openManagerReview);
      if (appraisal) openModal(appraisalModal(appraisal));
      return;
    }
    const createKpi = event.target.closest?.("[data-create-kpi]");
    if (createKpi) {
      event.preventDefault();
      openModal(kpiCreateModal()).then(bindKpiCreateForm);
    }
  });
}

async function logout() {
  try { await api("/api/logout", { method: "POST" }); } catch { /* ignore */ }
  resetState();
  renderLogin();
}

export async function init() {
  bindGlobalHandlers();
  try {
    const me = await api("/api/me");
    state.user = me.user;
    state.csrfToken = me.csrfToken || "";
    state.data = await api("/api/bootstrap");
    setDefaultViewForRole();
    renderShell();
  } catch {
    renderLogin();
  }
}
