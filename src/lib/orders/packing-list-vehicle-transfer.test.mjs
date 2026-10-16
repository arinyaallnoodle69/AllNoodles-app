import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function buildStores(selectedVehicle, moved = true) {
  const source = readFileSync(new URL("../../app/orders/packing-list/page.tsx", import.meta.url), "utf8");
  const start = source.indexOf("      const groupedStores = new Map");
  const end = source.indexOf("      for (const special of specialItems.filter", start);
  assert.ok(start >= 0 && end > start);
  const customer = (id, vehicle) => ({ id, name: id, customer_code: id, default_vehicle_id: vehicle });
  const customers = [customer("moved-shop", "old"), customer("other-shop", "old"), customer("no-order-shop", "old")];
  const item = { product_id: "p", quantity: 20, quantity_in_base_unit: 20, products: { sku: "p", name: "สินค้า" }, sale_unit_label: "กก." };
  const order = (shop, assigned, notes = []) => ({ customers: shop, assigned_vehicle_id: assigned, delivery_notes: notes, order_items: [item] });
  const dependencies = {
    dateOrders: [
      ...(moved ? [order(customers[0], "new", [{ vehicle_id: "new", status: "issued", created_at: "2026-10-16", vehicles: { name: "รถใหม่" } }])] : []),
      order(customers[1], null),
    ],
    customersResult: { data: customers },
    vehicles: [{ id: "old", name: "รถเดิม" }, { id: "new", name: "รถใหม่" }],
    matchesVehicle: id => !selectedVehicle || id === selectedVehicle,
    getVehicleName: value => value?.name,
    getOrderKey: value => value.product_id,
    productUnitWeightGramsById: new Map([["p", 1000]]),
    productManagementBrandById: new Map(), packingListMetaByProductId: new Map(),
    categoryColorByProductId: new Map(), productPrintBackgroundColorById: new Map(),
    normalizePackingBrand: value => value,
  };
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${code}\nreturn [...groupedStores.values()];`)(...Object.values(dependencies));
}

for (const selected of [null, "old", "new"]) {
  test(`moved store appears only on its destination truck, filter=${selected ?? "all"}`, () => {
    const stores = buildStores(selected);
    const moved = stores.filter(store => store.customer.id === "moved-shop");
    assert.equal(moved.length, selected === "old" ? 0 : 1);
    if (moved.length) {
      assert.equal(moved[0].vehicleId, "new");
      assert.equal(moved[0].items.get("p"), 20);
      assert.equal(moved[0].totalWeightGrams, 20000);
    }
    if (selected !== "new") assert.ok(stores.some(store => store.customer.id === "no-order-shop" && !store.hasOrder));
  });
}

test("a date without a moved order keeps the shop in its default truck roster", () => {
  const stores = buildStores("old", false);
  assert.ok(stores.some(store => store.customer.id === "moved-shop" && store.vehicleId === "old" && !store.hasOrder));
});
