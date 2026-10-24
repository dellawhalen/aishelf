import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureLocalWorkspace, LOCAL_BRAND_ID, LOCAL_ORGANIZATION_ID } from "@/lib/workspace";

const approvalStatuses = new Set(["pending", "approved", "rejected"]);
const completionStatuses = new Set(["not_started", "in_progress", "implemented"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureLocalWorkspace();
    const { id } = await context.params;
    const body = await request.json() as { approvalStatus?: string; completionStatus?: string };
    if (
      (body.approvalStatus !== undefined && !approvalStatuses.has(body.approvalStatus)) ||
      (body.completionStatus !== undefined && !completionStatuses.has(body.completionStatus))
    ) {
      return NextResponse.json({ error: "Unsupported recommendation status." }, { status: 400 });
    }
    const existing = await prisma.recommendation.findFirst({
      where: { id, organizationId: LOCAL_ORGANIZATION_ID, brandId: LOCAL_BRAND_ID },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Recommendation not found." }, { status: 404 });
    const recommendation = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.recommendation.update({
        where: { id: existing.id },
        data: {
          ...(body.approvalStatus ? { approvalStatus: body.approvalStatus } : {}),
          ...(body.completionStatus ? { completionStatus: body.completionStatus } : {}),
        },
      });
      if (body.approvalStatus || body.completionStatus) {
        await transaction.recommendationStatusChange.create({
          data: {
            recommendationId: updated.id,
            approvalStatus: updated.approvalStatus,
            completionStatus: updated.completionStatus,
          },
        });
      }
      return updated;
    });
    return NextResponse.json({ recommendation });
  } catch (error) {
    console.error("Recommendation status could not be updated.", error);
    return NextResponse.json({ error: "Recommendation status could not be updated." }, { status: 500 });
  }
}
