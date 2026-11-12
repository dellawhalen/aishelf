import { APIError } from "openai";
import { NextResponse } from "next/server";
import { aiAuditRequestSchema, AI_AUDIT_MAX_REQUEST_BYTES } from "@/lib/ai-audit-schema";
import { getProductCompleteness } from "@/lib/products";
import {
  AiAuditInputLimitError,
  AiAuditOutputError,
  analyzeClothingResponse,
  OpenAIConfigurationError,
} from "@/lib/openai";
import {
  AiUsageBudgetExceededError,
  AiUsageInProgressError,
  AiUsagePreviousFailureError,
  AiUsageRateLimitError,
  AiUsageStorageError,
  AiUsageUncertainError,
} from "@/lib/ai-usage";
import { getWorkspaceBrandAccess, LOCAL_ORGANIZATION_ID } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

class RequestTooLargeError extends Error {}

async function readBoundedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > AI_AUDIT_MAX_REQUEST_BYTES) {
    throw new RequestTooLargeError();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > AI_AUDIT_MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new RequestTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function POST(request: Request) {
  try {
    const workspace = await getWorkspaceBrandAccess(request);
    if (!workspace.authorized) return workspace.response;
    const brandId = workspace.brandId;

    const rawBody = await readBoundedBody(request);
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
    }

    const parsedBody = aiAuditRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({
        error: "Provide a shopping question (up to 500 characters) and a captured response (up to 12,000 characters).",
      }, { status: 400 });
    }

    const brand = await prisma.brand.findFirst({
      where: { id: brandId, organizationId: LOCAL_ORGANIZATION_ID },
      include: {
        products: {
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: { id: true, name: true, description: true, price: true, category: true, imageUrl: true, specifications: true, requiredFields: true },
        },
      },
    });
    if (!brand) {
      return NextResponse.json({ error: "The selected brand could not be found." }, { status: 404 });
    }

    const completeness = getProductCompleteness(brand.products);
    const missingByProduct = new Map<string, string[]>();
    for (const snapshot of completeness.snapshots) {
      if (snapshot.completed) continue;
      const missing = missingByProduct.get(snapshot.productId) ?? [];
      missing.push(snapshot.fieldName);
      missingByProduct.set(snapshot.productId, missing);
    }

    const analysis = await analyzeClothingResponse({
      userId: workspace.userId,
      brandName: brand.name.slice(0, 160),
      question: parsedBody.data.question,
      response: parsedBody.data.response,
      products: brand.products.map((product) => ({
        id: product.id,
        name: product.name.slice(0, 160),
        description: product.description.slice(0, 1200),
        price: product.price,
        category: product.category.slice(0, 160),
        specifications: product.specifications.slice(0, 1800),
        missingFields: missingByProduct.get(product.id) ?? [],
      })),
    });
    const productIds = new Set(brand.products.map((product) => product.id));
    const hasUnknownProduct = [
      ...analysis.result.missingInformation.map((finding) => finding.productId),
      ...analysis.result.claimFindings.flatMap((finding) => finding.productId ? [finding.productId] : []),
      ...analysis.result.recommendations.flatMap((finding) => finding.productId ? [finding.productId] : []),
    ].some((productId) => !productIds.has(productId));
    if (hasUnknownProduct) {
      return NextResponse.json({ error: "OpenAI returned a finding linked to an unknown product. Please try again." }, { status: 502 });
    }
    return NextResponse.json(analysis, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return NextResponse.json({ error: "The request is too large. Shorten the captured response and try again." }, { status: 413 });
    }
    if (error instanceof AiAuditInputLimitError) {
      return NextResponse.json({ error: "The selected brand catalog and captured response exceed the AI input limit. Shorten the response or reduce catalog detail and try again." }, { status: 413 });
    }
    if (error instanceof OpenAIConfigurationError) {
      return NextResponse.json({ error: "The server-side OpenAI API key is not configured." }, { status: 503 });
    }
    if (error instanceof AiAuditOutputError) {
      return NextResponse.json({ error: "OpenAI returned an unusable audit. Please try again." }, { status: 502 });
    }
    if (error instanceof AiUsageRateLimitError) {
      return NextResponse.json({ error: "You have reached the limit of 10 AI analyses per hour. Please try again in the next hour." }, { status: 429 });
    }
    if (error instanceof AiUsageBudgetExceededError) {
      return NextResponse.json({ error: "The $15 AIShelf AI application budget is exhausted. The $5 demonstration reserve is not available for regular use." }, { status: 429 });
    }
    if (error instanceof AiUsageInProgressError) {
      return NextResponse.json({ error: "An identical analysis is already running. Wait briefly, then try again." }, { status: 409 });
    }
    if (error instanceof AiUsagePreviousFailureError) {
      return NextResponse.json({ error: "The previous identical analysis was billed but unusable. Wait five minutes or change the input before trying again." }, { status: 502 });
    }
    if (error instanceof AiUsageUncertainError) {
      return NextResponse.json({ error: "A previous identical request may have incurred cost. Its reservation is held; wait five minutes or change the input before retrying." }, { status: 409 });
    }
    if (error instanceof AiUsageStorageError) {
      return NextResponse.json({
        error: error.requestMayHaveBeenCharged
          ? "AI usage status could not be saved. This request may have incurred cost; do not retry until its status is checked."
          : "AI usage controls are not initialized or available. No OpenAI request was sent.",
      }, { status: 503 });
    }
    if (error instanceof APIError) {
      if (error.status === 429) {
        return NextResponse.json({ error: "OpenAI rejected this request because of provider rate limits or account limits. The reserved request budget remains held for safety." }, { status: 429 });
      }
      if (error.status === 401 || error.status === 403) {
        return NextResponse.json({ error: "OpenAI rejected the server-side API key. The reserved request budget remains held for safety." }, { status: 503 });
      }
      return NextResponse.json({ error: "OpenAI could not complete the audit. The reserved request budget remains held for safety; check usage before retrying." }, { status: 502 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "The request body could not be read as JSON." }, { status: 400 });
    }
    return NextResponse.json({ error: "AI analysis could not be completed. Check the local development server and try again." }, { status: 500 });
  }
}
