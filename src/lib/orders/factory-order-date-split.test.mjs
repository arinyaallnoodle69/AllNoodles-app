import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadSummary(provincial = false, fulfillmentMode = "fresh", barcode = false) {
  const adjustmentDates = [];
  const queryDates = [];
  const mode = { product_id: "p1", warehouse_id: "wh", mode: fulfillmentMode, supplier_id: "factory", suppliers: { name: provincial ? "A.ดอกบัว" : "โรงงานมังกร", supplier_code: provincial ? "TYV005" : "dragon" } };
  const rows = {
    products: [{ id: "p1", sku: provincial ? "ANP128" : "ANP180", name: "บะหมี่", unit: "กก.", product_kind: "fresh" }],
    vehicles: [{ id: "bkk", name: provincial ? "รถระนอง1" : "รถกรุงเทพ" }],
    warehouses: [{ id: "wh", name: provincial ? "คลังต่างจังหวัด" : "คลังกรุงเทพ" }],
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
            order_items: [{ product_id: "p1", quantity_in_base_unit: date.endsWith("09") ? 20 : 30 }, ...(barcode ? [{ product_id: "p1", quantity_in_base_unit: 6, is_barcode: true }] : [])],
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
    "@/lib/orders/daily-special-items": { getDailySpecialPrintItems: async (_org, date) => provincial && date === "2026-10-09" ? [
      { productId: "p1", vehicleId: "bkk", vehicleName: "รถระนอง1", type: "office", quantity: 50 },
      { productId: "p1", vehicleId: "bkk", vehicleName: "รถระนอง1", type: "remaining", quantity: 20 },
    ] : [] },
    "@/lib/orders/factory-adjustment-demand": { getBangkokFactoryProductMode: () => mode },
    "@/lib/orders/vehicle-summary-mode": { resolveVehicleSummaryProductMode: () => fulfillmentMode },
    "@/lib/orders/factory-order-adjustments": {
      FACTORY_ADJUSTMENT_SKUS: ["ANP180"],
      getDailyFactoryOrderAdjustments: async (_org, date) => {
        adjustmentDates.push(date);
        return !provincial && date === "2026-10-09" ? [{ productId: "p1", adjustedQuantity: 45 }] : [];
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
  return { ...loaded.exports, adjustmentDates, queryDates, rows };
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

test("provincial Lotus orders use reserve while only office entries order from factory", async () => {
  const summary = loadSummary(true);
  const sheets = await summary.getFactoryOrderSheetData("org", "2026-10-09", "2026-10-10");
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].warehouseName, "คลังต่างจังหวัด");
  assert.deepEqual(sheets[0].qty, [[50]]);
});

test("provincial Lotus stock-mode products never enter the fresh factory flow", async () => {
  const summary = loadSummary(true, "stock");
  assert.deepEqual(await summary.getFactoryOrderSheetData("org", "2026-10-09", "2026-10-10"), []);
  summary.rows.warehouses.push({ id: "bkk-wh", name: "คลังกรุงเทพ" });
  summary.rows.product_warehouse_fulfillment_modes.push({ ...summary.rows.product_warehouse_fulfillment_modes[0], warehouse_id: "bkk-wh", mode: "fresh" });
  assert.deepEqual(await summary.getFactoryOrderSheetData("org", "2026-10-09", "2026-10-10"), []);
});

test("factory and loading sheets split barcode packaging but retain total weight quantities", async () => {
  const summary = loadSummary(false, "fresh", true);
  const [sheet] = await summary.getFactoryOrderSheetData("org", "2026-10-09", "2026-10-09", { applyAdjustments: false });
  assert.deepEqual(sheet.qty, [[20], [6]]);
  assert.ok(sheet.products[1].name.endsWith("(บาร์โค้ด)"));
  assert.equal(sheet.products[1].isBarcode, true);
  assert.notEqual(sheet.products[0].id, sheet.products[1].id);
  const loading = await summary.getVehicleProductSummaryData("org", "2026-10-09", "2026-10-09");
  assert.deepEqual(loading.qty, [[20], [6]]);
  assert.ok(loading.products[1].name.endsWith("(บาร์โค้ด)"));
  assert.equal(loading.qty.flat().reduce((sum, qty) => sum + qty, 0), 26);
});

test("stock packaging stays stock and does not create a factory order", async () => {
  const summary = loadSummary(false, "stock", true);
  assert.deepEqual(await summary.getFactoryOrderSheetData("org", "2026-10-09", "2026-10-09", { applyAdjustments: false }), []);
  const loading = await summary.getVehicleProductSummaryData("org", "2026-10-09", "2026-10-09");
  assert.equal(loading.products[1].isBarcode, true);
  assert.equal(loading.products[1].isFresh, false);
  assert.deepEqual(loading.qty, [[20], [6]]);
});
