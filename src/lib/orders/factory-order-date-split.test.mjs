import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadSummary() {
  const adjustmentDates = [];
  const queryDates = [];
  const mode = { product_id: "p1", warehouse_id: "wh", mode: "fresh", supplier_id: "factory", suppliers: { name: "โรงงานมังกร" } };
  const rows = {
    products: [{ id: "p1", sku: "ANP180", name: "บะหมี่", unit: "กก.", product_kind: "fresh" }],
    vehicles: [{ id: "bkk", name: "รถกรุงเทพ" }],
    warehouses: [{ id: "wh", name: "คลังกรุงเทพ" }],
    product_warehouse_fulfillment_modes: [mode],
  };
  const admin = {
    from(table) {
      let from, to;
      const query = {
        select() { return query; }, eq() { return query; }, neq() { return query; }, order() { return query; },
        gte(_column, value) { from = value; return query; },
        lte(_column, value) { to = value; return query; },
        then(resolve) {
          if (table !== "orders") return Promise.resolve({ data: rows[table] ?? [] }).then(resolve);
          queryDates.push([from, to]);
          const dates = ["2026-10-09", "2026-10-10"].filter(date => date >= from && date <= to);
          return Promise.resolve({ data: dates.map(date => ({
            id: date, warehouse_id: "wh", assigned_vehicle_id: "bkk",
            customers: { default_vehicle_id: "bkk", default_warehouse_id: "wh" },
            order_items: [{ product_id: "p1", quantity_in_base_unit: date.endsWith("09") ? 20 : 30 }],
          })) }).then(resolve);
        },
      };
      return query;
    },
  };
  const dependencies = {
    "server-only": {},
    "next/cache": { cacheLife() {}, cacheTag() {} },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => admin },
    "@/lib/products/sort-by-category": { sortProductsByCategory: products => products },
    "@/lib/orders/daily-special-items": { getDailySpecialPrintItems: async () => [] },
    "@/lib/orders/factory-adjustment-demand": { getBangkokFactoryProductMode: () => mode },
    "@/lib/orders/vehicle-summary-mode": {},
    "@/lib/orders/factory-order-adjustments": {
      FACTORY_ADJUSTMENT_SKUS: ["ANP180"],
      getDailyFactoryOrderAdjustments: async (_org, date) => {
        adjustmentDates.push(date);
        return date === "2026-10-09" ? [{ productId: "p1", adjustedQuantity: 45 }] : [];
      },
    },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./vehicle-product-summary.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, loaded, loaded.exports);
  return { ...loaded.exports, adjustmentDates, queryDates };
}

test("factory date range produces separate daily sheets and keeps each day's confirmed quantity", async () => {
  const summary = loadSummary();
  const sheets = await summary.getFactoryOrderSheetData("org", "2026-10-09", "2026-10-11");
  assert.deepEqual(sheets.map(sheet => sheet.qty), [[[45]], [[30]]]);
  assert.notEqual(sheets[0].dateLabel, sheets[1].dateLabel);
  assert.deepEqual(summary.queryDates, [
    ["2026-10-09", "2026-10-09"], ["2026-10-10", "2026-10-10"], ["2026-10-11", "2026-10-11"],
  ]);
  assert.deepEqual(summary.adjustmentDates, ["2026-10-09", "2026-10-10", "2026-10-11"]);
});

test("factory date split preserves the unadjusted demand option", async () => {
  const summary = loadSummary();
  const sheets = await summary.getFactoryOrderSheetData("org", "2026-10-09", "2026-10-10", { applyAdjustments: false });
  assert.deepEqual(sheets.map(sheet => sheet.qty), [[[20]], [[30]]]);
  assert.deepEqual(summary.adjustmentDates, []);
});
