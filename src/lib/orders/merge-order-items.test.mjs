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

test("all merge rows are submitted in one atomic call and failures propagate", async () => {
  const base = { costPrice: 5, productId: "A", productSaleUnitId: "kg", quantity: 2, quantityInBaseUnit: 2, saleUnitLabel: "กก.", saleUnitRatio: 1, unitPrice: 35 };
  let call;
  const admin = { rpc: async (name, args) => { call = { name, args }; return { error: null }; } };
  const result = await sandboxModule.exports.mergeItemsIntoOrder(admin, {
    items: [base, { ...base, isReplacement: true, unitPrice: 999 }], orderId: "order", organizationId: "org", userId: "user", syncDelivery: true,
  });
  assert.equal(result.success, true);
  assert.equal(call.name, "merge_order_items_atomic");
  assert.equal(call.args.p_sync_delivery, true);
  assert.equal(call.args.p_items[0].isReplacement, false);
  assert.equal(call.args.p_items[1].isReplacement, true);
  assert.equal(call.args.p_items[1].unitPrice, 0);
  const failure = await sandboxModule.exports.mergeItemsIntoOrder({ rpc: async () => ({ error: { message: "rolled back" } }) }, {
    items: [base], orderId: "order", organizationId: "org",
  });
  assert.equal(failure.error, "rolled back");
});
