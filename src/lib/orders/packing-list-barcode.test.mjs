import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

for (const reserve of [false, true]) test(`packing order separates ${reserve ? "reserve" : "barcode"} rows and counts quantities and weights once`, () => {
  const source = readFileSync(new URL("../../app/orders/packing-list/page.tsx", import.meta.url), "utf8");
  const start = source.indexOf("        for (const item of order.order_items ?? []) {");
  const end = source.indexOf("      for (const [storeGroupKey, store]", start);
  const code = source.slice(start, end).trim().replace(/\}\s*$/, "");
  const customer = { id: "shop", name: "ซุปเปอร์ชิพ", customer_code: "ANS109" };
  const groupedStore = { customer, vehicleId: "truck", vehicleName: "รถกรุงเทพ", items: new Map(), missingWeightProductIds: new Set(), specialSort: 0, totalWeightGrams: 0, hasOrder: true };
  const groupedStores = new Map([["shop_truck", groupedStore]]);
  const item = (product_id, quantity, separate = false) => ({ product_id, quantity, quantity_in_base_unit: quantity, is_barcode: !reserve && separate, supply_source: reserve && separate ? "reserve" : "factory", products: { sku: product_id, name: product_id }, sale_unit_label: "กก.", notes: null });
  const dependencies = {
    order: { order_items: [item("ANP137", 10), item("ANP137", 6, true), item("ANP138", 4, true), item("ANP139", 8, true)] },
    customer, groupedStore, groupedStores, storeGroupKey: "shop_truck", vehicleId: "truck", resolvedVehicleName: "รถกรุงเทพ",
    getOrderKey: item => item.product_id, productUnitWeightGramsById: new Map(["ANP137", "ANP138", "ANP139"].map(id => [id, 1000])),
    productMap: new Map(), productManagementBrandById: new Map(), packingListMetaByProductId: new Map(), categoryColorByProductId: new Map(), productPrintBackgroundColorById: new Map(), normalizePackingBrand: value => value,
  };
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function(...Object.keys(dependencies), compiled)(...Object.values(dependencies));
  assert.equal(groupedStores.size, 2);
  assert.deepEqual([...groupedStore.items], [["ANP137", 10]]);
  const barcode = groupedStores.get(reserve ? "shop_truck_reserve" : "shop_truck_barcode");
  assert.equal(barcode.customer.name, reserve ? "ซุปเปอร์ชิพ (ใช้สำรอง)" : "ซุปเปอร์ชิพ (บาร์โค้ด)");
  assert.deepEqual([...barcode.items], [["ANP137", 6], ["ANP138", 4], ["ANP139", 8]]);
  assert.equal(groupedStore.totalWeightGrams + barcode.totalWeightGrams, 28000);
  assert.equal(dependencies.productMap.size, 3);
});
