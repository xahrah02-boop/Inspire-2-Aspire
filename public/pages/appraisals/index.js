import { state } from "../../shared/state.js";
import { periodToolbar } from "../../shared/ui.js";
import { managerAssignedAppraisals } from "../../shared/helpers.js";
import { renderView } from "../../shared/shell.js";
import { appraisalLine, renderManagerAppraisalResults, attachAppraisalHandlers } from "../../shared/appraisal.js";

export function render() {
  const rows = state.user.role === "LINE_MANAGER" ? managerAssignedAppraisals() : filteredAppraisals();
  if (!rows.length) {
    return state.user.role === "LINE_MANAGER"
      ? "<div class='empty'>No staff is attached to this manager yet.</div>"
      : "<div class='empty'>No appraisal assigned yet.</div>";
  }
  if (state.user.role === "LINE_MANAGER") return renderManagerAppraisalResults(rows);
  return `${periodToolbar()}<div class="appraisal-list">${rows.map(appraisalLine).join("")}</div>`;
}

export function attach(root) {
  attachAppraisalHandlers(root);
  document.querySelector("#periodFilter")?.addEventListener("change", event => {
    state.periodFilter = event.target.value;
    renderView();
  });
}

function filteredAppraisals() {
  return state.periodFilter === "all"
    ? state.data.appraisals
    : state.data.appraisals.filter(a => a.periodId === state.periodFilter);
}
