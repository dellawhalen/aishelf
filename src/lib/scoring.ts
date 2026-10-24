export const METHODOLOGY_VERSION = "1.0";

export const CATEGORY_WEIGHTS = {
  visibility: 0.35,
  accuracy: 0.3,
  competitive: 0.2,
  completeness: 0.15,
} as const;

export const CATEGORY_CALCULATIONS = {
  visibility: "Brand-mentioning responses ÷ valid sampled responses × 100.",
  accuracy: "Verified claims matching business information ÷ all verified claims × 100. Missing and unverified claims are excluded.",
  competitive: "Brand-mentioning responses ÷ (brand-mentioning responses + recorded competitor mentions) × 100.",
  completeness: "Completed applicable product fields ÷ applicable required product fields × 100.",
} as const;

export type CategoryKey = keyof typeof CATEGORY_WEIGHTS;
export type ScoreSource = "SIMULATED" | "EXTERNAL";
export type CategoryResult = { score: number | null; evidenceCount: number; calculation: string };

export type ScoreInput = {
  sourceType: ScoreSource;
  responses: Array<{ brandMentioned: boolean }>;
  competitorMentionCount: number;
  accuracyChecks: Array<{ outcome: string }>;
  completedProductFields: number;
  requiredProductFields: number;
};

export type ScoreResult = {
  categories: Record<CategoryKey, CategoryResult>;
  overall: number | null;
  classification: string;
};

const round = (value: number) => Math.round(value);

export function classifyScore(score: number | null): string {
  if (score === null) return "Insufficient Data";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Needs Improvement";
  if (score >= 40) return "Low Visibility";
  return "Critical";
}

export function calculateScores(input: ScoreInput): ScoreResult {
  const responseCount = input.responses.length;
  const brandMentions = input.responses.filter((response) => response.brandMentioned).length;
  const checkedClaims = input.accuracyChecks.filter((check) =>
    check.outcome === "ACCURATE" || check.outcome === "INACCURATE"
  );
  const accurateClaims = checkedClaims.filter((check) => check.outcome === "ACCURATE").length;

  const categories: Record<CategoryKey, CategoryResult> = {
    visibility: {
      score: responseCount > 0 ? round((brandMentions / responseCount) * 100) : null,
      evidenceCount: responseCount,
      calculation: CATEGORY_CALCULATIONS.visibility,
    },
    accuracy: {
      score: checkedClaims.length > 0 ? round((accurateClaims / checkedClaims.length) * 100) : null,
      evidenceCount: checkedClaims.length,
      calculation: CATEGORY_CALCULATIONS.accuracy,
    },
    competitive: {
      score: input.competitorMentionCount > 0
        ? round((brandMentions / (brandMentions + input.competitorMentionCount)) * 100)
        : null,
      evidenceCount: input.competitorMentionCount,
      calculation: CATEGORY_CALCULATIONS.competitive,
    },
    completeness: {
      score: input.requiredProductFields > 0
        ? round((input.completedProductFields / input.requiredProductFields) * 100)
        : null,
      evidenceCount: input.requiredProductFields,
      calculation: CATEGORY_CALCULATIONS.completeness,
    },
  };

  const allCategoriesHaveEvidence = Object.values(categories).every((category) => category.score !== null);
  const overall = allCategoriesHaveEvidence
    ? round(
      categories.visibility.score! * CATEGORY_WEIGHTS.visibility +
      categories.accuracy.score! * CATEGORY_WEIGHTS.accuracy +
      categories.competitive.score! * CATEGORY_WEIGHTS.competitive +
      categories.completeness.score! * CATEGORY_WEIGHTS.completeness,
    )
    : null;

  return { categories, overall, classification: classifyScore(overall) };
}
