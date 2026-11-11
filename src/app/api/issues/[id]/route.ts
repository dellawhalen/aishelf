import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceBrandAccess } from "@/lib/workspace";

const statuses = new Set(["needs_review", "approved", "rejected", "resolved"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspace = await getWorkspaceBrandAccess(request);
    if (!workspace.authorized) return workspace.response;
    const brandId = workspace.brandId;
    const { id } = await context.params;
    const { reviewStatus } = await request.json() as { reviewStatus?: string };
    if (!reviewStatus || !statuses.has(reviewStatus)) {
      return NextResponse.json({ error: "Unsupported issue review status." }, { status: 400 });
    }
    const issue = await prisma.accuracyCheck.findFirst({
      where: { id, audit: { brandId } },
      select: { id: true },
    });
    if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    const updated = await prisma.accuracyCheck.update({
      where: { id: issue.id },
      data: { reviewStatus },
    });
    return NextResponse.json({ issue: updated });
  } catch (error) {
    console.error("Issue review status could not be updated.", error);
    return NextResponse.json({ error: "Issue review status could not be updated." }, { status: 500 });
  }
}
