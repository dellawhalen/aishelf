import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureLocalWorkspace, LOCAL_BRAND_ID } from "@/lib/workspace";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureLocalWorkspace();
    const { id } = await context.params;
    const body = await request.json() as {
      name?: string; description?: string; price?: number | null; category?: string; imageUrl?: string;
      specifications?: string; requiresSpecifications?: boolean;
    };
    if (!body.name?.trim()) return NextResponse.json({ error: "Product name is required." }, { status: 400 });
    if (body.price != null && (!Number.isFinite(body.price) || body.price < 0)) {
      return NextResponse.json({ error: "Price must be a non-negative number." }, { status: 400 });
    }
    let specifications: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(body.specifications || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object.");
      specifications = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Specifications must be a valid JSON object." }, { status: 400 });
    }
    const existing = await prisma.product.findFirst({ where: { id, brandId: LOCAL_BRAND_ID }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const product = await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: body.name.trim(),
        description: body.description?.trim() ?? "",
        price: body.price ?? null,
        category: body.category?.trim() ?? "",
        imageUrl: body.imageUrl?.trim() ?? "",
        specifications: JSON.stringify(specifications),
        requiredFields: JSON.stringify(["description", "price", "category", "imageUrl", ...(body.requiresSpecifications ? ["specifications"] : [])]),
      },
    });
    return NextResponse.json({ product });
  } catch (error) {
    console.error("Product could not be updated.", error);
    return NextResponse.json({ error: "Product could not be updated." }, { status: 500 });
  }
}
