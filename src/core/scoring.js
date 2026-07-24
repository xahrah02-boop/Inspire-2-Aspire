// Coherent weighted appraisal scoring on a single 1-5 scale.
//
// Each KPI in an appraisal carries a `weight` (template weights sum to 100%)
// and a manager `score` from 1 to 5. The final score is the weight-weighted
// average of the KPI scores, so it also lands on the 1-5 scale and template
// weights genuinely drive the outcome. This replaces the previous model where
// the final score summed a free-form `actualResult` field and ignored both the
// score and the weights.

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

export const scoreLabels = {
  5: "Excellent / Exceeds expectation",
  4: "Very Good / Meets expectation strongly",
  3: "Satisfactory / Meets minimum expectation",
  2: "Needs Improvement / Below expectation",
  1: "Unsatisfactory / Far below expectation"
};

export function validateScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || n < SCORE_MIN || n > SCORE_MAX) {
    throw new Error(`Appraisal score must be between ${SCORE_MIN} and ${SCORE_MAX}.`);
  }
  return n;
}

export function validateTemplateWeight(items) {
  const total = (items || []).reduce((sum, item) => sum + Number(item.weight || 0), 0);
  if (Math.round(total * 100) / 100 !== 100) {
    throw new Error(`KPI template total weight must equal 100%. Current total is ${total}%.`);
  }
  return total;
}

// Contribution of a single KPI to the (un-normalised) weighted total.
export function weightedContribution(score, weight) {
  return validateScore(score) * Number(weight || 0);
}

// Weighted average of the KPI scores on the 1-5 scale. Robust to weight totals
// other than 100 (normalises by the actual weight sum); falls back to a plain
// mean when no weights are present. Rows with a non-numeric score are skipped.
export function calculateFinalScore(scores) {
  const rows = (scores || []).filter(item => isNumericScore(item?.score));
  if (!rows.length) return 0;
  const totalWeight = rows.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  if (totalWeight > 0) {
    const weighted = rows.reduce((sum, item) => sum + Number(item.score) * Number(item.weight || 0), 0);
    return round2(weighted / totalWeight);
  }
  const mean = rows.reduce((sum, item) => sum + Number(item.score), 0) / rows.length;
  return round2(mean);
}

export function scorePercentage(finalScore) {
  return round2((Number(finalScore) / SCORE_MAX) * 100);
}

export function ratingForScore(finalScore) {
  const score = Number(finalScore);
  if (!Number.isFinite(score) || score <= 0) return "Not Rated";
  if (score >= 4.5) return "Excellent";
  if (score >= 3.5) return "Very Good";
  if (score >= 2.5) return "Satisfactory";
  if (score >= 1.5) return "Needs Improvement";
  return "Unsatisfactory";
}

function isNumericScore(value) {
  if (value === null || value === undefined) return false;
  const raw = String(value).trim();
  if (raw === "") return false;
  return Number.isFinite(Number(raw));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
