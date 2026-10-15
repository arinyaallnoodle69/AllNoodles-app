import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadExport(count, failPdf = false) {
  const clones = [], calls = [], events = {};
  let removed = false;
  const doc = {
    title: "", head: { appendChild() {} }, body: { appendChild(shell) { clones.push(shell.child); } },
    fonts: { load: async font => calls.push(font), ready: Promise.resolve() },
    createElement: () => ({ appendChild(child) { this.child = child; } }),
  };
  const frame = { title: "", style: {}, contentDocument: doc, remove() { removed = true; },
    contentWindow: { addEventListener(name, callback) { events[name] = callback; }, focus() {}, print() { calls.push("print"); } },
  };
  const mocks = {
    "./billing-statement-layout": { BILLING_INVOICE_STYLES: "billing-css", getBillingFontEmbedCSS: async () => "billing-font" },
    "./share-packing-list-pdf": { createPackingListPdfPreviewFromDocument: async (document, name, font) => {
      calls.push({ name, font, pages: clones.length });
      assert.equal(document, doc);
      if (failPdf) throw new Error("capture failed");
      return { file: name, previewImages: clones };
    } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./billing-document-export.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  const document = { createElement: () => frame, body: { appendChild() {} } };
  const window = { setTimeout() {} };
  new Function("require", "module", "exports", "document", "window", compiled)(name => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`);
    return mocks[name];
  }, loaded, loaded.exports, document, window);
  const root = { querySelectorAll(selector) {
    assert.equal(selector, ".billing-invoice-page");
    return Array.from({ length: count }, (_, index) => ({ cloneNode(deep) {
      assert.equal(deep, true);
      return { index, classList: { add(...names) { assert.deepEqual(names, ["packing-sheet", "vehicle-summary-sheet"]); } } };
    } }));
  } };
  return { run: mode => loaded.exports.exportBillingDocument(root, mode, "บิลทดสอบ"), calls, events, removed: () => removed };
}

test("PDF exports only pages in the opened bill or batch, with billing fonts and portrait layout", async () => {
  for (const count of [1, 2, 5]) {
    const fixture = loadExport(count);
    await fixture.run("pdf");
    assert.deepEqual(fixture.calls.at(-1), { name: "บิลทดสอบ", font: "billing-font", pages: count });
    assert.equal(fixture.removed(), true);
  }
});

test("print waits for fonts and retains its isolated document until print closes", async () => {
  const fixture = loadExport(3);
  await fixture.run("print");
  assert.equal(fixture.calls.at(-1), "print");
  assert.equal(fixture.removed(), false);
  fixture.events.afterprint();
  assert.equal(fixture.removed(), true);
});

test("empty or failed PDF exports report errors and clean up without saving billing history", async () => {
  await assert.rejects(loadExport(0).run("pdf"), /ไม่พบใบวางบิล/);
  const fixture = loadExport(2, true);
  await assert.rejects(fixture.run("pdf"), /capture failed/);
  assert.equal(fixture.removed(), true);
});
