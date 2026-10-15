import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("shared report PDF keeps billing pages portrait, full size, in order and with the footer flex layout", async () => {
  const captures = [], images = [], added = [];
  const pages = [0, 1].map(index => ({ index, dataset: {}, offsetWidth: 794, offsetHeight: 1123,
    classList: { contains: name => ["vehicle-summary-sheet", "billing-invoice-sheet"].includes(name) },
  }));
  const doc = { querySelectorAll: () => pages, fonts: { ready: Promise.resolve() } };
  class Pdf {
    constructor(options) { assert.equal(options.orientation, "portrait"); }
    addPage(size) { added.push(size); }
    addImage(...args) { images.push(args); }
    output() { return new Blob(["fixture"], { type: "application/pdf" }); }
  }
  const mocks = {
    "@/components/print/print-image-cache": { inlineCaptureImages: async targets => { assert.equal(targets.length, 2); return []; }, restoreCaptureImages() {} },
    "html-to-image": { toPng: async (page, options) => { captures.push({ index: page.index, ...options }); return `data:image/png;base64,page${page.index}`; } },
    "jspdf": { jsPDF: Pdf },
    "html2canvas": { default: () => { throw new Error("Unexpected fallback"); } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./share-packing-list-pdf.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  const window = { navigator: { userAgent: "iPhone" }, setTimeout: (callback, delay) => delay < 1200 ? setTimeout(callback, 0) : undefined };
  new Function("require", "module", "exports", "window", "document", compiled)(name => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`);
    return mocks[name];
  }, loaded, loaded.exports, window, doc);
  const result = await loaded.exports.createPackingListPdfPreviewFromDocument(doc, "ใบวางบิลทดสอบ", "billing-font");
  assert.deepEqual(captures.map(c => c.index), [0, 0, 1, 1]);
  captures.forEach(c => {
    assert.equal(c.style.display, "flex");
    assert.equal(c.fontEmbedCSS, "billing-font");
    assert.equal(c.width, 794);
    assert.equal(c.height, 1123);
    assert.equal(c.pixelRatio, 2.5);
  });
  assert.deepEqual(added, [[210, 297]]);
  assert.equal(images.length, 2);
  assert.deepEqual(images[0].slice(2, 6), [0, 0, 210, 297]);
  assert.equal(result.file.name, "ใบวางบิลทดสอบ.pdf");
  assert.equal(result.previewImages.length, 2);
});
