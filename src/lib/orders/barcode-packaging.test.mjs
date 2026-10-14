import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(() => ({}), loaded, loaded.exports);
  return loaded.exports;
}
test("normal and barcode quantities merge independently and money is counted once", () => {
  const { aggregateMergeableOrderItems } = load("./merge-order-items.ts");
  const item = { productId: "p", productSaleUnitId: "u", quantity: 10, quantityInBaseUnit: 10, saleUnitRatio: 1, saleUnitLabel: "กก.", unitPrice: 100, costPrice: 50 };
  const result = aggregateMergeableOrderItems([item, { ...item, isBarcode: true, quantity: 6, quantityInBaseUnit: 6 }, { ...item, isBarcode: true, quantity: 2, quantityInBaseUnit: 2 }]);
  assert.equal(result.length, 2);
  assert.equal(result.find(row => row.isBarcode).quantity, 8);
  assert.equal(result.find(row => !row.isBarcode).quantity, 10);
  assert.equal(result.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0), 1800);
});
