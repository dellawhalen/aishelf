import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureLocalWorkspace, LOCAL_BRAND_ID, LOCAL_ORGANIZATION_ID } from "@/lib/workspace";

type RecommendationInput = {
  evidenceRef: string;
  accuracyCheckId?: string;
  category: string;
  productId?: string | null;
  title: string;
  issue: string;
  supportingEvidence: string;
  recommendedAction: string;
  whyItMatters: string;
  priority: string;
  effort: string;
};

export async function POST(request: Request) {
  try {
    await ensureLocalWorkspace();
    const { auditId } = await request.json() as { auditId?: string };
    const audit = await prisma.audit.findFirst({
      where: { id: auditId, organizationId: LOCAL_ORGANIZATION_ID, brandId: LOCAL_BRAND_ID },
      include: {
        accuracyChecks: true,
        responses: { include: { competitorMentions: true } },
        productFieldSnapshots: true,
      },
    });
    if (!audit) return NextResponse.json({ error: "The selected audit was not found." }, { status: 404 });

    const candidates: RecommendationInput[] = [];
    for (const check of audit.accuracyChecks) {
      if (check.outcome !== "INACCURATE" && check.outcome !== "MISSING") continue;
      candidates.push({
        evidenceRef: check.id,
        accuracyCheckId: check.id,
        category: "accuracy",
        productId: check.productId,
        title: check.discrepancyType === "incorrect_price" || check.discrepancyType === "price"
          ? "Review inconsistent product pricing"
          : check.outcome === "MISSING"
            ? "Complete missing product information"
            : "Review a product information discrepancy",
        issue: check.claim,
        supportingEvidence: `Captured: "${check.observedValue || "information not present"}". Verified business information: "${check.verifiedValue}".`,
        recommendedAction: check.suggestedCorrection || "Compare the captured response with verified product information, then review the relevant authorized product pages and feeds.",
        whyItMatters: "Accurate, complete source information gives AI shopping systems clearer evidence to describe this product. Changes do not guarantee improved visibility or recommendations.",
        priority: check.severity,
        effort: "medium",
      });
    }
    for (const response of audit.responses) {
      if (!response.brandMentioned) {
        candidates.push({
          evidenceRef: response.id,
          category: "visibility",
          productId: response.productId,
          title: "Review a sampled brand-absence result",
          issue: `Your brand was not mentioned for: “${response.question}”`,
          supportingEvidence: response.response,
          recommendedAction: "Review whether the question describes a product or use case you serve, then check that relevant product details are complete and consistently available.",
          whyItMatters: "This is one sampled response, not proof of broad platform visibility. Reviewing relevant source information can help identify possible gaps.",
          priority: "medium",
          effort: "medium",
        });
      }
      for (const mention of response.competitorMentions) {
        if (response.brandMentioned) continue;
        candidates.push({
          evidenceRef: mention.id,
          category: "competitive",
          productId: response.productId,
          title: `Review competitor mentions for ${mention.competitor}`,
          issue: `A competitor appeared in a sampled question where your brand was absent.`,
          supportingEvidence: `Question: “${response.question}” · Competitor mentions recorded: ${mention.mentionCount}. Captured response: ${response.response}`,
          recommendedAction: "Compare the sampled question with the product details and category coverage in your catalog.",
          whyItMatters: "This helps identify a product-information opportunity in this sample; it is not a market-share measurement or ranking.",
          priority: "medium",
          effort: "low",
        });
      }
    }
    for (const field of audit.productFieldSnapshots) {
      if (field.completed) continue;
      candidates.push({
        evidenceRef: field.id,
        category: "completeness",
        productId: field.productId,
        title: `Add ${field.fieldName} for ${field.productName}`,
        issue: `${field.productName} is missing an applicable ${field.fieldName} field.`,
        supportingEvidence: `Audit snapshot: ${field.productName} · ${field.fieldName} was empty.`,
        recommendedAction: `Open the product catalog and add verified ${field.fieldName} information for ${field.productName}.`,
        whyItMatters: "Complete applicable product details make the business-provided product record more useful for auditing.",
        priority: "low",
        effort: "low",
      });
    }

    if (candidates.length === 0) {
      return NextResponse.json({ error: "This audit contains no recorded findings that need an action." }, { status: 400 });
    }
    const existing = await prisma.recommendation.findMany({
      where: { evidenceRef: { in: candidates.map((candidate) => candidate.evidenceRef) } },
      select: { evidenceRef: true },
    });
    const existingReferences = new Set(existing.map((item) => item.evidenceRef));
    const missingCandidates = candidates.filter((candidate) => !existingReferences.has(candidate.evidenceRef));
    if (missingCandidates.length === 0) {
      return NextResponse.json({ recommendations: [], message: "Recommendations already exist for every recorded finding." });
    }

    const recommendations = await prisma.$transaction(
      missingCandidates.map((candidate) => prisma.recommendation.create({
        data: {
          ...candidate,
          organizationId: LOCAL_ORGANIZATION_ID,
          brandId: LOCAL_BRAND_ID,
          auditId: audit.id,
        },
      })),
    );
    return NextResponse.json({ recommendations }, { status: 201 });
  } catch (error) {
    console.error("Recommendations could not be created.", error);
    return NextResponse.json({ error: "Recommendations could not be created." }, { status: 500 });
  }
}
