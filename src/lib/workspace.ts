import { prisma } from "@/lib/prisma";

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
