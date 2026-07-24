import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFinalScore,
  ratingForScore,
  validateScore,
  validateTemplateWeight,
  weightedContribution,
  scorePercentage
} from "../src/core/scoring.js";

test("final score is the weight-weighted average of KPI scores", () => {
  const score = calculateFinalScore([
    { score: 5, weight: 50 },
    { score: 3, weight: 30 },
    { score: 1, weight: 20 }
  ]);
  // 5*0.5 + 3*0.3 + 1*0.2 = 2.5 + 0.9 + 0.2 = 3.6
  assert.equal(score, 3.6);
  assert.equal(ratingForScore(score), "Very Good");
});

test("weights genuinely change the outcome", () => {
  const heavyTop = calculateFinalScore([{ score: 5, weight: 90 }, { score: 1, weight: 10 }]);
  const heavyBottom = calculateFinalScore([{ score: 5, weight: 10 }, { score: 1, weight: 90 }]);
  assert.equal(heavyTop, 4.6);
  assert.equal(heavyBottom, 1.4);
  assert.notEqual(heavyTop, heavyBottom);
});

test("normalises when weights do not sum to 100", () => {
  // equal weights that sum to 60 should still yield a plain average
  assert.equal(calculateFinalScore([{ score: 4, weight: 20 }, { score: 2, weight: 40 }]), round(4 * 20 / 60 + 2 * 40 / 60));
});

test("falls back to a plain mean when no weights are present", () => {
  assert.equal(calculateFinalScore([{ score: 4 }, { score: 2 }]), 3);
});

test("skips rows with a non-numeric score", () => {
  assert.equal(calculateFinalScore([{ score: "", weight: 50 }, { score: 4, weight: 50 }]), 4);
});

test("empty appraisal scores to zero and is Not Rated", () => {
  assert.equal(calculateFinalScore([]), 0);
  assert.equal(ratingForScore(0), "Not Rated");
});

test("rejects scores outside the 1 to 5 range", () => {
  assert.throws(() => validateScore(0), /between 1 and 5/);
  assert.throws(() => validateScore(6), /between 1 and 5/);
  assert.throws(() => validateScore("abc"), /between 1 and 5/);
  assert.equal(validateScore(3), 3);
});

test("weightedContribution multiplies validated score by weight", () => {
  assert.equal(weightedContribution(4, 25), 100);
  assert.throws(() => weightedContribution(9, 25), /between 1 and 5/);
});

test("scorePercentage maps the 1-5 scale onto 0-100", () => {
  assert.equal(scorePercentage(5), 100);
  assert.equal(scorePercentage(3.6), 72);
});

test("requires KPI template weights to equal 100%", () => {
  assert.equal(validateTemplateWeight([{ weight: 40 }, { weight: 60 }]), 100);
  assert.throws(() => validateTemplateWeight([{ weight: 40 }, { weight: 40 }]), /100%/);
});

function round(value) {
  return Math.round(value * 100) / 100;
}
