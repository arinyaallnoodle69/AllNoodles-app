import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node --experimental-strip-types resolves this local TypeScript test target.
const draftModule = await import("./product-color-drafts.ts");
const { collectChangedProductColors, rollbackProductColors } = draftModule;

test("collects every changed product color without depending on selected rows", () => {
  assert.deepEqual(
    collectChangedProductColors(
      { productA: "#EA80FC", productB: null, productC: "#FFFFFF" },
      { productA: "#FFFFFF", productB: "#F2E6BD", productC: "#FFFFFF" },
    ),
    [
      { productId: "productA", color: "#EA80FC" },
      { productId: "productB", color: null },
    ],
  );
});

test("rolls failed product colors back to their last saved values", () => {
  assert.deepEqual(
    rollbackProductColors(
      { productA: "#EA80FC", productB: "#F2E6BD", productC: "#FFFFFF" },
      { productA: "#FFFFFF", productB: null, productC: "#FFFFFF" },
      ["productA", "productB"],
    ),
    { productA: "#FFFFFF", productB: null, productC: "#FFFFFF" },
  );
});
