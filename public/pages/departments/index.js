import { state } from "../../shared/state.js";
import { escapeHtml, toast } from "../../shared/api.js";
import { canManage, departmentAssigneeName } from "../../shared/helpers.js";
import {
  openModal, departmentCreateModal, jobRoleCreateModal, departmentModal, departmentDetailModal,
  jobRoleModal, bindDepartmentCreateForm, bindJobRoleCreateForm, deleteDepartmentRecord
} from "../../shared/modals.js";

export function render() {
  return `<div class="section-stack">
    ${departmentRecordSection()}
    ${jobRoleRecordSection()}
  </div>`;
}

export function attach() {
  document.querySelector("[data-create-department]")?.addEventListener("click", () => {
    openModal(departmentCreateModal()).then(bindDepartmentCreateForm);
  });
  document.querySelector("[data-create-job-role]")?.addEventListener("click", () => {
    openModal(jobRoleCreateModal()).then(bindJobRoleCreateForm);
  });
  document.querySelectorAll("[data-edit-department]").forEach(button => button.addEventListener("click", () => {
    const dept = state.data.departments.find(item => item.id === button.dataset.editDepartment);
    if (dept) openModal(departmentModal(dept));
  }));
  document.querySelectorAll("[data-delete-department]").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    deleteDepartmentRecord(button.dataset.deleteDepartment);
  }));
  document.querySelector("[data-delete-selected-department]")?.addEventListener("click", event => {
    event.preventDefault();
    const departmentId = document.querySelector("#deleteDepartmentSelect")?.value;
    if (!departmentId) { toast("Select a department to delete"); return; }
    deleteDepartmentRecord(departmentId);
  });
  document.querySelector("#departmentMasterSelect")?.addEventListener("change", event => {
    const dept = state.data.departments.find(item => item.id === event.target.value || item.name === event.target.value);
    if (dept) { event.target.value = ""; openModal(departmentDetailModal(dept)); }
  });
  document.querySelectorAll("[data-edit-role]").forEach(button => button.addEventListener("click", () => {
    const role = state.data.jobRoles.find(item => item.id === button.dataset.editRole);
    if (role) openModal(jobRoleModal(role));
  }));
  document.querySelector("#jobRoleMasterSelect")?.addEventListener("change", event => {
    const role = state.data.jobRoles.find(item => item.id === event.target.value);
    if (role) { event.target.value = ""; openModal(jobRoleModal(role)); }
  });
}

function departmentRecordSection() {
  return `<section class="card">
    <div class="topbar"><h2>Department master records</h2>${canManage() ? `<button type="button" data-create-department>Add Department</button>` : ""}</div>
    ${departmentTable()}
    ${canManage() ? departmentDeleteActions() : ""}
    ${departmentDropdown()}
  </section>`;
}

function jobRoleRecordSection() {
  return `<section class="card">
    <div class="topbar"><h2>Job role records</h2>
      <div class="toolbar">${jobRoleDropdown()}${canManage() ? `<button type="button" data-create-job-role>Add Job Role</button>` : ""}</div>
    </div>
    <div class="hint">Select a job role from the dropdown to open its details.</div>
  </section>`;
}

function departmentTable() {
  if (!state.data.departments.length) return "";
  return `<div class="table-wrap"><table><thead><tr>
    <th>Department name</th><th>Managerial role holder</th><th>Supervisory role holder</th><th>Status</th>${canManage() ? "<th>Action</th>" : ""}
  </tr></thead><tbody>${state.data.departments.map(dept => `<tr>
    <td>${escapeHtml(dept.name)}</td>
    <td>${escapeHtml(dept.managerialRoleName || departmentAssigneeName(dept.managerialRole, dept.name, "managerial"))}</td>
    <td>${escapeHtml(dept.supervisoryRoleName || departmentAssigneeName(dept.supervisoryRole, dept.name, "supervisory"))}</td>
    <td><span class="badge ${escapeHtml(dept.status || "active")}">${escapeHtml(dept.status || "active")}</span></td>
    ${canManage() ? `<td><button class="secondary small-button" type="button" data-edit-department="${escapeHtml(dept.id)}">Edit</button><button class="danger small-button" type="button" data-delete-department="${escapeHtml(dept.id || dept.name)}">Delete</button></td>` : ""}
  </tr>`).join("")}</tbody></table></div>`;
}

function departmentDeleteActions() {
  if (!state.data.departments.length) return "";
  return `<div class="toolbar page-actions">
    <div class="field inline-filter"><label>Delete duplicate department</label>
      <select id="deleteDepartmentSelect"><option value="">Select department to delete</option>
        ${state.data.departments.map(d => `<option value="${escapeHtml(d.id || d.name)}">${escapeHtml(d.name)} (${escapeHtml(d.status || "active")})</option>`).join("")}
      </select>
    </div>
    <button class="danger" type="button" data-delete-selected-department>Delete Selected Department</button>
  </div>`;
}

function departmentDropdown() {
  if (!state.data.departments.length) return "<div class='empty'>No departments found.</div>";
  return `<div class="form-grid compact-form record-selector">
    <div class="field full"><label for="departmentMasterSelect">Department name dropdown</label>
      <select id="departmentMasterSelect"><option value="">Select department</option>
        ${state.data.departments.map(d => `<option value="${escapeHtml(d.id || d.name)}">${escapeHtml(d.name)}</option>`).join("")}
      </select>
      <div class="hint">Selecting a department opens its department master details.</div>
    </div>
  </div>`;
}

function jobRoleDropdown() {
  return `<div class="field inline-filter record-selector">
    <label for="jobRoleMasterSelect">Job role</label>
    <select id="jobRoleMasterSelect"><option value="">${state.data.jobRoles.length ? "Select job role" : "No job roles found"}</option>
      ${state.data.jobRoles.map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.title)} - ${escapeHtml(r.department)}</option>`).join("")}
    </select>
  </div>`;
}
