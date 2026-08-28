import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile special-item modal is full viewport and keeps checkbox separate from product image", async () => {
  const source = await readFile(new URL("./daily-special-order-manager.tsx", import.meta.url), "utf8");

  assert.match(source, /h-\[100dvh\]\s+w-\[100dvw\]/);
  assert.match(source, /grid-cols-\[24px_52px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(source, /absolute left-0\.5 top-0\.5/);
});

test("mobile special-item cart groups products under vehicle and type without truncating names", async () => {
  const source = await readFile(new URL("./daily-special-order-manager.tsx", import.meta.url), "utf8");

  assert.match(source, /mobile-special-cart-group/);
  assert.match(source, /mobile-special-product-name/);
  assert.doesNotMatch(source, /mobile-special-product-name[^\n]*truncate/);
});

test("mobile special-item controls preserve vertical space for the product list", async () => {
  const source = await readFile(new URL("./daily-special-order-manager.tsx", import.meta.url), "utf8");

  assert.match(source, /mobile-special-filter-row/);
  assert.match(source, /mobile-special-action-row/);
  assert.match(source, /grid-cols-\[minmax\(0,0\.9fr\)_minmax\(0,1\.1fr\)\]/);
  assert.match(source, /ดูตะกร้า/);
});
