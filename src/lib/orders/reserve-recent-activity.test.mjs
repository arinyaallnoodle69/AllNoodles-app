import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)(name => dependencies[name], loaded, loaded.exports);
  return loaded.exports;
}
const history = load("./reserve-product-history.ts");
const { buildRecentReserveActivities } = load("./reserve-recent-activity.ts", { "./reserve-product-history": history });
const now = "2026-10-17T21:00:00+07:00";
const movement = (id, delta, at, effective = at) => ({ id, product_id: "p", productName: "เส้นสด", quantity_delta: delta, reason: "office", created_at: at, effective_at: effective });
const receipt = movement("receipt", 50, "2026-10-16T18:00:00+07:00", "2026-10-17T00:00:00+07:00");
const used = { ...movement("used", -10, "2026-10-17T18:00:00+07:00"), reason: "order" };
const pending = movement("pending", 50, "2026-10-17T18:01:00+07:00", "2026-10-18T00:00:00+07:00");
function snapshot(available, movements, at = now) {
  return new Map([["p", { available, startDate: "2026-10-16", now: at, futureLegacy: 0, events: movements.map(m => ({ id: m.id, delta: m.quantity_delta, reason: m.reason, at: m.effective_at })) }]]);
}

test("receipts and withdrawals show the authoritative balance before and after each event", () => {
  const result = buildRecentReserveActivities([receipt, used], snapshot(120, [receipt, used]), now);
  assert.deepEqual(result.map(row => [row.id, row.before, row.after]), [["receipt", 80, 130], ["used", 130, 120]]);
  assert.equal(result[0].at, receipt.effective_at, "midnight receipt displays its actual effective time");
});
test("pending receipts keep today's balance and label the future sum separately", () => {
  const [result] = buildRecentReserveActivities([pending], snapshot(80, [pending]), now);
  assert.equal(result.waiting, true);
  assert.equal(result.before, 80);
  assert.equal(result.after, 130);
  assert.equal(result.at, pending.created_at);
  const [received] = buildRecentReserveActivities([pending], snapshot(130, [pending], "2026-10-18T00:00:01+07:00"), "2026-10-18T00:00:01+07:00");
  assert.equal(received.waiting, false);
  assert.deepEqual([received.before, received.after], [80, 130]);
});
test("unknown balances stay unknown; zero and decimals remain valid", () => {
  const [unknown] = buildRecentReserveActivities([used], new Map(), now);
  assert.equal(unknown.after, null);
  const zero = { ...used, quantity_delta: -0.5 };
  const [result] = buildRecentReserveActivities([zero], snapshot(0, [zero]), now);
  assert.deepEqual([result.before, result.after], [0.5, 0]);
});

test("cancelling a future receipt does not subtract from today's usable stock", () => {
  const cancel = { ...pending, id: "cancel", quantity_delta: -50 };
  const [result] = buildRecentReserveActivities([cancel], snapshot(80, [pending, cancel]), now);
  assert.deepEqual([result.before, result.after], [80, 80]);
});

test("scheduled history persists after midnight alongside a separate receipt; balances do not use today's stock", () => {
  const scheduled = { ...receipt, id: "receipt:scheduled", movement_id: "receipt", event_kind: "scheduled", event_at: receipt.created_at };
  const received = { ...receipt, id: "receipt:received", movement_id: "receipt", event_kind: "received", event_at: receipt.effective_at };
  const result = buildRecentReserveActivities([scheduled, received, used], snapshot(120, [receipt, used]), now);
  assert.deepEqual(result.map(r => [r.id, r.waiting, r.before, r.after]), [
    ["receipt:scheduled", true, 80, 130], ["receipt:received", false, 80, 130], ["used", false, 130, 120],
  ]);
  assert.equal(result[0].at, receipt.created_at);
  assert.equal(result[1].at, receipt.effective_at);
  const [beforeMidnight] = buildRecentReserveActivities([scheduled], snapshot(80, [receipt], "2026-10-16T20:00:00+07:00"), "2026-10-16T20:00:00+07:00");
  assert.deepEqual([beforeMidnight.waiting, beforeMidnight.before, beforeMidnight.after], [true, 80, 130]);
});
