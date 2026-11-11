export const AI_AUDIT_MODEL = "gpt-6-luna";
export const AI_AUDIT_PROMPT_VERSION = "2";
export const AI_APPLICATION_BUDGET_MICRO_USD = 15_000_000;
export const AI_DEMO_RESERVE_MICRO_USD = 5_000_000;
export const AI_REQUESTS_PER_USER_PER_HOUR = 10;
export const AI_MAX_INPUT_TOKENS = 20_000;
export const AI_MAX_OUTPUT_TOKENS = 3_000;
export const AI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const AI_PENDING_LEASE_MS = 2 * 60 * 1_000;
export const AI_UNCERTAIN_RETRY_DELAY_MS = 5 * 60 * 1_000;

const INPUT_PRICE_MICRO_USD_PER_MILLION = 100_000;
const OUTPUT_PRICE_MICRO_USD_PER_MILLION = 500_000;

export function estimateAiCostMicroUsd(inputTokens: number, outputTokens: number) {
  if (
    !Number.isSafeInteger(inputTokens) ||
    !Number.isSafeInteger(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    throw new RangeError("Token counts must be non-negative safe integers.");
  }

  return Math.ceil(
    (inputTokens * INPUT_PRICE_MICRO_USD_PER_MILLION +
      outputTokens * OUTPUT_PRICE_MICRO_USD_PER_MILLION) /
      1_000_000,
  );
}

export const AI_MAX_REQUEST_RESERVATION_MICRO_USD = estimateAiCostMicroUsd(
  AI_MAX_INPUT_TOKENS,
  AI_MAX_OUTPUT_TOKENS,
);

export function microUsdToUsd(value: number) {
  return value / 1_000_000;
}

export function formatUsdFromMicro(value: number) {
  return `$${microUsdToUsd(value).toFixed(4)}`;
}
