import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import React from "react";

const require = createRequire(import.meta.url);
function editor(result = { ok: true }) {
  const state = [];
  const saved = [], pending = [], scopes = [];
  let cursor = 0;
  const mocks = {
    "./reserve-stock-dialog": { ReserveStockDialog: () => null },
    react: { ...React, useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = value; }];
    }, useTransition: () => [false, callback => pending.push(callback())] },
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/app/orders/fresh-reserve-stock/actions": { adjustReserveBalanceAction: async (input, scope) => { saved.push(input); scopes.push(scope); return result; } },
  };
  const source = readFileSync(new URL("./reserve-stock-balance-editor.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => mocks[name] ?? require(name), loaded, loaded.exports);
  return { state, saved, pending, scopes, render(available = 50, scope = "bangkok") {
    cursor = 0;
    const view = loaded.exports.ReserveStockBalanceEditor({ groupId: "group", productId: "product", productName: "เส้นเล็ก", available, scope });
    return view.type === mocks["./reserve-stock-dialog"].ReserveStockDialog ? view.props.children : view;
  } };
}

test("editing sends the counted balance and keeps the original snapshot while the page refreshes", async () => {
  const form = editor();
  form.render().props.children[0].props.onClick();
  assert.equal(form.state[2], "50");
  form.state[2] = "45";
  form.render(70).props.onSubmit({ preventDefault() {} });
  await Promise.all(form.pending);
  assert.deepEqual(form.saved[0], { groupId: "group", productId: "product", expectedAvailable: 50, quantity: 45, notes: "ตรวจนับสต็อค" });
  assert.equal(form.state[0], false);
  assert.equal(form.state[5], true);
});

test("blank quantity never clears stock by accident", () => {
  const form = editor();
  form.render().props.children[0].props.onClick();
  form.state[2] = "";
  form.render().props.onSubmit({ preventDefault() {} });
  assert.equal(form.saved.length, 0);
  assert.match(form.state[4], /กรอกยอดคงเหลือ/);
});

test("failed save retains the user's counted quantity and shows the server error", async () => {
  const form = editor({ ok: false, error: "คงเหลือเปลี่ยนแล้ว" });
  form.render().props.children[0].props.onClick();
  form.state[2] = "45";
  form.render().props.onSubmit({ preventDefault() {} });
  await Promise.all(form.pending);
  assert.equal(form.state[0], true);
  assert.equal(form.state[2], "45");
  assert.equal(form.state[4], "คงเหลือเปลี่ยนแล้ว");
});

test("province correction uses the same editor and preserves a negative shortage snapshot", async () => {
  const form = editor();
  form.render(-20, "province").props.children[0].props.onClick();
  form.state[2] = "15";
  form.render(-20, "province").props.onSubmit({ preventDefault() {} });
  await Promise.all(form.pending);
  assert.equal(form.saved[0].expectedAvailable, -20);
  assert.equal(form.saved[0].quantity, 15);
  assert.equal(form.scopes[0], "province");
});
