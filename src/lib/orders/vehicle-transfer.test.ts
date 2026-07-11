import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { buildVehicleTransferDates, isVehicleTransferInput } from "./vehicle-transfer.ts";

const vehicles = [
  { id: "vehicle-1", name: "รถ 1" },
  { id: "vehicle-2", name: "รถ 2" },
  { id: "vehicle-3", name: "รถ 3" },
];

test("hides dates that have orders assigned to only one vehicle", () => {
  const result = buildVehicleTransferDates(
    [
      { orderDate: "2026-07-10", status: "submitted", vehicleId: "vehicle-1" },
      { orderDate: "2026-07-10", status: "confirmed", vehicleId: "vehicle-1" },
    ],
    vehicles,
    "2026-07-10",
    "2026-07-10",
  );

  assert.deepEqual(result, []);
});

test("groups eligible dates and counts active orders for each represented vehicle", () => {
  const result = buildVehicleTransferDates(
    [
      { orderDate: "2026-07-10", status: "submitted", vehicleId: "vehicle-1" },
      { orderDate: "2026-07-10", status: "confirmed", vehicleId: "vehicle-1" },
      { orderDate: "2026-07-10", status: "submitted", vehicleId: "vehicle-2" },
      { orderDate: "2026-07-10", status: "cancelled", vehicleId: "vehicle-2" },
      { orderDate: "2026-07-10", status: "submitted", vehicleId: null },
    ],
    vehicles,
    "2026-07-10",
    "2026-07-10",
  );

  assert.deepEqual(result, [
    {
      date: "2026-07-10",
      vehicles: [
        { id: "vehicle-1", name: "รถ 1", orderCount: 2 },
        { id: "vehicle-2", name: "รถ 2", orderCount: 1 },
      ],
    },
  ]);
});

test("keeps only eligible dates inside the requested range", () => {
  const result = buildVehicleTransferDates(
    [
      { orderDate: "2026-07-09", status: "submitted", vehicleId: "vehicle-1" },
      { orderDate: "2026-07-10", status: "submitted", vehicleId: "vehicle-1" },
      { orderDate: "2026-07-10", status: "submitted", vehicleId: "vehicle-2" },
      { orderDate: "2026-07-11", status: "submitted", vehicleId: "vehicle-1" },
      { orderDate: "2026-07-11", status: "submitted", vehicleId: "vehicle-3" },
      { orderDate: "2026-07-12", status: "submitted", vehicleId: "vehicle-1" },
      { orderDate: "2026-07-12", status: "submitted", vehicleId: "vehicle-2" },
    ],
    vehicles,
    "2026-07-10",
    "2026-07-11",
  );

  assert.deepEqual(result.map((option) => option.date), ["2026-07-10", "2026-07-11"]);
});

test("validates a complete transfer and rejects same-vehicle moves", () => {
  assert.equal(
    isVehicleTransferInput({
      date: "2026-07-10",
      fromVehicleId: "vehicle-1",
      toVehicleId: "vehicle-2",
    }),
    true,
  );
  assert.equal(
    isVehicleTransferInput({
      date: "2026-07-10",
      fromVehicleId: "vehicle-1",
      toVehicleId: "vehicle-1",
    }),
    false,
  );
  assert.equal(
    isVehicleTransferInput({
      date: "10/07/2026",
      fromVehicleId: "vehicle-1",
      toVehicleId: "vehicle-2",
    }),
    false,
  );
});
