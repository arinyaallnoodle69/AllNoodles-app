import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./merge-order-items.ts", import.meta.url), "utf8").replace('import "server-only";', "");
const sandboxModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: sandboxModule.exports, module: sandboxModule });
const { aggregateMergeableOrderItems } = sandboxModule.exports;

test("replacement quantities never merge into paid lines or change their price", () => {
  const base = { costPrice: 5, productId: "A", productSaleUnitId: "kg", quantity: 100, quantityInBaseUnit: 100, saleUnitLabel: "กก.", saleUnitRatio: 1, unitPrice: 35 };
  const rows = aggregateMergeableOrderItems([base, { ...base, isReplacement: true, quantity: 10, quantityInBaseUnit: 10, unitPrice: 999 }, { ...base, isReplacement: true, quantity: 5, quantityInBaseUnit: 5, unitPrice: 35 }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].quantity, 100);
  assert.equal(rows[0].unitPrice, 35);
  assert.equal(rows[1].quantity, 15);
  assert.equal(rows[1].unitPrice, 0);
  assert.equal(rows[1].isReplacement, true);
  assert.equal(rows.reduce((sum, row) => sum + row.quantityInBaseUnit, 0), 115);
});

test("saving into an existing order preserves paid and replacement rows independently", async () => {
  const stored = [
    { id: "sale", product_id: "A", product_sale_unit_id: "kg", quantity: 100, quantity_in_base_unit: 100, unit_price: 35, line_total: 3500, sale_unit_ratio: 1 },
    { id: "replacement", is_replacement: true, product_id: "A", product_sale_unit_id: "kg", quantity: 10, quantity_in_base_unit: 10, unit_price: 0, line_total: 0, sale_unit_ratio: 1 },
  ];
  const writes = [];
  const admin = { from() { return {
    select() { return { eq() { return { order: async () => ({ data: stored, error: null }) }; } }; },
    update(payload) { return { eq: async (_, id) => { writes.push({ id, ...payload }); return { error: null }; } }; },
    delete() { assert.fail("must not remove either kind of line"); },
    insert() { assert.fail("must reuse the matching existing line"); },
  }; } };
  const base = { costPrice: 5, productId: "A", productSaleUnitId: "kg", quantity: 5, quantityInBaseUnit: 5, saleUnitLabel: "กก.", saleUnitRatio: 1, unitPrice: 35 };
  const result = await sandboxModule.exports.mergeItemsIntoOrder(admin, { items: [base, { ...base, isReplacement: true }], orderId: "order", organizationId: "org" });
  assert.equal(result.success, true);
  assert.equal(writes.length, 2);
  assert.equal(writes.find((row) => row.id === "sale").quantity, 105);
  assert.equal(writes.find((row) => row.id === "sale").unit_price, 35);
  assert.equal(writes.find((row) => row.id === "replacement").quantity, 15);
  assert.equal(writes.find((row) => row.id === "replacement").unit_price, 0);
});
