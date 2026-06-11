import test from "node:test";
import assert from "node:assert/strict";
import { calculateFinalScore, ratingForScore, validateScore, validateTemplateWeight } from "../src/core/scoring.js";

test("calculates final score by summing actual results", () => {
  const score = calculateFinalScore([{ actualResult: 20, score: 24, weight: 20 }, { actualResult: 15, score: 30, weight: 30 }, { actualResult: 10, score: 18, weight: 50 }]);
  assert.equal(score, 45);
  assert.equal(ratingForScore(score), "Excellent");
});

test("falls back to summing scores when actual result is not numeric", () => {
  const score = calculateFinalScore([{ score: 24, weight: 20 }, { score: 30, weight: 30 }, { score: 18, weight: 50 }]);
  assert.equal(score, 72);
  assert.equal(ratingForScore(score), "Excellent");
});

test("rejects invalid appraisal scores", () => {
  assert.throws(() => validateScore(31), /between 1 and 30/);
});

test("requires KPI template weights to equal 100%", () => {
  assert.equal(validateTemplateWeight([{ weight: 40 }, { weight: 60 }]), 100);
  assert.throws(() => validateTemplateWeight([{ weight: 40 }, { weight: 40 }]), /100%/);
});
