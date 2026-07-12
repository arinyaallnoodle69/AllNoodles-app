import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node --experimental-strip-types resolves this local TypeScript test target.
const colorModule = await import("./category-print-colors.ts");
const {
  buildCategoryPrintPalette,
  isValidPrintColor,
  normalizePrintColor,
} = colorModule;

test("normalizes valid hex colors and rejects malformed values", () => {
  assert.equal(normalizePrintColor(" #f2e6bd "), "#F2E6BD");
  assert.equal(normalizePrintColor("purple"), null);
  assert.equal(isValidPrintColor("#EA80FC"), true);
  assert.equal(isValidPrintColor("#FFF"), false);
});

test("builds deterministic print-safe lighter row colors", () => {
  assert.deepEqual(buildCategoryPrintPalette("#F2E6BD"), {
    header: "#F2E6BD",
    rowA: "#FCFAF2",
    rowB: "#FEFDF9",
  });
});

test("uses the provided fallback when no custom color exists", () => {
  const fallback = { header: "#EA80FC", rowA: "#F3E5F5", rowB: "#FAF5FC" };
  assert.deepEqual(buildCategoryPrintPalette(null, fallback), fallback);
});
