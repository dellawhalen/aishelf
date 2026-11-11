import test from "node:test";
import assert from "node:assert/strict";
import policy from "../.test-tmp-ai/ai-usage-policy.js";

const { estimateAiCostMicroUsd, AI_MAX_REQUEST_RESERVATION_MICRO_USD } = policy;

test("estimates standard gpt-6-luna input and output prices in microdollars", () => {
  assert.equal(estimateAiCostMicroUsd(1_000_000, 0), 100_000);
  assert.equal(estimateAiCostMicroUsd(0, 1_000_000), 500_000);
  assert.equal(estimateAiCostMicroUsd(20_000, 3_000), 3_500);
});

test("rejects invalid token counts instead of underestimating spend", () => {
  for (const [inputTokens, outputTokens] of [
    [-1, 0],
    [0, -1],
    [1.5, 0],
    [Number.NaN, 0],
    [Number.MAX_SAFE_INTEGER + 1, 0],
  ]) {
    assert.throws(() => estimateAiCostMicroUsd(inputTokens, outputTokens), RangeError);
  }
});

test("reserves the maximum configured request cost before an OpenAI call", () => {
  assert.equal(AI_MAX_REQUEST_RESERVATION_MICRO_USD, 3_500);
  assert.ok(AI_MAX_REQUEST_RESERVATION_MICRO_USD > 0);
});
