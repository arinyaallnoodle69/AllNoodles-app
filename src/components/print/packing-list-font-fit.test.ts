import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { fitPackingProductHeaderFont, getPackingPageFontScale } from "./packing-list-font-fit.ts";

test("enlarges sparse packing sheets while keeping dense sheets at the safe baseline", () => {
  assert.equal(getPackingPageFontScale(50), 1);
  assert.equal(getPackingPageFontScale(30), 1.15);
  assert.equal(getPackingPageFontScale(20), 1.22);
});

test("reduces only labels constrained by width or line count", () => {
  const shortLabel = fitPackingProductHeaderFont({
    columnWidthMm: 13,
    hasIcon: false,
    lineCount: 3,
    longestLineLength: 2,
    productCount: 20,
  });
  const longLabel = fitPackingProductHeaderFont({
    columnWidthMm: 13,
    hasIcon: false,
    lineCount: 6,
    longestLineLength: 6,
    productCount: 20,
  });

  assert.equal(shortLabel, 18.25);
  assert.ok(longLabel < shortLabel);
});

test("does not shrink short Thai lines just because their columns are narrow", () => {
  assert.equal(
    fitPackingProductHeaderFont({
      columnWidthMm: 5,
      hasIcon: false,
      lineCount: 3,
      longestLineLength: 2,
      productCount: 50,
    }),
    15,
  );
});
