import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("packing product headers enlarge text without allowing it outside the cell", () => {
  const source = readFileSync(new URL("./packing-list-layout.tsx", import.meta.url), "utf8");

  assert.match(source, /Math\.floor\(\(colMm - 1\) \/ 2\.4\)/);
  assert.match(source, /calcDataColWidth\(Math\.max\(page\.pageProducts\.length, 1\), 267, 5\)/);
  assert.match(source, /\.packing-col--store \{[\s\S]*?width: 18mm;[\s\S]*?min-width: 18mm;/);
  assert.match(source, /@media print \{[\s\S]*?\.packing-sheet \{[\s\S]*?transform: scale\(0\.98\) !important;/);
  assert.match(source, /\.packing-product-header \{[\s\S]*?overflow: hidden;/);
  assert.match(source, /\.packing-product-header__name \{[\s\S]*?font-size: 15pt;[\s\S]*?line-height: 1\.25;/);
  assert.match(source, /\.packing-product-header__name > span \{[\s\S]*?overflow: visible;/);
  assert.doesNotMatch(source, /getThaiVisualLength\(prev\) === 1/);
});
