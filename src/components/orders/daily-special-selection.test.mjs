import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

test("saving provincial reserve entries preserves other products and warehouses", async () => {
  const source = readFileSync(new URL("./daily-special-order-manager.tsx", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("  function saveAll()"), source.indexOf("  const mobileTrigger"));
  const outside = { productId: "stock-product", vehicleId: "bkk", type: "office", quantity: 90 };
  const inside = { productId: "fresh-lotus", vehicleId: "province", type: "office", quantity: 50 };
  let pending;
  let saved;
  const context = {
    initialItems: [outside, inside],
    cart: [{ ...inside, quantity: 60 }], restrictToSelection: true, date: "2026-10-13",
    isInSelection: (item) => item.productId === "fresh-lotus" && item.vehicleId === "province",
    initialItemsToCart: (items) => items,
    startTransition: (callback) => { pending = callback(); },
    saveDailySpecialItemsAction: async (_date, items, expected) => { saved = { items, expected }; return { ok: true }; },
    setError() {}, setToast() {}, setIsOpen() {}, router: { refresh() {} },
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(code, {}).outputText, context);
  context.saveAll();
  await pending;
  assert.equal(saved.items.length, 2);
  assert.equal(saved.items[0], outside);
  assert.equal(saved.items[1].quantity, 60);
  assert.equal(saved.expected[1].quantity, 50);
});
