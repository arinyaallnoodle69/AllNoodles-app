import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const math = { exports: {} };
new Function("require", "module", "exports", compile("../../lib/orders/reserve-warehouse-history.ts"))(require, math, math.exports);
const movements = { exports: {} };
new Function("require", "module", "exports", compile("./reserve-recent-activity.tsx"))(name => name.endsWith(".module.css") ? new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) }) : require(name), movements, movements.exports);
function harness(fetch) {
  const state = [], refs = [];
  let cursor = 0, refCursor = 0;
  const mocks = {
    react: { ...React, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => state[i] = typeof v === "function" ? v(state[i]) : v]; }, useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; } },
    "./reserve-stock-dialog": { ReserveStockDialog: ({ children }) => children },
    "./reserve-recent-activity": movements.exports,
    "./reserve-warehouse-history.module.css": new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) }),
    "@/lib/orders/reserve-warehouse-history": math.exports,
    "@/app/orders/fresh-reserve-stock/history-actions": { fetchReserveWarehouseHistory: fetch },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compile("./reserve-warehouse-history.tsx"))(name => mocks[name] ?? require(name), loaded, loaded.exports);
  return { state, render() { cursor = refCursor = 0; return loaded.exports.ReserveWarehouseHistory({ groupId: "group", warehouseName: "คลังกรุงเทพ", supplierName: "โรงงานมังกร", asOf: "2026-10-15T12:00:00+07:00" }); } };
}
function nodes(tree, type) { return !tree || typeof tree !== "object" ? [] : [...(tree.type === type ? [tree] : []), ...React.Children.toArray(tree.props?.children).flatMap(child => nodes(child, type))]; }
const tick = () => new Promise(resolve => setImmediate(resolve));
const base = { reason: "order", effective_at: "2026-10-15T08:00:00+07:00", created_at: "2026-10-15T08:00:00+07:00" };
const snapshot = { asOf: "2026-10-15T12:00:00+07:00", cursor: null, total: 3, items: [
  { ...base, id: "zero", productName: "ยอดศูนย์", quantity_delta: -20, quantity_after: 0, before: 20, after: 0 },
  { ...base, id: "old", productName: "ไม่มีข้อมูลเดิม", quantity_delta: -10, quantity_after: null },
  { ...base, id: "pending", productName: "ยอดรอเข้า", reason: "office", quantity_delta: 50, quantity_after: null, before: 80, after: 130, waiting: true, effective_at: "2026-10-16T00:00:00+07:00" },
] };
test("history modal uses compact movement equations and separates pending balances", async () => {
  const ui = harness(async () => snapshot);
  nodes(ui.render(), "button")[0].props.onClick(); await tick();
  const html = renderToStaticMarkup(ui.render());
  const text = html.replace(/<[^>]*>/g, "");
  assert.ok(text.includes("คงเหลือเดิม 20 − ใช้สำรอง 20 = 0 กก."));
  assert.ok(text.includes("ไม่มีข้อมูลยอดก่อน–หลังรายการนี้"));
  assert.ok(text.includes("ใช้ได้ตอนนี้80 กก."));
  assert.ok(text.includes("รอรับเข้า 50 + คงเหลือเดิม 80 = คาดการณ์ 130 กก."));
  assert.doesNotMatch(html, /<table|ข้อมูลตัวอย่าง/);
});

test("main stock page keeps the history trigger without a separate bottom activity section", () => {
  const source = readFileSync(new URL("../../app/orders/fresh-reserve-stock/page.tsx", import.meta.url), "utf8");
  assert.match(source, /<ReserveWarehouseHistory/);
  assert.doesNotMatch(source, /ReserveRecentActivity|ReserveMovementList|buildRecentReserveActivities/);
});
test("load more keeps the snapshot and appends; a newer filter discards a late response", async () => {
  const calls = [], pending = [];
  const ui = harness(input => { calls.push(input); return new Promise(resolve => pending.push(resolve)); });
  nodes(ui.render(), "button")[0].props.onClick();
  pending.shift()({ ...snapshot, cursor: { at: "cursor-time", id: "cursor-id" } }); await tick();
  nodes(ui.render(), "button").find(b => b.props.children === "โหลดรายการเพิ่มเติม").props.onClick();
  assert.equal(calls[1].asOf, snapshot.asOf); assert.equal(calls[1].cursor.id, "cursor-id");
  pending.shift()({ ...snapshot, items: [{ ...snapshot.items[0], id: "extra" }], total: 4 }); await tick();
  assert.equal(ui.state[4].items.length, 4);
  nodes(ui.render(), "button").find(b => b.props.children === "วันนี้").props.onClick();
  nodes(ui.render(), "button").find(b => b.props.children === "7 วัน").props.onClick();
  pending.pop()({ ...snapshot, total: 99 }); await tick();
  pending.shift()({ ...snapshot, total: 12 }); await tick();
  assert.equal(ui.state[4].total, 99);
});
test("Bangkok day and seven-day range cross month/year boundaries correctly", () => {
  assert.equal(math.exports.reserveHistoryDay("2026-10-15T17:00:00Z"), "2026-10-16");
  assert.equal(math.exports.reserveHistoryWeek("2026-01-03"), "2025-12-28");
});
