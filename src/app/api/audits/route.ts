import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProductCompleteness } from "@/lib/products";
import { calculateScores, METHODOLOGY_VERSION } from "@/lib/scoring";
import { getWorkspaceBrandAccess, LOCAL_ORGANIZATION_ID } from "@/lib/workspace";

type AccuracyInput = {
  productId: string;
  claim: string;
  observedValue: string;
  verifiedValue: string;
  outcome: "ACCURATE" | "INACCURATE" | "MISSING" | "UNVERIFIED";
  discrepancyType: string;
  severity: "low" | "medium" | "high";
  suggestedCorrection: string;
};

type RecommendationInput = {
  category: "accuracy" | "visibility" | "competitive" | "completeness";
  productId: string | null;
  title: string;
  issue: string;
  supportingEvidence: string;
  recommendedAction: string;
  whyItMatters: string;
  priority: "low" | "medium" | "high";
  effort: "low" | "medium" | "high";
};

type AuditBody = {
  sourceType: "SIMULATED" | "EXTERNAL";
  sourceName: string;
  collectionMethod: string;
  question: string;
  response: string;
  brandMentioned: boolean;
  competitorMentions: Array<{ competitor: string; mentionCount: number }>;
  accuracyCheck?: AccuracyInput;
  accuracyChecks?: AccuracyInput[];
  recommendations?: RecommendationInput[];
};

function isNonEmptyText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

export async function POST(request: Request) {
  try {
    const workspace = await getWorkspaceBrandAccess(request);
    if (!workspace.authorized) return workspace.response;
    const brandId = workspace.brandId;
    const body = await request.json() as AuditBody;
    const question = body.question?.trim();
    const responseText = body.response?.trim();
    const sourceType = body.sourceType;
    if (
      !question || !responseText ||
      (sourceType !== "SIMULATED" && sourceType !== "EXTERNAL") ||
      !body.sourceName?.trim() || !body.collectionMethod?.trim()
    ) {
      return NextResponse.json({ error: "Source, collection method, exact question, and captured response are required." }, { status: 400 });
    }
    if (typeof body.brandMentioned !== "boolean") {
      return NextResponse.json({ error: "Brand mention status must be explicitly confirmed." }, { status: 400 });
    }
    if (!Array.isArray(body.competitorMentions)) {
      return NextResponse.json({ error: "Competitor mentions must be provided as a list." }, { status: 400 });
    }

    if (body.accuracyCheck && body.accuracyChecks) {
      return NextResponse.json({ error: "Use either one accuracy check or an accuracy-check list, not both." }, { status: 400 });
    }
    const accuracyChecks = body.accuracyChecks ?? (body.accuracyCheck ? [body.accuracyCheck] : []);
    const recommendations = body.recommendations ?? [];
    if (!Array.isArray(accuracyChecks) || accuracyChecks.length > 31) {
      return NextResponse.json({ error: "An audit can include at most 31 product claim checks." }, { status: 400 });
    }
    if (!Array.isArray(recommendations) || recommendations.length > 20) {
      return NextResponse.json({ error: "An audit can include at most 20 recommendations." }, { status: 400 });
    }

    const invalidCompetitor = body.competitorMentions.some((mention) =>
      !mention ||
      typeof mention.competitor !== "string" ||
      mention.competitor.trim().length === 0 ||
      mention.competitor.length > 160 ||
      !Number.isInteger(mention.mentionCount) ||
      mention.mentionCount <= 0
    );
    if (invalidCompetitor) {
      return NextResponse.json({ error: "Each competitor mention needs a name and positive whole-number count." }, { status: 400 });
    }
    const competitorMentions = body.competitorMentions;
    const validOutcomes = ["ACCURATE", "INACCURATE", "MISSING", "UNVERIFIED"];
    const validSeverities = ["low", "medium", "high"];
    const invalidAccuracy = accuracyChecks.some((accuracy) =>
      !accuracy || typeof accuracy.productId !== "string" ||
      !isNonEmptyText(accuracy.claim, 500) ||
      !isNonEmptyText(accuracy.verifiedValue, 1000) ||
      typeof accuracy.observedValue !== "string" || accuracy.observedValue.length > 1000 ||
      (accuracy.outcome !== "MISSING" && !accuracy.observedValue.trim()) ||
      !validOutcomes.includes(accuracy.outcome) ||
      !validSeverities.includes(accuracy.severity) ||
      typeof accuracy.suggestedCorrection !== "string" || accuracy.suggestedCorrection.length > 1000
    );
    if (invalidAccuracy) {
      return NextResponse.json({ error: "Each claim check requires a product, claim, verified value, valid outcome and severity; non-missing observations also need an observed value." }, { status: 400 });
    }
    const validCategories = ["accuracy", "visibility", "competitive", "completeness"];
    const invalidRecommendation = recommendations.some((recommendation) =>
      !recommendation ||
      !validCategories.includes(recommendation.category) ||
      (recommendation.productId !== null && typeof recommendation.productId !== "string") ||
      !isNonEmptyText(recommendation.title, 160) ||
      !isNonEmptyText(recommendation.issue, 1000) ||
      !isNonEmptyText(recommendation.supportingEvidence, 1200) ||
      !isNonEmptyText(recommendation.recommendedAction, 1200) ||
      !isNonEmptyText(recommendation.whyItMatters, 1000) ||
      !validSeverities.includes(recommendation.priority) ||
      !validSeverities.includes(recommendation.effort)
    );
    if (invalidRecommendation) {
      return NextResponse.json({ error: "Each recommendation requires complete text, a valid category, priority and effort." }, { status: 400 });
    }
    const productIds = [...new Set([
      ...accuracyChecks.map((accuracy) => accuracy.productId),
      ...recommendations.flatMap((recommendation) => recommendation.productId ? [recommendation.productId] : []),
    ])];
    const productsById = new Map((await prisma.product.findMany({
      where: { id: { in: productIds }, brandId },
      select: { id: true },
    })).map((product) => [product.id, product]));
    if (productIds.some((productId) => !productsById.has(productId))) {
      return NextResponse.json({ error: "A selected product does not belong to this workspace." }, { status: 400 });
    }

    const responseId = randomUUID();
    const accuracyCheckIds = accuracyChecks.map(() => randomUUID());
    const products = await prisma.product.findMany({ where: { brandId } });
    const productCompleteness = getProductCompleteness(products);
    const scoreResult = calculateScores({
      sourceType,
      responses: [{ brandMentioned: Boolean(body.brandMentioned) }],
      competitorMentionCount: competitorMentions.reduce((total, item) => total + item.mentionCount, 0),
      accuracyChecks: accuracyChecks.map((accuracy) => ({ outcome: accuracy.outcome })),
      completedProductFields: productCompleteness.completed,
      requiredProductFields: productCompleteness.required,
    });
    const questionSetHash = createHash("sha256").update(question.toLocaleLowerCase().trim()).digest("hex");

    const audit = await prisma.audit.create({
      data: {
        organizationId: LOCAL_ORGANIZATION_ID,
        brandId,
        sourceType,
        sourceName: body.sourceName.trim(),
        collectionMethod: body.collectionMethod.trim(),
        methodologyVersion: METHODOLOGY_VERSION,
        questionSetHash,
        sampleSize: 1,
        responses: {
          create: {
            id: responseId,
            question,
            response: responseText,
            sourceName: body.sourceName.trim(),
            collectionMethod: body.collectionMethod.trim(),
            brandMentioned: Boolean(body.brandMentioned),
            competitorMentions: {
              create: competitorMentions.map((item) => ({
                competitor: item.competitor.trim(),
                mentionCount: item.mentionCount,
              })),
            },
          },
        },
        ...(accuracyChecks.length ? {
          accuracyChecks: {
            create: accuracyChecks.map((accuracy, index) => ({
              id: accuracyCheckIds[index],
              responseId,
              productId: productsById.get(accuracy.productId)?.id,
              claim: accuracy.claim.trim(),
              observedValue: accuracy.observedValue.trim(),
              verifiedValue: accuracy.verifiedValue.trim(),
              outcome: accuracy.outcome,
              discrepancyType: accuracy.discrepancyType || "unspecified",
              severity: accuracy.severity,
              suggestedCorrection: accuracy.suggestedCorrection?.trim() ?? "",
            })),
          },
        } : {}),
        ...(recommendations.length ? {
          recommendations: {
            create: recommendations.map((recommendation) => ({
              organizationId: LOCAL_ORGANIZATION_ID,
              brandId,
              category: recommendation.category,
              productId: recommendation.productId ? productsById.get(recommendation.productId)?.id : null,
              title: recommendation.title.trim(),
              issue: recommendation.issue.trim(),
              supportingEvidence: recommendation.supportingEvidence.trim(),
              recommendedAction: recommendation.recommendedAction.trim(),
              whyItMatters: recommendation.whyItMatters.trim(),
              priority: recommendation.priority,
              effort: recommendation.effort,
            })),
          },
        } : {}),
        categoryScores: {
          create: Object.entries(scoreResult.categories).map(([category, result]) => ({
            category,
            score: result.score,
            evidenceCount: result.evidenceCount,
            calculation: result.calculation,
          })),
        },
        productFieldSnapshots: {
          create: productCompleteness.snapshots.map((snapshot) => ({
            productId: snapshot.productId,
            productName: snapshot.productName,
            fieldName: snapshot.fieldName,
            fieldValue: snapshot.fieldValue,
            completed: snapshot.completed,
          })),
        },
        scoreSnapshot: {
          create: {
            organizationId: LOCAL_ORGANIZATION_ID,
            brandId,
            overallScore: scoreResult.overall,
            classification: scoreResult.classification,
            methodologyVersion: METHODOLOGY_VERSION,
            sourceType,
            sampleSize: 1,
            evidenceReferences: JSON.stringify({
              responseIds: [responseId],
              accuracyCheckIds,
              productIds: products.map((item) => item.id),
            }),
          },
        },
      },
      include: { categoryScores: true, scoreSnapshot: true },
    });

    return NextResponse.json({ audit }, { status: 201 });
  } catch (error) {
    console.error("Audit evidence could not be saved.", error);
    return NextResponse.json({ error: "Audit evidence could not be saved." }, { status: 500 });
  }
}
