import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
const code = ts.transpileModule(readFileSync(new URL("./reserve-product-history.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function("exports", code)(exports);
const event = (id, delta, at, reason = "order") => ({ id, delta, at, reason, notes: null, customerName: "เจ๊เอ๋", orderNumber: "DN1" });
const snapshot = { available: 20, startDate: "2026-10-14", now: "2026-10-15T12:00:00+07:00", futureLegacy: 0, events: [event("1", -20, "2026-10-14T09:15:00+07:00"), event("2", 30, "2026-10-15T08:00:00+07:00", "office"), event("3", -20, "2026-10-15T10:30:00+07:00"), event("4", -30, "2026-10-15T11:00:00+07:00")] };
test("daily ledger carries balances without adding carry rows to stock", () => {
  const { days } = exports.buildReserveHistory(snapshot, "2026-10-14", "2026-10-15");
  assert.deepEqual(days.map(day => day.opening), [60, 40]);
  assert.deepEqual(days.flatMap(day => day.rows.map(row => row.remaining)), [40, 70, 50, 20]);
});
test("range ending yesterday keeps yesterday balance rather than today's", () => {
  const { days } = exports.buildReserveHistory(snapshot, "2026-10-14", "2026-10-14");
  assert.equal(days.at(-1).rows.at(-1).remaining, 40);
});
test("pending midnight receipt never increases current or carried stock", () => {
  const result = exports.buildReserveHistory({ ...snapshot, events: [...snapshot.events, event("pending", 100, "2026-10-16T00:00:00+07:00", "office")] }, "2026-10-14", "2026-10-15");
  assert.equal(result.pending.length, 1);
  assert.equal(result.days[0].opening, 60);
  assert.equal(result.days.at(-1).rows.at(-1).remaining, 20);
});
test("Bangkok day boundary, returns, and decimal quantities stay accurate", () => {
  const { days } = exports.buildReserveHistory({ ...snapshot, available: 1.3, events: [event("a", -0.2, "2026-10-14T17:00:00Z"), event("b", 0.5, "2026-10-14T17:01:00Z")] }, "2026-10-14", "2026-10-15");
  assert.equal(days[0].date, "2026-10-15");
  assert.deepEqual(days[0].rows.map(row => row.remaining), [0.8, 1.3]);
  assert.match(exports.reserveHistoryLabel(days[0].rows[1]), /คืนจาก เจ๊เอ๋/);
});
test("empty histories and legacy future demand preserve the authoritative balance", () => {
  const result = exports.buildReserveHistory({ ...snapshot, available: -10, events: [], futureLegacy: 30 }, "2026-10-14", "2026-10-15");
  assert.equal(result.days[0].opening, -10);
  assert.equal(result.futureLegacy, 30);
});
test("a range before initialization never invents an earlier opening balance", () => {
  assert.deepEqual(exports.buildReserveHistory(snapshot, "2026-10-01", "2026-10-13").days, []);
});
