import { state } from "../../shared/state.js";
import { escapeHtml } from "../../shared/api.js";
import { panel, table } from "../../shared/ui.js";
import { canManage, filterRows } from "../../shared/helpers.js";
import { renderView } from "../../shared/shell.js";
import { openModal, templateModal } from "../../shared/modals.js";

export function render() {
  const rows = filterRows(state.data.templates, ["name", "department", "jobRole", "status"]);
  const selected = selectedTemplate(rows);
  return `${templateToolbar(rows)}
    ${panel("KPI template", selected ? templateDetail(selected) : "<div class='empty'>No KPI templates found.</div>")}`;
}

export function attach() {
  document.querySelector("#templatePicker")?.addEventListener("change", event => {
    state.selectedTemplateId = event.target.value;
    renderView();
  });
  document.querySelector("[data-create-template]")?.addEventListener("click", () => openModal(templateModal()));
  document.querySelector("[data-edit-template]")?.addEventListener("click", event => {
    const template = state.data.templates.find(item => item.id === event.currentTarget.dataset.editTemplate);
    if (template) openModal(templateModal(template));
  });
}

function templateToolbar(rows) {
  const selected = selectedTemplate(rows);
  return `<div class="toolbar">
    <div class="field inline-filter template-picker">
      <label>KPI template</label>
      <select id="templatePicker">
        ${rows.map(t => `<option value="${t.id}" ${selected?.id === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}
      </select>
    </div>
    ${canManage() ? `<button type="button" data-create-template>Create New Template</button>${selected ? `<button type="button" class="secondary" data-edit-template="${selected.id}">Edit Template</button>` : ""}` : ""}
  </div>`;
}

function selectedTemplate(rows) {
  if (!rows.length) return null;
  return rows.find(t => t.id === state.selectedTemplateId) || rows[0];
}

function templateDetail(template) {
  const total = template.items.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  return `<div class="template-single">
    <div class="topbar">
      <div><h2>${escapeHtml(template.name)}</h2><div class="hint">${escapeHtml(template.department)} · ${escapeHtml(template.jobRole)} · <span class="badge ${template.status}">${escapeHtml(template.status)}</span></div></div>
      <div class="metric"><strong>${total}%</strong> total weight</div>
    </div>
    <div class="progress" title="Total weight"><span style="width:${Math.min(100, total)}%"></span></div>
    ${table(template.items, ["title", "weight"], [])}
  </div>`;
}
