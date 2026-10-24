export type ProductFields = {
  name: string;
  description: string;
  price: number | null;
  category: string;
  imageUrl: string;
  specifications: string;
  requiredFields: string;
};

export function getProductCompleteness(products: ProductFields[]) {
  const snapshots: Array<{
    productId: string;
    productName: string;
    fieldName: string;
    fieldValue: string;
    completed: boolean;
  }> = [];
  const fields: (keyof ProductFields)[] = ["name", "description", "price", "category", "imageUrl"];
  let completed = 0;
  let required = 0;

  for (const product of products) {
    let applicable: string[];
    try {
      const parsed: unknown = JSON.parse(product.requiredFields);
      applicable = Array.isArray(parsed)
        ? parsed.filter((field): field is string => typeof field === "string")
        : [];
    } catch {
      applicable = [];
    }
    for (const field of new Set([...fields, ...applicable])) {
      const value = product[field as keyof ProductFields];
      const isComplete = field === "price"
        ? typeof value === "number" && Number.isFinite(value) && value >= 0
        : typeof value === "string" && value.trim().length > 0 && !(field === "specifications" && value === "{}");
      const fieldValue = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
      required += 1;
      if (isComplete) completed += 1;
      snapshots.push({
        productId: "id" in product && typeof product.id === "string" ? product.id : "",
        productName: "name" in product ? product.name : "",
        fieldName: field,
        fieldValue,
        completed: isComplete,
      });
    }
  }
  return { completed, required, snapshots };
}
