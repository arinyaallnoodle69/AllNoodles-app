import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import * as icons from "lucide-react";

const require = createRequire(import.meta.url);
const source = readFileSync("src/components/orders/create-order-modal.tsx", "utf8");
const ast = ts.createSourceFile("modal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
let vehicleHandler;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect") {
    const text = node.arguments[0].getText(ast);
    if (text.includes("savedScrollYRef.current =") || text.includes("customerPickerViewportRef")) effects.push(text);
  }
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleVehicleSelect") vehicleHandler = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const start = source.indexOf('<div ref={customerPickerViewportRef}');
const end = source.lastIndexOf('      ) : null}', source.indexOf('{open && editingCartItem', start));
const jsx = source.slice(start, end).trim();
const props = {
  customerPickerViewportRef: null, vehicleTabsContainerRef: null, customerPickerQuery: "", vehicleUnderlineStyle: null,
  selectedVehicleId: "bkk", customerId: "", customerOrderCountsByDate: {},
  vehicles: [{ id: "bkk", name: "รถกรุงเทพ" }, ...Array.from({ length: 8 }, (_, i) => ({ id: `v${i}`, name: `รถต่างจังหวัด ${i + 1}` }))],
  filteredCustomers: Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, name: `ร้านค้าทดสอบ ${i + 1}`, code: `TEST${String(i + 1).padStart(3, "0")}` })),
  setCustomerPickerOpen() {}, setCustomerPickerQuery() {}, handleVehicleSelect() {}, handleCustomerSelect() {},
  X: icons.X, Search: icons.Search, Building2: icons.Building2, Check: icons.Check,
};
const compiled = ts.transpileModule(`function Fixture({${Object.keys(props).join(",")}}){return (${jsx});}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const Fixture = new Function("require", "exports", `${compiled};return Fixture;`)(require, {});
const html = renderToStaticMarkup(React.createElement(Fixture, props));
const css = await postcss([tailwind()]).process('@import "tailwindcss"; @source "../../src/components/orders/create-order-modal.tsx";', { from: "output/reserve-stock/customer-picker.css" });
writeFileSync("output/reserve-stock/customer-picker.css", css.css + '@font-face{font-family:Noto;src:url(/fonts/NotoSansThai-Regular.ttf);font-weight:400 500}@font-face{font-family:Noto;src:url(/fonts/NotoSansThai-Bold.ttf);font-weight:600 900}body{font-family:Noto,sans-serif}.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{scrollbar-width:none}.action-touch-safe{touch-action:manipulation}');
const script = ts.transpileModule(`
const open=true,customerPickerOpen=true,savedScrollYRef={current:0};
const customerPickerViewportRef={current:document.querySelector('[role="dialog"]')};
const vehicleTabsContainerRef={current:document.querySelector('[role="dialog"] [data-active]').parentElement};
const setSelectedVehicleId=()=>{},setVehicleUnderlineStyle=()=>{};
const handleVehicleSelect=${vehicleHandler};
const cleanups=[${effects.map(effect => `(${effect})()`).join(",")}];
vehicleTabsContainerRef.current.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>handleVehicleSelect('',{currentTarget:button})));
document.querySelector('[aria-label="ปิดหน้าต่างเลือกร้านค้า"]').addEventListener('click',()=>{cleanups.forEach(cleanup=>cleanup?.());customerPickerViewportRef.current.remove();document.querySelector('#closed').hidden=false;});
`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
writeFileSync("output/reserve-stock/customer-picker-check.html", `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ตรวจ modal — ข้อมูลจำลอง</title><link rel="stylesheet" href="/customer-picker.css"><body><p id="closed" hidden>ปิดหน้าต่างแล้ว · ข้อมูลจำลอง ไม่มีการบันทึกออเดอร์</p>${html}<script>${script}</script></body></html>`);
process.stdout.write("Generated actual customer picker markup with 100 mock customers; no database writes.\n");
