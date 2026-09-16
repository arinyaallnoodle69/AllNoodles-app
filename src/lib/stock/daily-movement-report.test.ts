import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { aggregateDailyMovementRows, buildDailyMovementRows } from "./daily-movement-report.ts";

test("carries closing stock into every following day and keeps store details out of totals", () => {
  const rows = buildDailyMovementRows("2026-09-14", "2026-09-16", [
    { id: "r", productId: "p", warehouseId: "w", occurredAt: "2026-09-14T03:00:00Z", type: "receipt", delta: 40, before: 200, after: 240, document: "RCV1", store: null },
    { id: "s", productId: "p", warehouseId: "w", occurredAt: "2026-09-14T04:00:00Z", type: "issue", delta: -130, before: 240, after: 110, document: "DN1", store: "ร้าน 1" },
    { id: "s2", productId: "p", warehouseId: "w", occurredAt: "2026-09-15T04:00:00Z", type: "issue", delta: -30, before: 110, after: 80, document: "DN2", store: "ร้าน 2" },
  ]);

  assert.deepEqual(rows.map(({ date, opening, received, sold, closing }) => ({ date, opening, received, sold, closing })), [
    { date: "2026-09-14", opening: 200, received: 40, sold: 130, closing: 110 },
    { date: "2026-09-15", opening: 110, received: 0, sold: 30, closing: 80 },
    { date: "2026-09-16", opening: 80, received: 0, sold: 0, closing: 80 },
  ]);
  assert.deepEqual(rows[0].sales, [{ store: "ร้าน 1", document: "DN1", quantity: 130 }]);
  assert.equal(rows[0].net, -90);
  assert.equal(rows[0].movements.length, 2);
});

test("does not mislabel non-delivery adjustments as store sales", () => {
  const [row] = buildDailyMovementRows("2026-09-14", "2026-09-14", [
    { id: "a", productId: "p", warehouseId: "w", occurredAt: "2026-09-14T03:00:00Z", type: "adjustment", delta: -10, before: 100, after: 90, document: null, store: null },
  ]);
  assert.equal(row.sold, 0);
  assert.equal(row.adjusted, -10);
  assert.equal(row.other, 0);
  assert.equal(row.net, -10);
  assert.equal(row.closing, 90);
});

test("separates order returns from manual stock adjustments", () => {
  const [row] = buildDailyMovementRows("2026-09-14", "2026-09-14", [
    { id: "return", productId: "p", warehouseId: "w", occurredAt: "2026-09-14T03:00:00Z", type: "return", delta: 30, before: 70, after: 100, document: "DN1", store: "ร้าน 1" },
    { id: "adjust", productId: "p", warehouseId: "w", occurredAt: "2026-09-14T04:00:00Z", type: "adjustment", delta: -5, before: 100, after: 95, document: null, store: null, reason: "ตรวจนับจริง" },
  ]);
  assert.equal(row.returned, 30);
  assert.equal(row.adjusted, -5);
  assert.equal(row.net, 25);
  assert.equal(row.closing, 95);
});

test("uses the latest recorded stock_after when movement history has a gap", () => {
  const [row] = buildDailyMovementRows("2026-09-14", "2026-09-14", [
    { id: "one", productId: "p", warehouseId: "w", occurredAt: "2026-09-14T03:00:00Z", type: "issue", delta: -10, before: 100, after: 90, document: "DN1", store: "ร้าน 1" },
    { id: "two", productId: "p", warehouseId: "w", occurredAt: "2026-09-14T04:00:00Z", type: "issue", delta: -5, before: 80, after: 75, document: "DN2", store: "ร้าน 2" },
  ]);
  assert.equal(row.mismatch, true);
  assert.equal(row.net, -25);
  assert.equal(row.closing, 75);
});

test("orders movements with the same timestamp by their balance chain", () => {
  const rows = buildDailyMovementRows("2026-09-15", "2026-09-16", [
    { id: "previous", productId: "p", warehouseId: "w", occurredAt: "2026-09-15T06:42:43Z", type: "issue", delta: -30, before: 550, after: 520, document: "DN44", store: "ร้าน 1" },
    { id: "a-issue-sorts-first", productId: "p", warehouseId: "w", occurredAt: "2026-09-16T07:12:49Z", type: "issue", delta: -5, before: 525, after: 520, document: "DN43", store: "ร้าน 2" },
    { id: "z-return-sorts-last", productId: "p", warehouseId: "w", occurredAt: "2026-09-16T07:12:49Z", type: "return", delta: 5, before: 520, after: 525, document: "DN43", store: "ร้าน 2" },
  ]);

  assert.deepEqual(rows[1].movements.map((movement) => movement.id), ["z-return-sorts-last", "a-issue-sorts-first"]);
  assert.equal(rows[1].opening, 520);
  assert.equal(rows[1].returned, 5);
  assert.equal(rows[1].sold, 5);
  assert.equal(rows[1].net, 0);
  assert.equal(rows[1].closing, 520);
  assert.equal(rows[1].mismatch, false);
});

test("aggregates daily rows into one product and warehouse stock card", () => {
  const rows = buildDailyMovementRows("2026-09-15", "2026-09-16", [
    { id: "sale-15", productId: "p", warehouseId: "w", occurredAt: "2026-09-15T03:00:00.000Z", type: "issue", delta: -5, before: 525, after: 520, document: "DN1", store: "ร้าน 1" },
    { id: "return-16", productId: "p", warehouseId: "w", occurredAt: "2026-09-16T07:00:00.000Z", type: "return", delta: 5, before: 520, after: 525, document: "DN1", store: "ร้าน 1" },
  ]);
  const [range] = aggregateDailyMovementRows(rows);

  assert.equal(range.opening, 525);
  assert.equal(range.sold, 5);
  assert.equal(range.returned, 5);
  assert.equal(range.net, 0);
  assert.equal(range.closing, 525);
  assert.deepEqual(range.movements.map((item) => item.id), ["sale-15", "return-16"]);
});
