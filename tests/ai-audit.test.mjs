import test from "node:test";
import assert from "node:assert/strict";
import schemas from "../.test-tmp-ai/ai-audit-schema.js";

const { aiAuditRequestSchema, aiAuditResultSchema } = schemas;

const fictionalClothingAudit = {
  brandMentioned: true,
  brandEvidence: "ThreadKind's Alder jacket is made from recycled nylon.",
  competitorMentions: [{
    competitor: "North Loop",
    mentionCount: 1,
    evidence: "North Loop's rain shell is another option.",
  }],
  missingInformation: [{
    productId: "alder-jacket",
    productName: "Alder Rain Jacket",
    fieldName: "careInstructions",
    reason: "The catalog does not include washing guidance.",
    recommendation: "Add care instructions from the garment label.",
  }],
  claimFindings: [{
    productId: "alder-jacket",
    productName: "Alder Rain Jacket",
    claim: "The jacket is made from recycled nylon.",
    observedValue: "100% recycled nylon",
    verifiedValue: "90% recycled nylon",
    outcome: "INACCURATE",
    discrepancyType: "inaccurate_attribute",
    severity: "medium",
    evidenceQuote: "It is made from 100% recycled nylon.",
    suggestedCorrection: "Verify the materials claim against the product specification.",
  }],
  recommendations: [{
    category: "accuracy",
    productId: "alder-jacket",
    title: "Verify the materials description",
    issue: "The captured response gives a different recycled-nylon percentage.",
    supportingEvidence: "Captured response: 100%; catalog: 90%.",
    recommendedAction: "Confirm the current materials specification before publishing a correction.",
    whyItMatters: "Accurate product details help customers make informed choices.",
    priority: "medium",
    effort: "low",
  }],
};

test("validates a structured clothing-brand analysis for human review", () => {
  const parsed = aiAuditResultSchema.parse(fictionalClothingAudit);
  assert.equal(parsed.brandMentioned, true);
  assert.equal(parsed.competitorMentions[0].competitor, "North Loop");
  assert.equal(parsed.missingInformation[0].fieldName, "careInstructions");
  assert.equal(parsed.claimFindings[0].outcome, "INACCURATE");
  assert.equal(parsed.recommendations[0].category, "accuracy");
});

test("rejects malformed or unexpected analysis fields", () => {
  assert.equal(aiAuditResultSchema.safeParse({
    ...fictionalClothingAudit,
    unexpected: "not allowed",
  }).success, false);
  assert.equal(aiAuditResultSchema.safeParse({
    ...fictionalClothingAudit,
    claimFindings: [{ ...fictionalClothingAudit.claimFindings[0], outcome: "probably wrong" }],
  }).success, false);
});

test("rejects empty or oversized captured response input", () => {
  assert.equal(aiAuditRequestSchema.safeParse({ question: "Best jacket?", response: " " }).success, false);
  assert.equal(aiAuditRequestSchema.safeParse({
    question: "Best jacket?",
    response: "x".repeat(12_001),
  }).success, false);
  assert.equal(aiAuditRequestSchema.safeParse({
    question: "Best jacket?",
    response: "A ThreadKind jacket made from recycled nylon.",
  }).success, true);
});
