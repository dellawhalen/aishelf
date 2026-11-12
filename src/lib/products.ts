export type ProductFields = {
  name: string;
  description: string;
  price: number | null;
  category: string;
  imageUrl: string;
  specifications: string;
  requiredFields: string;
};

function hasValue(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return typeof value === "boolean";
}

function getFieldValue(product: ProductFields, field: string): unknown {
  if (!field.startsWith("specifications.")) return product[field as keyof ProductFields];
  try {
    let value: unknown = JSON.parse(product.specifications);
    for (const key of field.slice("specifications.".length).split(".")) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
      value = (value as Record<string, unknown>)[key];
    }
    return value;
  } catch {
    return undefined;
  }
}

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
      const value = getFieldValue(product, field);
      const isComplete = field === "price"
        ? typeof value === "number" && Number.isFinite(value) && value >= 0
        : field === "specifications"
          ? typeof value === "string" && value.trim().length > 0 && value !== "{}"
          : hasValue(value);
      const fieldValue = value == null
        ? ""
        : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value) ?? "";
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
