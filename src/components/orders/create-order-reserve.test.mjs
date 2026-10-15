import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./create-order-modal.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("modal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(name) {
  let code;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = node.getText(ast);
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) code = `const ${node.getText(ast)};`;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(code, name);
  return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
function bind(name, dependencies) {
  return new Function(...Object.keys(dependencies), `${extract(name)}; return ${name};`)(...Object.values(dependencies));
}

test("normal and reserve cart rows stay separate while repeated reserve selections merge", async () => {
  let cart = [];
  const selection = { product: { id: "p", name: "เส้นสด" }, unitId: "u", unitLabel: "ถุง", baseQty: 5, quantity: 2, minOrderQty: 1, stepOrderQty: 1, unitPrice: 100 };
  for (const reserveMode of [false, true, true]) {
    await bind("addManyToCart", { customerId: "shop", replacementMode: false, barcodeMode: false, reserveMode,
      setCart: update => { cart = update(cart); }, normalizeToRule: value => value, role: "member", setPriceMap() {} })([selection]);
  }
  assert.equal(cart.length, 2);
  assert.equal(cart.find(row => row.isReserve).quantity, 4);
  assert.equal(cart.find(row => !row.isReserve).quantity, 2);
  assert.equal(cart.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0), 600);
});

test("reserve picker checks base units including amounts already selected in other sale units", async () => {
  for (const [quantity, expected] of [[3, false], [2, true]]) {
    let confirmed = false, error;
    await bind("handleConfirm", {
      selectedIds: new Set(["p"]), selections: { p: { quantity: String(quantity), unitId: "u", unitPrice: "100" } },
      products: [{ id: "p", name: "เส้นสด", unit: "กก." }],
      getUnits: () => [{ id: "u", baseUnitQuantity: 5, minOrderQty: 1, stepOrderQty: 1 }],
      getUnitPrice: () => 100, priceMap: {}, isReplacement: false, isReserve: true,
      cart: [{ productId: "p", isReserve: true, quantity: 10, saleUnitBaseQty: 1 }], reserveStock: { p: 20 },
      role: "member", isValidByRule: () => true, getEffectiveSaleUnitCost: () => 0,
      showPopup: message => { error = message; }, setCostWarningInfo() {}, setSaving() {},
      onConfirmMany: () => { confirmed = true; }, onClose() {},
    })();
    assert.equal(confirmed, expected);
    if (!expected) assert.match(error, /สำรองใช้ได้ 20/);
  }
});

test("failed manual saves reuse a request ID, changed contents use a new request ID", async () => {
  const requestIds = [], saveRequestRef = { current: null };
  let nextId = 0, pendingSave;
  const dependencies = {
    pending: false, setError() {}, customerId: "shop", cart: [{ productId: "p", quantity: 2, minOrderQty: 1, stepOrderQty: 1, unitPrice: 100 }],
    isValidByRule: () => true, role: "member", showSubmitPopup() {}, startTransition: callback => { pendingSave = callback(); },
    orderDate: "2026-10-15", notes: "", saveRequestRef, saveInFlightRef: { current: false }, FormData, crypto: { randomUUID: () => `request-${++nextId}` },
    createManualOrderAction: async data => { requestIds.push(data.get("requestId")); return { error: "network" }; },
  };
  const submit = bind("handleSubmit", dependencies);
  submit(); await pendingSave; submit(); await pendingSave;
  dependencies.cart[0].quantity = 3;
  submit(); await pendingSave;
  assert.deepEqual(requestIds, ["request-1", "request-1", "request-2"]);
});
