import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function formWith(values) {
  const state = [values, false, null];
  let hook = 0;
  const saved = [], pending = [];
  const mocks = {
    react: { ...React, useState: initial => {
      const index = hook++;
      if (state[index] === undefined) state[index] = initial;
      return [state[index], value => { state[index] = value; }];
    }, useTransition: () => [false, callback => pending.push(callback())] },
    "next/link": { default: ({ children }) => children },
    "next/navigation": { useRouter: () => ({ replace() {}, refresh() {} }) },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/components/settings/product-image-preview": { ProductImagePreview: () => null },
    "@/app/orders/fresh-reserve-stock/actions": { initializeReserveStockAction: async (date, rows) => {
      saved.push({ date, rows }); return { ok: true };
    } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./reserve-stock-opening-form.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => mocks[name] ?? require(name), loaded, loaded.exports);
  const products = ["p1", "p2", "p3"].map(id => ({ id, name: id, sku: id, imageUrl: null }));
  return { state, saved, pending, render() {
    hook = 0;
    return loaded.exports.ReserveStockOpeningForm({ products, date: "2026-10-11" });
  } };
}

test("partial opening quantities reach review and save every blank product as zero", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = { scrollTo() {} };
  try {
    const form = formWith({ p1: "12.5", p2: "" });
    const entry = form.render();
    assert.ok(!renderToStaticMarkup(entry).includes("required"));
    entry.props.onSubmit({ preventDefault() {} });
    assert.equal(form.state[1], true);
    assert.deepEqual(form.saved, []);
    const review = form.render();
    assert.ok(!renderToStaticMarkup(review).includes("NaN"));
    review.props.onSubmit({ preventDefault() {} });
    await Promise.all(form.pending);
    assert.deepEqual(form.saved[0].rows, [
      { productId: "p1", quantity: 12.5 }, { productId: "p2", quantity: 0 }, { productId: "p3", quantity: 0 },
    ]);
  } finally { globalThis.window = originalWindow; }
});

test("negative or invalid entered quantities never reach review or save", () => {
  for (const value of ["-1", "bad"]) {
    const form = formWith({ p1: value });
    form.render().props.onSubmit({ preventDefault() {} });
    assert.equal(form.state[1], false);
    assert.ok(form.state[2]);
    assert.deepEqual(form.saved, []);
  }
});
