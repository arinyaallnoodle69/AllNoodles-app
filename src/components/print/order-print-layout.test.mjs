import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const factoryOrderSource = readFileSync(
  new URL("./factory-order-sheet-layout.tsx", import.meta.url),
  "utf8",
);
const vehicleSummarySource = readFileSync(
  new URL("./vehicle-product-summary-layout.tsx", import.meta.url),
  "utf8",
);
const packingListSource = readFileSync(
  new URL("./packing-list-layout.tsx", import.meta.url),
  "utf8",
);

test("factory and vehicle product names stay on one full line at their existing font size", () => {
  for (const source of [factoryOrderSource, vehicleSummarySource]) {
    assert.match(
      source,
      /\.vehicle-summary-table__product-name \{[\s\S]*?overflow: visible;[\s\S]*?text-overflow: clip;[\s\S]*?white-space: nowrap;/,
    );
  }
});

test("factory and vehicle headers keep metadata on a separate non-overlapping line", () => {
  for (const source of [factoryOrderSource, vehicleSummarySource]) {
    assert.match(
      source,
      /\.vehicle-summary-header__line \{[\s\S]*?flex-direction: column;[\s\S]*?align-items: stretch;/,
    );
    assert.match(
      source,
      /\.vehicle-summary-header__meta-inline \{[\s\S]*?justify-content: flex-end;/,
    );
  }
});

test("order total row uses blue instead of yellow", () => {
  assert.match(
    packingListSource,
    /\.packing-cell--total-label \{[\s\S]*?background: #dbeafe;/,
  );
  assert.match(
    packingListSource,
    /\.packing-cell--total \{\s*background: #dbeafe;/,
  );
});
