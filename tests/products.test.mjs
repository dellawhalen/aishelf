import test from "node:test";
import assert from "node:assert/strict";
import products from "../.test-tmp/products.js";

const { getProductCompleteness } = products;

test("checks base fields and product-specific required specifications", () => {
  const result = getProductCompleteness([{
    id: "p1",
    name: "Daily moisturizer",
    description: "A daily moisturizer",
    price: 24,
    category: "Skin care",
    imageUrl: "",
    specifications: '{"size":"50 ml"}',
    requiredFields: '["specifications"]',
  }]);
  assert.equal(result.required, 6);
  assert.equal(result.completed, 5);
  assert.equal(result.snapshots.find((field) => field.fieldName === "imageUrl").completed, false);
  assert.equal(result.snapshots.find((field) => field.fieldName === "specifications").completed, true);
});

test("does not score an empty product catalog as complete", () => {
  assert.deepEqual(getProductCompleteness([]), { completed: 0, required: 0, snapshots: [] });
});

test("checks required nested specification fields individually", () => {
  const result = getProductCompleteness([{
    id: "p2",
    name: "Knit top",
    description: "A rib-knit top",
    price: 45,
    category: "Tops",
    imageUrl: "https://example.test/top.jpg",
    specifications: JSON.stringify({ sizes: ["S", "M"], material: "cotton" }),
    requiredFields: JSON.stringify([
      "specifications.material",
      "specifications.care",
      "specifications.sizes",
    ]),
  }]);

  assert.equal(result.required, 8);
  assert.equal(result.completed, 7);
  assert.equal(
    result.snapshots.find((field) => field.fieldName === "specifications.sizes")?.fieldValue,
    '["S","M"]',
  );
  assert.equal(
    result.snapshots.find((field) => field.fieldName === "specifications.material")?.completed,
    true,
  );
  assert.equal(
    result.snapshots.find((field) => field.fieldName === "specifications.care")?.completed,
    false,
  );
});
