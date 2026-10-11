import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", js)((name) => dependencies[name] ?? require(name), loaded, loaded.exports);
  return loaded.exports;
}
const split = load("../../components/print/packing-list-bkk-split.ts");
const { getCustomerPackingGroup, getPackingCustomerSortOrder } = load("./packing-list-customer-order.ts", {
  "@/components/print/packing-list-bkk-split": split,
});
test("settings and packing sheet use the same Bangkok membership, including overrides", () => {
  assert.equal(getCustomerPackingGroup("ANS002", null), "bkk_noodle");
  assert.equal(getCustomerPackingGroup("ANS015", null), "default");
  assert.equal(getCustomerPackingGroup("ANS002", { packing_list_group: "default" }), "default");
  assert.equal(getCustomerPackingGroup("ANS015", { packing_list_group: "bkk_noodle" }), "bkk_noodle");
});
test("custom order is restricted to Bangkok packing sheets; unset values retain the old order", () => {
  assert.equal(getPackingCustomerSortOrder(8, 0, "bkk", "รถกรุงเทพ"), 0);
  assert.equal(getPackingCustomerSortOrder(8, null, "bkk", "รถกรุงเทพ"), 8);
  assert.equal(getPackingCustomerSortOrder(8, 0, "province", "รถสุราษฎร์"), 8);
  assert.equal(getPackingCustomerSortOrder(null, null, null, null), Infinity);
});
test("independent group ranks do not change shared sorting or vehicle assignment", () => {
  const customers = [
    { id: "ANS015", order: 10, packing: 1 }, { id: "ANS002", order: 11, packing: 0 },
    { id: "ANS001", order: 12, packing: 0 }, { id: "ANS004", order: 13, packing: 1 },
  ];
  const groups = split.buildVehicleGroups({
    stores: [...customers].sort((a, b) => a.packing - b.packing).map((c) => ({ id: c.id, vehicleId: "bkk", vehicleName: "รถกรุงเทพ" })),
    vehicles: [{ id: "bkk", name: "รถกรุงเทพ" }],
  });
  const sorted = [...customers].sort((a, b) => a.packing - b.packing);
  assert.deepEqual(groups[0].storeIndices.map((i) => sorted[i].id), ["ANS001", "ANS015"]);
  assert.deepEqual(groups[1].storeIndices.map((i) => sorted[i].id), ["ANS002", "ANS004"]);
  assert.deepEqual([...customers].sort((a, b) => a.order - b.order).map((c) => c.id), ["ANS015", "ANS002", "ANS001", "ANS004"]);
});
