import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

test("editing adds a separate free shipment without overwriting customer prices", async () => {
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const action = source.slice(source.indexOf("export async function updateOrderItemsBatchAction"), source.indexOf("export async function addOrderItemAction"));
  const inserted = [];
  const customerPrices = [];
  let synced = false;
  const order = { id: "order", organization_id: "org", customer_id: "customer", status: "confirmed", warehouse_id: "warehouse" };
  const unit = { id: "kg", product_id: "A", base_unit_quantity: 1, unit_label: "กก." };
  const db = { from(table) {
    let columns;
    const query = {
      select(value) { columns = value; return this; },
      eq() { return this; }, in() { return this; },
      single: async () => ({ data: order }),
      insert: async (rows) => { inserted.push(...rows); return { error: null }; },
      upsert: async (rows) => { if (table === "customer_product_prices") customerPrices.push(...rows); return { error: null }; },
      update() { return this; },
      then(resolve) {
        const data = table === "products" ? [{ id: "A", cost_price: 10 }]
          : table === "product_sale_units" ? [unit]
          : table === "order_items" && columns === "line_total" ? inserted : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  } };
  const actionModule = { exports: {} };
  const context = {
    module: actionModule, exports: actionModule.exports,
    requireAnyRole: async () => ({ organizationId: "org", userId: "user" }),
    getSupabaseAdmin: () => db, getWarehouseOrderAdmin: () => db,
    isEditableOrderStatus: () => true, getEffectiveSaleUnitCost: () => 10,
    syncOrderDeliveryNoteAction: async () => { synced = true; return { success: true }; },
    after() {}, invalidateIncomingOrderCaches() {},
  };
  vm.runInNewContext(ts.transpileModule(action, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  const result = await actionModule.exports.updateOrderItemsBatchAction({
    orderId: "order", removedIds: [], updates: [],
    additions: [
      { productId: "A", productSaleUnitId: "kg", quantity: 100, unitPrice: 35 },
      { productId: "A", productSaleUnitId: "kg", quantity: 10, unitPrice: 999, isReplacement: true },
    ],
  });
  assert.equal(result.success, true);
  assert.equal(inserted.length, 2);
  assert.equal(inserted[0].line_total, 3500);
  assert.equal(inserted[1].is_replacement, true);
  assert.equal(inserted[1].unit_price, 0);
  assert.equal(inserted[1].line_total, 0);
  assert.equal(inserted.reduce((sum, row) => sum + row.quantity_in_base_unit, 0), 110);
  assert.equal(customerPrices.length, 1);
  assert.equal(customerPrices[0].sale_price, 35);
  assert.equal(synced, true);
});
