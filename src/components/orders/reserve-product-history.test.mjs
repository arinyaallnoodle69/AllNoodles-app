import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const loaded = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", compiled)(name => mocks[name] ?? require(name), loaded, loaded.exports);
  return loaded.exports;
}
const ledger = load("../../lib/orders/reserve-product-history.ts");
const ui = load("./reserve-product-history.tsx", {
  "@/lib/orders/reserve-product-history": ledger,
  "@/app/orders/fresh-reserve-stock/history-actions": {},
  "./reserve-product-history.module.css": new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) }),
});
const row = (id, reason, delta, remaining, notes = null) => ({ id, reason, delta, remaining, notes, at: "2026-10-16T09:25:00+07:00", customerName: "เจ๊แมว", orderNumber: "DN1" });
const render = rows => renderToStaticMarkup(React.createElement(ui.ReserveProductHistoryTable, { today: "2026-10-17", days: [{ date: "2026-10-16", opening: 60, rows }] }));
const cells = html => [...html.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(match => match[1].replace(/<[^>]*>/g, ""));

test("only office receipts occupy receive; adjustments have signed values in their own column", () => {
  const html = render([row("office", "office", 250, 310), row("count", "adjustment", 420, 730, "ตรวจนับสต็อค"), row("base", "adjustment", -480, 250, "ปรับฐานตามยอดตรวจนับเดิม")]);
  assert.deepEqual(cells(html), ["–", "–", "–", "60", "250", "–", "–", "310", "–", "–", "+420", "730", "–", "–", "−480", "250"]);
  assert.match(html, /ของเหลือ/);
  assert.doesNotMatch(html, /ยกยอด/);
  assert.match(html, /<details[^>]*>.*<summary[^>]*aria-label="ดูเหตุผล ตรวจนับ"/);
  assert.match(html, /แก้ฐาน/);
  assert.match(html, /class="remaining latest">250/);
});

test("orders, returns and cancelled office receipts never masquerade as new receipts", () => {
  const html = render([row("order", "order", -20, 40), row("return", "order", 10, 50), row("cancel", "office", -10, 40)]);
  assert.deepEqual(cells(html), ["–", "–", "–", "60", "–", "20", "–", "40", "–", "10", "–", "50", "–", "–", "−10", "40"]);
  assert.match(html, /aria-label="−20"/);
  assert.match(html, /aria-label="\+10"/);
});

test("receipt and issue headers/amounts have semantic colours and plus/minus icons", () => {
  const html = render([row("office", "office", 50, 110), row("order", "order", -20, 90)]);
  assert.match(html, /scope="col" class="receive"/);
  assert.match(html, /scope="col" class="issue"/);
  assert.match(html, /<td class="receive"><span[^>]*aria-label="\+50"/);
  assert.match(html, /<td class="issue"><span[^>]*aria-label="−20"/);
  assert.match(html, /lucide-plus/);
  assert.match(html, /lucide-minus/);
});

test("all five headers are sticky within the same scroll surface", () => {
  const html = render([]);
  assert.equal((html.match(/scope="col"/g) ?? []).length, 5);
  const css = readFileSync(new URL("./reserve-product-history.module.css", import.meta.url), "utf8");
  assert.match(css, /\.table thead th\s*\{[^}]*position: sticky;[^}]*top: 0;/);
  assert.match(css, /\.scroll\s*\{[^}]*overflow: auto;/);
});
