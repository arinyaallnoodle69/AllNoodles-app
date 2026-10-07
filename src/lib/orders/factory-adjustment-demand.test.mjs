import assert from "node:assert/strict";
import test from "node:test";
import { getBangkokFactoryAdjustmentDemand } from "./factory-adjustment-demand.ts";

test("adjustment demand sums Bangkok sheets and excludes other or unknown warehouses", () => {
  const demand = getBangkokFactoryAdjustmentDemand([
    { warehouseName: "คลังกรุงเทพ", products: [{ id: "ANP180" }, { id: "ANP181" }], qty: [[10, 5], [2]] },
    { warehouseName: "คลังกรุงเทพ", products: [{ id: "ANP180" }], qty: [[7]] },
    { warehouseName: "คลังต่างจังหวัด", products: [{ id: "ANP180" }, { id: "ANP182" }], qty: [[100], [50]] },
    { products: [{ id: "ANP180" }], qty: [[200]] },
  ]);
  assert.equal(demand.get("ANP180"), 22);
  assert.equal(demand.get("ANP181"), 2);
  assert.equal(demand.has("ANP182"), false);
  assert.equal(getBangkokFactoryAdjustmentDemand([]).size, 0);
});
