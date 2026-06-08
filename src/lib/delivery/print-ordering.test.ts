import assert from "node:assert/strict";
import { sortDeliveryPrintRowsByCustomerOrder } from "./print-ordering";

const sorted = sortDeliveryPrintRowsByCustomerOrder([
  {
    id: "dn-store-b",
    created_at: "2026-06-08T08:00:00.000Z",
    delivery_date: "2026-06-08",
    customer_id: "store-b",
    customers: { customer_code: "A002", name: "Store B" },
  },
  {
    id: "dn-store-a",
    created_at: "2026-06-08T09:00:00.000Z",
    delivery_date: "2026-06-08",
    customer_id: "store-a",
    customers: { customer_code: "A001", name: "Store A" },
  },
]);

assert.deepEqual(
  sorted.map((row) => row.id),
  ["dn-store-a", "dn-store-b"],
);
