import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { buildVehicleTransferDates, isVehicleTransferInput } from "./vehicle-transfer.ts";

const vehicles = [
  { id: "vehicle-1", name: "รถ 1" },
  { id: "vehicle-2", name: "รถ 2" },
  { id: "vehicle-3", name: "รถ 3" },
];

test("shows one represented source vehicle when another destination vehicle exists", () => {
  const result = buildVehicleTransferDates(
    [
      { customerCode: "ANS001", customerId: "customer-1", customerName: "ร้านหนึ่ง", orderDate: "2026-07-10", status: "submitted", vehicleId: "vehicle-1" },
      { customerCode: "ANS001", customerId: "customer-1", customerName: "ร้านหนึ่ง", orderDate: "2026-07-10", status: "confirmed", vehicleId: "vehicle-1" },
    ],
    vehicles,
    "2026-07-10",
    "2026-07-10",
  );

  assert.deepEqual(result, [{
    date: "2026-07-10",
    sourceVehicles: [{
      id: "vehicle-1",
      name: "รถ 1",
      orderCount: 2,
      stores: [{
        customerCode: "ANS001",
        customerId: "customer-1",
        customerName: "ร้านหนึ่ง",
        orderCount: 2,
      }],
    }],
    vehicles,
  }]);
});

test("groups stores under each source vehicle and excludes cancelled or unassigned orders", () => {
  const result = buildVehicleTransferDates(
    [
      { customerCode: "ANS001", customerId: "customer-1", customerName: "ร้านหนึ่ง", orderDate: "2026-07-10", status: "submitted", vehicleId: "vehicle-1" },
      { customerCode: "ANS001", customerId: "customer-1", customerName: "ร้านหนึ่ง", orderDate: "2026-07-10", status: "confirmed", vehicleId: "vehicle-1" },
      { customerCode: "ANS002", customerId: "customer-2", customerName: "ร้านสอง", orderDate: "2026-07-10", status: "submitted", vehicleId: "vehicle-2" },
      { customerCode: "ANS003", customerId: "customer-3", customerName: "ร้านยกเลิก", orderDate: "2026-07-10", status: "cancelled", vehicleId: "vehicle-2" },
      { customerCode: "ANS004", customerId: "customer-4", customerName: "ร้านไม่มีรถ", orderDate: "2026-07-10", status: "submitted", vehicleId: null },
    ],
    vehicles,
    "2026-07-10",
    "2026-07-10",
  );

  assert.deepEqual(result, [{
    date: "2026-07-10",
    sourceVehicles: [
      {
        id: "vehicle-1",
        name: "รถ 1",
        orderCount: 2,
        stores: [{ customerCode: "ANS001", customerId: "customer-1", customerName: "ร้านหนึ่ง", orderCount: 2 }],
      },
      {
        id: "vehicle-2",
        name: "รถ 2",
        orderCount: 1,
        stores: [{ customerCode: "ANS002", customerId: "customer-2", customerName: "ร้านสอง", orderCount: 1 }],
      },
    ],
    vehicles,
  }]);
});

test("keeps only dates inside the requested range", () => {
  const result = buildVehicleTransferDates(
    [
      { customerCode: "1", customerId: "c1", customerName: "1", orderDate: "2026-07-09", status: "submitted", vehicleId: "vehicle-1" },
      { customerCode: "1", customerId: "c1", customerName: "1", orderDate: "2026-07-10", status: "submitted", vehicleId: "vehicle-1" },
      { customerCode: "2", customerId: "c2", customerName: "2", orderDate: "2026-07-11", status: "submitted", vehicleId: "vehicle-3" },
      { customerCode: "1", customerId: "c1", customerName: "1", orderDate: "2026-07-12", status: "submitted", vehicleId: "vehicle-1" },
    ],
    vehicles,
    "2026-07-10",
    "2026-07-11",
  );

  assert.deepEqual(result.map((option) => option.date), ["2026-07-10", "2026-07-11"]);
});

test("requires selected stores and rejects same-vehicle moves", () => {
  assert.equal(
    isVehicleTransferInput({
      date: "2026-07-10",
      fromVehicleId: "vehicle-1",
      toVehicleId: "vehicle-2",
      customerIds: ["customer-1"],
    }),
    true,
  );
  assert.equal(
    isVehicleTransferInput({
      date: "2026-07-10",
      fromVehicleId: "vehicle-1",
      toVehicleId: "vehicle-1",
      customerIds: ["customer-1"],
    }),
    false,
  );
  assert.equal(
    isVehicleTransferInput({
      date: "2026-07-10",
      fromVehicleId: "vehicle-1",
      toVehicleId: "vehicle-2",
      customerIds: [],
    }),
    false,
  );
});
