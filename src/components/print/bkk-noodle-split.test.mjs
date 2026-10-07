import assert from "node:assert/strict";
import test from "node:test";
import { buildVehicleGroups, isBangkokVehicleGroup } from "./packing-list-bkk-split.ts";

test("isBangkokVehicleGroup detects Bangkok vehicle by ID or name", () => {
  assert.equal(isBangkokVehicleGroup("67c8b5f9-6cdf-4c83-a464-40827f561939", "รถกรุงเทพ"), true);
  assert.equal(isBangkokVehicleGroup("other-id", "รถกรุงเทพ"), true);
  assert.equal(isBangkokVehicleGroup("other-id", "รถสุราษฎร์1"), false);
});

test("buildVehicleGroups splits Bangkok vehicle into รถกรุงเทพ and รถกรุงเทพบะหมี่ maintaining sort order", () => {
  const vehicles = [
    { id: "v-bkk", name: "รถกรุงเทพ" },
    { id: "v-surat", name: "รถสุราษฎร์1" },
  ];
  const noodle = "bkk_noodle";

  // Stores already sorted by customer sort_order:
  const stores = [
    { id: "ANS015", vehicleId: "v-bkk", vehicleName: "รถกรุงเทพ" }, // other store (index 0)
    { id: "ANS002", vehicleId: "v-bkk", vehicleName: "รถกรุงเทพ", packingListGroup: noodle }, // index 1
    { id: "ANS001", vehicleId: "v-bkk", vehicleName: "รถกรุงเทพ" }, // other store (index 2)
    { id: "ANS004", vehicleId: "v-bkk", vehicleName: "รถกรุงเทพ", packingListGroup: noodle }, // index 3
    { id: "ANS003-R", vehicleId: "v-bkk", vehicleName: "รถกรุงเทพ", packingListGroup: noodle }, // replacement (index 4)
    { id: "SUR001", vehicleId: "v-surat", vehicleName: "รถสุราษฎร์1" }, // surat store (index 5)
  ];

  const groups = buildVehicleGroups({ stores, vehicles });

  assert.equal(groups.length, 3);

  // Group 1: รถกรุงเทพ (ใบแรก)
  assert.equal(groups[0].vehicleName, "รถกรุงเทพ");
  assert.equal(groups[0].vehicleId, "v-bkk");
  assert.equal(groups[0].isBkkMain, true);
  assert.deepEqual(groups[0].storeIndices, [0, 2]); // Preserves relative order of other stores
  assert.deepEqual(groups[0].combinedStoreIndices, [0, 1, 2, 3, 4]); // Contains all BKK stores

  // Group 2: รถกรุงเทพบะหมี่ (ใบที่ 2)
  assert.equal(groups[1].vehicleName, "รถกรุงเทพบะหมี่");
  assert.equal(groups[1].vehicleId, "v-bkk__noodles");
  assert.equal(groups[1].isBkkNoodles, true);
  assert.deepEqual(groups[1].storeIndices, [1, 3, 4]); // Preserves relative order of noodle stores

  // Group 3: รถสุราษฎร์1 (รถคันอื่นไม่ถูกแยก)
  assert.equal(groups[2].vehicleName, "รถสุราษฎร์1");
  assert.equal(groups[2].vehicleId, "v-surat");
  assert.deepEqual(groups[2].storeIndices, [5]);
});
