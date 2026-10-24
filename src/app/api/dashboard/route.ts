import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProductCompleteness } from "@/lib/products";
import { ensureLocalWorkspace, LOCAL_BRAND_ID, LOCAL_ORGANIZATION_ID } from "@/lib/workspace";

export async function GET() {
  try {
    await ensureLocalWorkspace();
    const [brand, audits, recommendations, followUps] = await Promise.all([
      prisma.brand.findFirst({
        where: { id: LOCAL_BRAND_ID, organizationId: LOCAL_ORGANIZATION_ID },
        include: { products: { orderBy: { updatedAt: "desc" } } },
      }),
      prisma.audit.findMany({
        where: { organizationId: LOCAL_ORGANIZATION_ID, brandId: LOCAL_BRAND_ID },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          responses: { include: { competitorMentions: true } },
          accuracyChecks: { include: { product: { select: { id: true, name: true } } } },
          categoryScores: true,
          productFieldSnapshots: true,
          scoreSnapshot: true,
        },
      }),
      prisma.recommendation.findMany({
        where: { organizationId: LOCAL_ORGANIZATION_ID, brandId: LOCAL_BRAND_ID },
        orderBy: { createdAt: "desc" },
        include: { statusChanges: { orderBy: { changedAt: "desc" }, take: 5 } },
      }),
      prisma.followUpAudit.findMany({
        where: { organizationId: LOCAL_ORGANIZATION_ID, brandId: LOCAL_BRAND_ID },
        orderBy: { scheduledFor: "asc" },
      }),
    ]);

    if (!brand) {
      return NextResponse.json({ error: "The local workspace brand could not be loaded." }, { status: 500 });
    }

    const latest = audits[0] ?? null;
    const previousComparable = latest
      ? audits.find((audit) =>
        audit.id !== latest.id &&
        audit.sourceType === latest.sourceType &&
        audit.sourceName === latest.sourceName &&
        audit.collectionMethod === latest.collectionMethod &&
        audit.methodologyVersion === latest.methodologyVersion &&
        audit.questionSetHash === latest.questionSetHash
      )
      : null;
    const catalogCompleteness = getProductCompleteness(brand.products);

    return NextResponse.json({
      brand: { id: brand.id, name: brand.name },
      products: brand.products,
      latestAudit: latest,
      history: audits.map((audit) => ({
        id: audit.id,
        date: audit.createdAt,
        sourceType: audit.sourceType,
        sourceName: audit.sourceName,
        collectionMethod: audit.collectionMethod,
        evidence: {
          responses: audit.responses.map((response) => ({
            question: response.question,
            response: response.response,
            brandMentioned: response.brandMentioned,
          })),
          accuracyChecks: audit.accuracyChecks.map((check) => ({
            claim: check.claim,
            observedValue: check.observedValue,
            verifiedValue: check.verifiedValue,
            outcome: check.outcome,
          })),
        },
        sampleSize: audit.sampleSize,
        score: audit.scoreSnapshot?.overallScore ?? null,
        classification: audit.scoreSnapshot?.classification ?? "Insufficient Data",
        categoryScores: audit.categoryScores,
        questionSetHash: audit.questionSetHash,
        methodologyVersion: audit.methodologyVersion,
      })),
      previousComparable: previousComparable
        ? { id: previousComparable.id, score: previousComparable.scoreSnapshot?.overallScore ?? null }
        : null,
      recommendations,
      followUps,
      catalogCompleteness,
    });
  } catch (error) {
    console.error("Dashboard data could not be loaded.", error);
    return NextResponse.json({ error: "Dashboard data could not be loaded. Check the database setup." }, { status: 500 });
  }
}
