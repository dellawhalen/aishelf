import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureLocalWorkspace, LOCAL_BRAND_ID } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    await ensureLocalWorkspace();
    const body = await request.json() as {
      name?: string;
      description?: string;
      price?: number | null;
      category?: string;
      imageUrl?: string;
      specifications?: string;
      requiresSpecifications?: boolean;
    };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Product name is required." }, { status: 400 });
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
    const product = await prisma.product.create({
      data: {
        brandId: LOCAL_BRAND_ID,
        name,
        description: body.description?.trim() ?? "",
        price: body.price ?? null,
        category: body.category?.trim() ?? "",
        imageUrl: body.imageUrl?.trim() ?? "",
        specifications: JSON.stringify(specifications),
        requiredFields: JSON.stringify(["description", "price", "category", "imageUrl", ...(body.requiresSpecifications ? ["specifications"] : [])]),
      },
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error("Product could not be saved.", error);
    return NextResponse.json({ error: "Product could not be saved." }, { status: 500 });
  }
}
