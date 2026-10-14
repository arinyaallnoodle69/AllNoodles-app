import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const require = createRequire(import.meta.url);
const skus = ["ANP137", "ANP138", "ANP139", "ANP140", "ANP146", "ANP115", "ANP229", "ANP119", "ANP136", "ANP088", "ANP087", "ANP052", "ANP054", "ANP109"];
const products = skus.map((sku, index) => ({ id: sku, sku, name: index === 0 ? "ผัดไทมังกร 1 โล สั้น" : `${sku} สินค้าตัวอย่าง`, unit: "กก.", imageUrl: null, brand: "มังกร", categoryIds: ["noodles"], categoryNames: ["เส้นสด"], categorySortOrders: [0], warehouseModes: [{ warehouseId: "wh", mode: "fresh" }], warehouseStocks: [], stockQuantity: 0, baseCostPrice: 20, saleUnits: [{ id: `${sku}-unit`, label: "กก.", baseUnitQuantity: 1, isDefault: true, minOrderQty: 1, stepOrderQty: null }] }));
const cart = [false, true].map(isBarcode => ({ isBarcode, productId: "ANP137", productName: products[0].name, quantity: isBarcode ? 6 : 10, minOrderQty: 1, saleUnitBaseQty: 1, saleUnitId: "ANP137-unit", saleUnitLabel: "กก.", stepOrderQty: null, unitPrice: 100 }));
const mocks = {
  "react-dom": { createPortal: children => children },
  "next/image": { __esModule: true, default: ({ alt, src, className }) => React.createElement("img", { alt, src, className }) },
  "./create-order-context": {},
  "@/lib/products/sale-unit-cost": { getEffectiveSaleUnitCost: () => 20 },
  "@/lib/utils/search": { normalizeSearch: value => value.toLowerCase() },
  "@/lib/auth/client-role": { useClientRole: () => "admin" },
  "@/lib/orders/barcode-packaging": { BARCODE_CUSTOMER_CODE: "ANS109", BARCODE_PRODUCT_SKUS: skus },
  "@/app/orders/incoming/actions": new Proxy({}, { get: () => async () => ({}) }),
  "@/components/ui/thai-date-picker": { ThaiDatePicker: () => React.createElement("input", { value: "14/10/2569", readOnly: true, className: "h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-base" }) },
};
const original = readFileSync("src/components/orders/create-order-modal.tsx", "utf8");
const previousDocument = globalThis.document;
globalThis.document = { body: {} };
try {
  for (const picker of [false, true]) {
    const source = original.replace('const [toolsOpen, setToolsOpen] = useState(false);', `const [toolsOpen, setToolsOpen] = useState(${!picker});`).replace('const [customerId, setCustomerId] = useState("");', 'const [customerId, setCustomerId] = useState("shop");').replace('const [cart, setCart] = useState<CartItem[]>([]);', `const [cart, setCart] = useState<CartItem[]>(${JSON.stringify(cart)});`).replace('const [productModalOpen, setProductModalOpen] = useState(false);', `const [productModalOpen, setProductModalOpen] = useState(${picker});`).replace('const [barcodeMode, setBarcodeMode] = useState(false);', `const [barcodeMode, setBarcodeMode] = useState(${picker});`).replace('const [priceMap, setPriceMap] = useState<Record<string, number>>({});', `const [priceMap, setPriceMap] = useState<Record<string, number>>(${JSON.stringify(Object.fromEntries(skus.map(sku => [sku, 100])))});`);
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loaded = { exports: {} };
    new Function("require", "module", "exports", compiled)(name => mocks[name] ?? require(name), loaded, loaded.exports);
    const html = renderToStaticMarkup(React.createElement(loaded.exports.CreateOrderModal, { open: true, hideTrigger: true, today: "2026-10-14", products, customers: [{ id: "shop", code: "ANS109", name: "ซุปเปอร์ชิพ", defaultWarehouseId: "wh" }], vehicles: [] }));
    const ast = ts.createSourceFile("modal.tsx", original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let positioning = "";
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("positionMenu")) positioning = node.arguments[0].getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    const script = ts.transpileModule(`const toolsOpen=true,toolsMenuRef={current:document.querySelector('[role="menu"]')};(${positioning})();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    writeFileSync(`output/reserve-stock/barcode-${picker ? "picker" : "tools"}.html`, `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ตรวจบาร์โค้ด — ข้อมูลจำลอง</title><link rel="stylesheet" href="/barcode.css">${html}<script>${script}</script></html>`);
  }
} finally { globalThis.document = previousDocument; }
const css = await postcss([tailwind()]).process('@import "tailwindcss"; @source "../../src/components/orders/create-order-modal.tsx";', { from: "output/reserve-stock/barcode.css" });
writeFileSync("output/reserve-stock/barcode.css", css.css + '@font-face{font-family:Noto;src:url(/fonts/NotoSansThai-Regular.ttf);font-weight:400 500}@font-face{font-family:Noto;src:url(/fonts/NotoSansThai-Bold.ttf);font-weight:600 900}body{font-family:Noto,sans-serif}.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{scrollbar-width:none}.action-touch-safe{touch-action:manipulation}');
process.stdout.write("Rendered actual order modal and barcode picker with mock data; no actions submitted.\n");
