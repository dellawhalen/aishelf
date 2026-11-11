import { z } from "zod";

export const AI_AUDIT_MAX_REQUEST_BYTES = 16 * 1024;
export const AI_AUDIT_MAX_RESPONSE_LENGTH = 12_000;

export const aiAuditRequestSchema = z.strictObject({
  question: z.string().trim().min(1).max(500),
  response: z.string().trim().min(1).max(AI_AUDIT_MAX_RESPONSE_LENGTH),
});

const competitorMentionSchema = z.strictObject({
  competitor: z.string().trim().min(1).max(160),
  mentionCount: z.number().int().min(1).max(100),
  evidence: z.string().trim().min(1).max(500),
});

const missingInformationSchema = z.strictObject({
  productId: z.string().min(1),
  productName: z.string().trim().min(1).max(160),
  fieldName: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(500),
  recommendation: z.string().trim().min(1).max(1000),
});

const claimFindingSchema = z.strictObject({
  productId: z.string().nullable(),
  productName: z.string().nullable(),
  claim: z.string().trim().min(1).max(500),
  observedValue: z.string().max(1000),
  verifiedValue: z.string().max(1000),
  outcome: z.enum(["ACCURATE", "INACCURATE", "MISSING", "UNVERIFIED"]),
  discrepancyType: z.enum([
    "incorrect_price",
    "outdated_description",
    "unsupported_claim",
    "inaccurate_attribute",
    "missing_information",
    "unverified",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  evidenceQuote: z.string().max(700),
  suggestedCorrection: z.string().max(1000),
});

const recommendationSchema = z.strictObject({
  category: z.enum(["accuracy", "visibility", "competitive", "completeness"]),
  productId: z.string().nullable(),
  title: z.string().trim().min(1).max(160),
  issue: z.string().trim().min(1).max(1000),
  supportingEvidence: z.string().trim().min(1).max(1200),
  recommendedAction: z.string().trim().min(1).max(1200),
  whyItMatters: z.string().trim().min(1).max(1000),
  priority: z.enum(["low", "medium", "high"]),
  effort: z.enum(["low", "medium", "high"]),
});

export const aiAuditResultSchema = z.strictObject({
  brandMentioned: z.boolean(),
  brandEvidence: z.string().max(700),
  competitorMentions: z.array(competitorMentionSchema).max(20),
  missingInformation: z.array(missingInformationSchema).max(15),
  claimFindings: z.array(claimFindingSchema).max(15),
  recommendations: z.array(recommendationSchema).max(20),
});

export type AiAuditRequest = z.infer<typeof aiAuditRequestSchema>;
export type AiAuditResult = z.infer<typeof aiAuditResultSchema>;
