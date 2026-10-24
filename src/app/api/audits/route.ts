import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProductCompleteness } from "@/lib/products";
import { calculateScores, METHODOLOGY_VERSION } from "@/lib/scoring";
import { ensureLocalWorkspace, LOCAL_BRAND_ID, LOCAL_ORGANIZATION_ID } from "@/lib/workspace";

type AuditBody = {
  sourceType: "SIMULATED" | "EXTERNAL";
  sourceName: string;
  collectionMethod: string;
  question: string;
  response: string;
  brandMentioned: boolean;
  competitorMentions: Array<{ competitor: string; mentionCount: number }>;
  accuracyCheck?: {
    productId: string;
    claim: string;
    observedValue: string;
    verifiedValue: string;
    outcome: "ACCURATE" | "INACCURATE" | "MISSING" | "UNVERIFIED";
    discrepancyType: string;
    severity: "low" | "medium" | "high";
    suggestedCorrection: string;
  };
};

export async function POST(request: Request) {
  try {
    await ensureLocalWorkspace();
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

    const product = body.accuracyCheck?.productId
      ? await prisma.product.findFirst({
        where: { id: body.accuracyCheck.productId, brandId: LOCAL_BRAND_ID },
        select: { id: true },
      })
      : null;
    if (body.accuracyCheck?.productId && !product) {
      return NextResponse.json({ error: "The selected product does not belong to this workspace." }, { status: 400 });
    }

    const invalidCompetitor = body.competitorMentions.some((mention) =>
      typeof mention.competitor !== "string" ||
      mention.competitor.trim().length === 0 ||
      !Number.isInteger(mention.mentionCount) ||
      mention.mentionCount <= 0
    );
    if (invalidCompetitor) {
      return NextResponse.json({ error: "Each competitor mention needs a name and positive whole-number count." }, { status: 400 });
    }
    const competitorMentions = body.competitorMentions;
    const accuracy = body.accuracyCheck;
    if (accuracy && (
      !accuracy.productId ||
      !accuracy.claim?.trim() ||
      !accuracy.verifiedValue?.trim() ||
      (accuracy.outcome !== "MISSING" && !accuracy.observedValue?.trim()) ||
      !["ACCURATE", "INACCURATE", "MISSING", "UNVERIFIED"].includes(accuracy.outcome) ||
      !["low", "medium", "high"].includes(accuracy.severity)
    )) {
      return NextResponse.json({ error: "A claim check requires a product, claim, verified value, valid outcome and severity; non-missing observations also need an observed value." }, { status: 400 });
    }

    const responseId = randomUUID();
    const accuracyCheckId = accuracy ? randomUUID() : null;
    const products = await prisma.product.findMany({ where: { brandId: LOCAL_BRAND_ID } });
    const productCompleteness = getProductCompleteness(products);
    const scoreResult = calculateScores({
      sourceType,
      responses: [{ brandMentioned: Boolean(body.brandMentioned) }],
      competitorMentionCount: competitorMentions.reduce((total, item) => total + item.mentionCount, 0),
      accuracyChecks: accuracy ? [{ outcome: accuracy.outcome }] : [],
      completedProductFields: productCompleteness.completed,
      requiredProductFields: productCompleteness.required,
    });
    const questionSetHash = createHash("sha256").update(question.toLocaleLowerCase().trim()).digest("hex");

    const audit = await prisma.audit.create({
      data: {
        organizationId: LOCAL_ORGANIZATION_ID,
        brandId: LOCAL_BRAND_ID,
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
        ...(accuracy ? {
          accuracyChecks: {
            create: {
              id: accuracyCheckId!,
              responseId,
              productId: product?.id,
              claim: accuracy.claim.trim(),
              observedValue: accuracy.observedValue.trim(),
              verifiedValue: accuracy.verifiedValue.trim(),
              outcome: accuracy.outcome,
              discrepancyType: accuracy.discrepancyType || "unspecified",
              severity: accuracy.severity,
              suggestedCorrection: accuracy.suggestedCorrection?.trim() ?? "",
            },
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
            brandId: LOCAL_BRAND_ID,
            overallScore: scoreResult.overall,
            classification: scoreResult.classification,
            methodologyVersion: METHODOLOGY_VERSION,
            sourceType,
            sampleSize: 1,
            evidenceReferences: JSON.stringify({
              responseIds: [responseId],
              accuracyCheckIds: accuracyCheckId ? [accuracyCheckId] : [],
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
