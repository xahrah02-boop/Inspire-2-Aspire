export const scoreLabels = {
  30: "Excellent / Exceeds expectation",
  24: "Very Good / Meets expectation strongly",
  18: "Satisfactory / Meets minimum expectation",
  12: "Needs Improvement / Below expectation",
  1: "Poor / Far below expectation"
};

export function validateScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || n < 1 || n > 30) {
    throw new Error("Appraisal score must be between 1 and 30.");
  }
  return n;
}

export function validateTemplateWeight(items) {
  const total = items.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  if (Math.round(total * 100) / 100 !== 100) {
    throw new Error(`KPI template total weight must equal 100%. Current total is ${total}%.`);
  }
  return total;
}

export function weightedContribution(score, weight) {
  return validateScore(score) * Number(weight || 0) / 100;
}

export function calculateFinalScore(scores) {
  const total = scores.reduce((sum, item) => sum + actualResultValue(item), 0);
  return Math.round(total * 100) / 100;
}

export function actualResultValue(item) {
  const rawActual = String(item.actualResult ?? "").trim();
  const actual = rawActual === "" ? NaN : Number(rawActual);
  if (Number.isFinite(actual)) return actual;
  return validateScore(item.score);
}

export function ratingForScore(finalScore) {
  const score = Number(finalScore);
  if (score >= 27) return "Excellent";
  if (score >= 22.5) return "Very Good";
  if (score >= 18) return "Satisfactory";
  if (score >= 12) return "Needs Improvement";
  return "Unsatisfactory";
}
