import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceBrandAccess, LOCAL_ORGANIZATION_ID } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    const workspace = await getWorkspaceBrandAccess(request);
    if (!workspace.authorized) return workspace.response;
    const brandId = workspace.brandId;
    const { scheduledFor } = await request.json() as { scheduledFor?: string };
    const date = scheduledFor ? new Date(scheduledFor) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Choose a valid future date for the follow-up audit." }, { status: 400 });
    }
    const followUp = await prisma.followUpAudit.create({
      data: {
        organizationId: LOCAL_ORGANIZATION_ID,
        brandId,
        scheduledFor: date,
      },
    });
    return NextResponse.json({ followUp }, { status: 201 });
  } catch (error) {
    console.error("Follow-up audit could not be scheduled.", error);
    return NextResponse.json({ error: "Follow-up audit could not be scheduled." }, { status: 500 });
  }
}
