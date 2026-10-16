import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("./reserve-recent-activity.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", compiled)(name => name === "./reserve-warehouse-history" ? { ReserveWarehouseHistory: ({ label }) => React.createElement("button", null, label) } : name.endsWith(".module.css") ? new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) }) : require(name), loaded, loaded.exports);
const base = { id: "event", product_id: "p", productName: "เส้นเล็ก 1 โล สั้น มังกรฟ้า", quantity_delta: 50, reason: "office", created_at: "2026-10-17T18:00:00+07:00", effective_at: "2026-10-18T00:00:00+07:00", at: "2026-10-17T18:00:00+07:00", waiting: false, before: 80, after: 130 };
const render = item => renderToStaticMarkup(React.createElement(loaded.exports.ReserveMovementList, { items: [item] }));
const text = html => html.replace(/<[^>]*>/g, "");

test("receipt and withdrawal equations include word labels and full product names", () => {
  const incoming = text(render(base));
  assert.ok(incoming.includes(base.productName));
  assert.ok(incoming.includes("รับเข้า 50 + คงเหลือเดิม 80 = 130 กก."));
  const outgoing = text(render({ ...base, quantity_delta: -10, reason: "order", after: 70 }));
  assert.ok(outgoing.includes("คงเหลือเดิม 80 − ใช้สำรอง 10 = 70 กก."));
});

test("pending rows display current stock separately from the forecast", () => {
  const html = render({ ...base, waiting: true });
  const result = text(html);
  assert.ok(result.includes("ใช้ได้ตอนนี้80 กก."));
  assert.ok(result.includes("รอรับเข้า 50 + คงเหลือเดิม 80 = คาดการณ์ 130 กก."));
  assert.ok(result.includes("มีผล 18 ต.ค. 2569 · 00:00 น."));
  assert.match(html, /class="pendingText">รอรับเข้า/);
  assert.doesNotMatch(result, /รับเข้าออฟฟิศ|เหลือหลังรายการ/);
});

test("zero balances are preserved and missing history is never displayed as zero", () => {
  assert.ok(text(render({ ...base, before: 10, after: 0, quantity_delta: -10 })).includes("เหลือหลังรายการ0 กก."));
  const unknown = text(render({ ...base, before: null, after: null }));
  assert.ok(unknown.includes("ไม่มีข้อมูลยอดก่อน–หลังรายการนี้"));
  assert.ok(unknown.includes("เหลือหลังรายการ– กก."));
});

test("cancelling a pending receipt does not show a reduction of usable stock", () => {
  const result = text(render({ ...base, waiting: true, quantity_delta: -50, after: 80 }));
  assert.ok(result.includes("ลดรอรับ 50 · คงเหลือ 80 กก. (ไม่เปลี่ยน)"));
});

test("completed receipt keeps recording time but does not look like a pending receipt", () => {
  const result = render({ ...base, at: base.effective_at });
  assert.match(result, /00:00<span/);
  assert.doesNotMatch(text(result), /มีผล|รอรับเข้า|คาดการณ์/);
  assert.match(result, /class="receivedText">รับเข้าออฟฟิศ/);
  assert.ok(text(result).includes("เวลาเกิดรายการ · เก่า → ใหม่"));
});

test("historical scheduled row and its receipt render on different days with independent labels", () => {
  const scheduled = { ...base, id: "event:scheduled", event_kind: "scheduled", waiting: true };
  const receipt = { ...base, id: "event:received", event_kind: "received", at: base.effective_at };
  const html = renderToStaticMarkup(React.createElement(loaded.exports.ReserveMovementList, { items: [scheduled, receipt] }));
  assert.match(html, /class="pendingText">รอรับเข้า/);
  assert.match(html, /class="receivedText">รับเข้าออฟฟิศ/);
  assert.ok(text(html).includes("17 ต.ค. 2569"));
  assert.ok(text(html).includes("18 ต.ค. 2569"));
  assert.ok(text(html).includes("ใช้ได้ขณะนั้น80 กก."));
});
