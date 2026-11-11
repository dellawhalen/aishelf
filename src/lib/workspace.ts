import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceUserAccess } from "@/lib/workspace-auth";

export const LOCAL_ORGANIZATION_ID = "local-org";
export const LOCAL_BRAND_ID = "local-brand";

export async function ensureLocalWorkspace() {
  await prisma.organization.upsert({
    where: { id: LOCAL_ORGANIZATION_ID },
    update: {},
    create: {
      id: LOCAL_ORGANIZATION_ID,
      name: "AIShelf Local Workspace",
      brands: {
        create: { id: LOCAL_BRAND_ID, name: "Your brand" },
      },
    },
  });
  await prisma.brand.upsert({
    where: { id: LOCAL_BRAND_ID },
    update: {},
    create: {
      id: LOCAL_BRAND_ID,
      organizationId: LOCAL_ORGANIZATION_ID,
      name: "Your brand",
    },
  });
}

export async function getWorkspaceBrandAccess(request: Request) {
  const access = await getWorkspaceUserAccess();
  if (!access.authorized) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: access.message }, { status: access.status }),
    };
  }

  await ensureLocalWorkspace();
  const requestedBrandId = request.headers.get("x-aishelf-brand-id")?.trim() || LOCAL_BRAND_ID;
  const brand = await prisma.brand.findFirst({
    where: { id: requestedBrandId, organizationId: LOCAL_ORGANIZATION_ID },
    select: { id: true },
  });
  if (!brand) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "The selected brand could not be found." }, { status: 404 }),
    };
  }
  return { authorized: true as const, brandId: brand.id, userId: access.userId };
}
