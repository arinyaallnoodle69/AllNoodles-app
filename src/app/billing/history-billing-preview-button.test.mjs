import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);

test("history batch preserves each saved bill's snapshot, number, dates and total even for the same customer", () => {
  const inputs = [];
  const mocks = {
    "react-dom": { createPortal: children => children },
    "lucide-react": { FileText: () => null, X: () => null },
    "@/components/print/billing-document-actions": { BillingDocumentActions: () => null },
    "@/components/print/print-shared": { PRINT_ORGANIZATION_NAME: "test" },
    "@/components/print/billing-statement-layout": { buildBillingInvoicePages(input) { inputs.push(input); return [{ key: "same" }]; } },
  };
  const source = ts.transpileModule(readFileSync(new URL("./history-billing-preview-button.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(name => mocks[name] ?? require(name), loaded, loaded.exports);
  const history = [1, 2].map(i => ({ id: `record${i}`, customer_id: "same-customer", customer_code: "ANS-test", customer_name: "ร้านทดสอบ", billing_number: `B${i}`, billing_date: `2026-10-0${i}`, created_at: "", from_date: `2026-09-0${i}`, to_date: `2026-10-0${i}`, total_amount: i * 150, snapshot_rows: [{ deliveryNumber: `D${i}`, totalAmount: i * 150 }] }));
  renderToStaticMarkup(React.createElement(loaded.exports.HistoryBillingPreviewButton, { history }));
  assert.equal(inputs.length, 2);
  inputs.forEach((input, i) => {
    assert.equal(input.billingNumber, history[i].billing_number);
    assert.equal(input.billingDate, history[i].billing_date);
    assert.equal(input.fromDate, history[i].from_date);
    assert.equal(input.toDate, history[i].to_date);
    assert.equal(input.grandTotal, history[i].total_amount);
    assert.deepEqual(input.rows, history[i].snapshot_rows);
    assert.equal(input.isLocked, true);
  });
});
