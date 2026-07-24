import { state } from "../../shared/state.js";
import { escapeHtml } from "../../shared/api.js";
import { panel } from "../../shared/ui.js";
import { openModal, onboardingVideoModal } from "../../shared/modals.js";

export function render() {
  const checklist = ["Complete profile review", "Read KPI explanation", "View assigned KPIs", "Confirm understanding of performance expectations", "Read company appraisal policy", "Acknowledge onboarding completion"];
  return `<div class="section-stack">
    ${panel("Onboarding demo video", `<div class="demo-video-card">
      <div class="demo-video-thumb"><img src="./assets/onboarding-demo.svg" alt="ForgeHR onboarding demo video preview"></div>
      <div><h3>ForgeHR appraisal walkthrough</h3><p class="hint">A quick visual guide for HR, managers, and employees.</p><button type="button" data-onboarding-video>Watch Demo Video</button></div>
    </div>`)}
    <div class="split">
      ${panel("How to use this system", state.data.guides.map(g => `<div class="card" style="margin-bottom:10px"><h3>${escapeHtml(g.title)}</h3><div class="hint">${escapeHtml(g.audience)}</div><p>${escapeHtml(g.body)}</p></div>`).join(""))}
      ${panel("New employee onboarding checklist", checklist.map((item, i) => `<label class="field"><span><input type="checkbox"> ${i + 1}. ${escapeHtml(item)}</span></label>`).join("") + `<h3>FAQ</h3><p class="hint">KPI weights show how much each measure contributes to the final score. A published result can be acknowledged from Appraisal Results.</p>`)}
    </div>
  </div>`;
}

export function attach() {
  document.querySelector("[data-onboarding-video]")?.addEventListener("click", () => openModal(onboardingVideoModal()));
}
