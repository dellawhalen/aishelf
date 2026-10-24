import test from "node:test";
import assert from "node:assert/strict";
import scoring from "../.test-tmp/scoring.js";

const { calculateScores, classifyScore } = scoring;

const fullEvidence = {
  sourceType: "SIMULATED",
  responses: [{ brandMentioned: true }, { brandMentioned: false }],
  competitorMentionCount: 2,
  accuracyChecks: [{ outcome: "ACCURATE" }, { outcome: "INACCURATE" }, { outcome: "MISSING" }],
  completedProductFields: 3,
  requiredProductFields: 4,
};

test("calculates category scores from recorded evidence and excludes missing claims", () => {
  const result = calculateScores(fullEvidence);
  assert.equal(result.categories.visibility.score, 50);
  assert.equal(result.categories.accuracy.score, 50);
  assert.equal(result.categories.competitive.score, 33);
  assert.equal(result.categories.completeness.score, 75);
});

test("calculates the weighted overall score without redistributing category weights", () => {
  const result = calculateScores(fullEvidence);
  assert.equal(result.overall, 50);
  assert.equal(result.classification, "Low Visibility");
});

test("returns insufficient data instead of artificial zeros when evidence is missing", () => {
  const result = calculateScores({
    sourceType: "EXTERNAL",
    responses: [],
    competitorMentionCount: 0,
    accuracyChecks: [{ outcome: "MISSING" }, { outcome: "UNVERIFIED" }],
    completedProductFields: 0,
    requiredProductFields: 0,
  });
  assert.equal(result.overall, null);
  assert.equal(result.classification, "Insufficient Data");
  assert.deepEqual(
    Object.values(result.categories).map((category) => category.score),
    [null, null, null, null],
  );
});

test("uses the documented score classification thresholds", () => {
  assert.equal(classifyScore(90), "Excellent");
  assert.equal(classifyScore(75), "Good");
  assert.equal(classifyScore(60), "Needs Improvement");
  assert.equal(classifyScore(40), "Low Visibility");
  assert.equal(classifyScore(39), "Critical");
  assert.equal(classifyScore(null), "Insufficient Data");
});
