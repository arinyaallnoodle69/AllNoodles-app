import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isProvincialLotusReserve } from "./provincial-lotus-reserve.ts";

function loadSummary(provincial = false, fulfillmentMode = "fresh", barcode = false, reserve = false, remaining = [], demandQuantity) {
  const adjustmentDates = [];
  const queryDates = [];
  const mode = { product_id: "p1", warehouse_id: "wh", mode: fulfillmentMode, supplier_id: "factory", warehouses: { name: provincial ? "คลังต่างจังหวัด" : "คลังกรุงเทพ" }, suppliers: { name: provincial ? "A.ดอกบัว" : "โรงงานมังกร", supplier_code: provincial ? "TYV005" : "dragon" } };
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
          const dates = (provincial
            ? ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]
            : ["2026-10-09", "2026-10-10"]).filter(date => date >= from && date <= to);
          return Promise.resolve({ data: dates.map(date => ({
            id: date, order_date: date, warehouse_id: "wh", assigned_vehicle_id: "bkk",
            customers: { default_vehicle_id: "bkk", default_warehouse_id: "wh" },
            order_items: [{ product_id: "p1", quantity_in_base_unit: demandQuantity ?? (date.endsWith("09") ? 20 : 30), supply_source: "legacy" }, ...(barcode ? [{ product_id: "p1", quantity_in_base_unit: 6, is_barcode: true }] : []), ...(reserve ? [{ product_id: "p1", quantity_in_base_unit: 8, supply_source: "reserve" }] : [])],
          })) }).then(resolve);
        },
      };
      return query;
    },
  };
  const dependencies = {
    "server-only": {},
    "./provincial-lotus-reserve": { isProvincialLotusReserve },
    "next/cache": { cacheLife() {}, cacheTag() {} },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => admin },
    "@/lib/products/sort-by-category": { sortProductsByCategory: products => products },
    "@/lib/orders/daily-special-items": { getDailySpecialPrintItems: async () => provincial ? [
      { productId: "p1", vehicleId: "bkk", vehicleName: "รถระนอง1", type: "office", quantity: 50 },
      { productId: "p1", vehicleId: "bkk", vehicleName: "รถระนอง1", type: "remaining", quantity: 20 },
    ] : remaining },
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

test("provincial Lotus factory sheets order only Monday and Thursday, including orders plus office", async () => {
  const summary = loadSummary(true);
  const sheets = await summary.getFactoryOrderSheetData("org", "2026-10-12", "2026-10-18");
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].warehouseName, "คลังต่างจังหวัด");
  assert.deepEqual(sheets.map(sheet => sheet.qty), [[[80]], [[80]]]);
  for (let day = 12; day <= 18; day++) {
    const date = `2026-10-${day}`;
    const daily = await summary.getFactoryOrderSheetData("org", date, date, { applyAdjustments: false });
    assert.equal(daily.length, day === 12 || day === 15 ? 1 : 0, date);
  }
});

test("provincial Lotus stock-mode products never enter the fresh factory flow", async () => {
  const summary = loadSummary(true, "stock");
  assert.deepEqual(await summary.getFactoryOrderSheetData("org", "2026-10-12", "2026-10-18"), []);
  summary.rows.warehouses.push({ id: "bkk-wh", name: "คลังกรุงเทพ" });
  summary.rows.product_warehouse_fulfillment_modes.push({ ...summary.rows.product_warehouse_fulfillment_modes[0], warehouse_id: "bkk-wh", mode: "fresh" });
  assert.deepEqual(await summary.getFactoryOrderSheetData("org", "2026-10-12", "2026-10-18"), []);
});

test("Lotus non-order days keep loading quantities and other factories keep their daily sheets", async () => {
  const summary = loadSummary(true);
  const loading = await summary.getVehicleProductSummaryData("org", "2026-10-13", "2026-10-13");
  assert.deepEqual(loading.qty, [[30]]);
  summary.rows.product_warehouse_fulfillment_modes[0].suppliers.supplier_code = "other";
  assert.equal((await summary.getFactoryOrderSheetData("org", "2026-10-13", "2026-10-13")).length, 1);
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

test("reserve is excluded from factory demand but included once in the loading quantities", async () => {
  for (const provincial of [false, true]) {
    const summary = loadSummary(provincial, "fresh", false, true);
    const date = provincial ? "2026-10-12" : "2026-10-09";
    const [sheet] = await summary.getFactoryOrderSheetData("org", date, date, { applyAdjustments: false });
    assert.deepEqual(sheet.qty, [[provincial ? 80 : 20]]);
    const loading = await summary.getVehicleProductSummaryData("org", date, date);
    assert.equal(loading.qty.flat().reduce((sum, qty) => sum + qty, 0), provincial ? 38 : 28);
    const reserveIndex = loading.products.findIndex(product => product.isReserve);
    assert.ok(reserveIndex >= 0);
    assert.deepEqual(loading.qty[reserveIndex], [8]);
  }
});


test("Lotus loading sheets put old automatic reserve on stock sheets except factory weekdays", async () => {
 const summary = loadSummary(true);
 for (let day = 12; day <= 18; day++) {
  const date = `2026-10-${day}`;
  const result = await summary.getVehicleProductSummaryData("org",date,date);
  const ordered = result.products.map((product,index)=>({product,quantity:result.qty[index][0]})).filter(row=>row.quantity===30);
  assert.equal(ordered.length,1,date);
  assert.equal(ordered[0].product.isFresh,day===12||day===15,date);
  assert.equal(ordered[0].product.isReserve,day!==12&&day!==15,date);
 }
});

const leftover = (quantity, date = "2026-10-09", vehicleId = "bkk") => ({ productId: "p1", vehicleId, vehicleName: "รถกรุงเทพ", type: "remaining", quantity, date });

test("Bangkok 100kg demand with 50kg remaining loads factory 50 plus office 50, factory sheet stays 50", async () => {
  const summary = loadSummary(false, "fresh", false, false, [leftover(50)], 100);
  const loading = await summary.getVehicleProductSummaryData("org", "2026-10-09", "2026-10-09");
  assert.deepEqual(loading.qty, [[50], [50]]);
  assert.deepEqual(loading.products.map(p => p.name), ["บะหมี่", "บะหมี่ (เอาจากออฟฟิศ)"]);
  assert.ok(loading.products.every(p => p.isFresh));
  assert.equal(loading.products[1].isOffice, true);
  const compiled = ts.transpileModule(readFileSync(new URL("../../components/print/vehicle-product-summary-layout.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const layout = { exports: {} };
  new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), layout, layout.exports);
  const html = renderToStaticMarkup(React.createElement(layout.exports.VehicleProductSummaryLayout, { data: loading }));
  assert.match(html, /บะหมี่ \(เอาจากออฟฟิศ\)/);
  assert.equal((html.match(/vehicle-summary-table__qty-cell"/g) ?? []).length, 2);
  const [factory] = await summary.getFactoryOrderSheetData("org", "2026-10-09", "2026-10-09", { applyAdjustments: false });
  assert.deepEqual(factory.qty, [[50]]);
});

test("remaining is capped per day and vehicle, never creates additional loading quantity", async () => {
  for (const amount of [0, 100, 150]) {
    const summary = loadSummary(false, "fresh", false, false, [leftover(amount)], 100);
    const loading = await summary.getVehicleProductSummaryData("org", "2026-10-09", "2026-10-09");
    assert.equal(loading.qty.flat().reduce((sum, n) => sum + n, 0), 100);
    assert.deepEqual(loading.qty, [[100]]);
    assert.equal(Boolean(loading.products[0].isOffice), amount > 0);
  }
  const summary = loadSummary(false, "fresh", false, false, [leftover(30), leftover(100, "2026-10-10", "another-car")]);
  const loading = await summary.getVehicleProductSummaryData("org", "2026-10-09", "2026-10-10");
  assert.deepEqual(loading.qty, [[30], [20]]);
});

test("office split leaves barcode, explicit reserve, stock-mode and provincial rules intact", async () => {
  const summary = loadSummary(false, "fresh", true, true, [leftover(50)], 100);
  const loading = await summary.getVehicleProductSummaryData("org", "2026-10-09", "2026-10-09");
  const quantityFor = test => loading.qty[loading.products.findIndex(test)][0];
  assert.equal(quantityFor(p => p.isOffice), 50);
  assert.equal(quantityFor(p => p.isBarcode), 6);
  assert.equal(quantityFor(p => p.isReserve), 8);
  assert.equal(loading.qty.flat().reduce((sum, n) => sum + n, 0), 114);
  const stock = await loadSummary(false, "stock", false, false, [leftover(50)], 100).getVehicleProductSummaryData("org", "2026-10-09", "2026-10-09");
  assert.deepEqual(stock.qty, [[100]]);
  assert.ok(stock.products.every(p => !p.isOffice));
  const province = await loadSummary(true).getVehicleProductSummaryData("org", "2026-10-12", "2026-10-12");
  assert.ok(province.products.every(p => !p.isOffice));
});
