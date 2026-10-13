import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./incoming-order-modal.tsx", import.meta.url), "utf8");

function mount(fetchDetail) {
  const start = source.indexOf("function EditItemsPanel(");
  assert.notEqual(start, -1, "edit entry must refresh before mounting the editable form");
  const code = source.slice(start, source.indexOf("// Main modal", start));
  const states = [];
  let cursor = 0;
  let effect;
  const context = {
    Error,
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = value; }];
    },
    useEffect(callback) { effect = callback; },
    fetchIncomingOrderDetailAction: fetchDetail,
    CurrentOrderEditItemsPanel: "editable-form",
    Loader2: "spinner",
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText, context);
  return {
    render(detail) { cursor = 0; return context.EditItemsPanel({ detail, products: [], onDone() {} }); },
    load() { return effect(); },
  };
}

test("first edit waits for fresh data instead of using prefetched quantities and version", async () => {
  let resolve;
  const stale = { id: "order", updatedAt: "old", items: [{ quantity: 5 }] };
  const fresh = { id: "order", updatedAt: "new", items: [{ quantity: 10 }] };
  const panel = mount((id) => {
    assert.equal(id, "order");
    return new Promise((done) => { resolve = done; });
  });
  assert.notEqual(panel.render(stale).type, "editable-form");
  panel.load();
  resolve({ detail: fresh });
  await new Promise(setImmediate);
  const ready = panel.render(stale);
  assert.equal(ready.type, "editable-form");
  assert.equal(ready.props.detail, fresh);
  assert.equal(panel.render({ ...stale, updatedAt: "preview-refresh" }).props.detail, fresh);
  assert.notEqual(panel.render({ id: "another" }).type, "editable-form");
});

test("failed refresh never enables saving cached data", async () => {
  const panel = mount(async () => ({ detail: null, error: "โหลดไม่สำเร็จ" }));
  const stale = { id: "order" };
  panel.render(stale);
  panel.load();
  await new Promise(setImmediate);
  const result = panel.render(stale);
  assert.notEqual(result.type, "editable-form");
  assert.match(JSON.stringify(result), /โหลดไม่สำเร็จ/);
});

test("late response after leaving an order does not initialize its form", async () => {
  let resolve;
  const panel = mount(() => new Promise((done) => { resolve = done; }));
  panel.render({ id: "old" });
  const cleanup = panel.load();
  cleanup();
  resolve({ detail: { id: "old" } });
  await new Promise(setImmediate);
  assert.notEqual(panel.render({ id: "old" }).type, "editable-form");
});

test("network failure shows an error without enabling the cached form", async () => {
  const panel = mount(async () => { throw new Error("network unavailable"); });
  panel.render({ id: "order" });
  panel.load();
  await new Promise(setImmediate);
  const result = panel.render({ id: "order" });
  assert.notEqual(result.type, "editable-form");
  assert.match(JSON.stringify(result), /network unavailable/);
});
