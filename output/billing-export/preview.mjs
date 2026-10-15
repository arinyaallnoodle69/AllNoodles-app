import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const require = createRequire(import.meta.url);
const root = process.cwd(), output = resolve(root, "output/billing-export");
const cache = new Map();
const mocks = {
  "react-dom": { createPortal: children => children },
  "next/navigation": { useRouter: () => ({ refresh() {} }) },
  "@/lib/billing/actions": {},
  "./billing-document-export": { exportBillingDocument() { throw new Error("Static fixture"); } },
  "./delivery-pdf-preview-modal": { DeliveryPdfPreviewModal: () => null },
};
function load(path) {
  if (cache.has(path)) return cache.get(path);
  let source = readFileSync(path, "utf8");
  source = source.replace('const [mounted, setMounted] = useState(false);', 'const [mounted, setMounted] = useState(true);').replace('const [isOpen, setIsOpen] = useState(false);', 'const [isOpen, setIsOpen] = useState(true);').replace('const [open, setOpen] = useState(false);', 'const [open, setOpen] = useState(true);').replace('const [scale, setScale] = useState(1);', 'const [scale, setScale] = useState(0.4);');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => {
    if (name in mocks) return mocks[name];
    if (!name.startsWith(".") && !name.startsWith("@/")) return require(name);
    const base = name.startsWith("@/") ? resolve(root, "src", name.slice(2)) : resolve(dirname(path), name);
    return load([base + ".tsx", base + ".ts"].find(existsSync));
  }, loaded, loaded.exports);
  cache.set(path, loaded.exports);
  return loaded.exports;
}
globalThis.document = { body: {} };
const deliveries = [{ number: "DN-TEST-001", date: "2026-10-15", amount: 1500, billingNumber: "BL-TEST-001", isAlreadyBilled: true }];
const props = { customerName: "ร้านทดสอบ เจ๊เอ๋", customerCode: "TEST001", fromDate: "2026-10-01", toDate: "2026-10-15", deliveries, totalAmount: 1500, billingNumber: "BL-TEST-001", billingDate: "2026-10-15" };
const variants = [
  ["single", load(resolve(root, "src/app/billing/billing-preview-button.tsx")).BillingPreviewButton, props],
  ["batch", load(resolve(root, "src/app/billing/batch-billing-preview-button.tsx")).BatchBillingPreviewButton, { organizationId: "fixture", fromDate: props.fromDate, toDate: props.toDate, candidates: [1, 2].map(i => ({ customerId: `test${i}`, customerName: `ร้านทดสอบ ${i}`, customerCode: `TEST00${i}`, deliveries })) }],
  ["history", load(resolve(root, "src/app/billing/history-billing-preview-button.tsx")).HistoryBillingPreviewButton, { history: [1, 2].map(i => ({ id: `record${i}`, billing_number: `BL-TEST-00${i}`, customer_id: `test${i}`, customer_name: `ร้านทดสอบ ${i}`, customer_code: `TEST00${i}`, billing_date: "2026-10-15", created_at: "2026-10-15", from_date: props.fromDate, to_date: props.toDate, total_amount: 1500, snapshot_rows: [{ lineNumber: 1, deliveryNumber: "DN-TEST-001", deliveryDate: "2026-10-15", totalAmount: 1500, notes: null }] })) }],
];
for (const [name, Component, props] of variants) {
  const markup = renderToStaticMarkup(React.createElement(Component, props));
  writeFileSync(resolve(output, `${name}.html`), `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><title>ข้อมูลจำลองใบวางบิล ${name}</title>${markup}</html>`);
}
const css = await postcss([tailwind()]).process('@import "tailwindcss"; @source "../../src/app/billing"; @source "../../src/components/print/billing-document-actions.tsx";', { from: resolve(output, "fixture.css") });
writeFileSync(resolve(output, "fixture.css"), css.css + '@font-face{font-family:Noto;src:url(/fonts/NotoSansThai-Regular.ttf)}body{font-family:Noto,sans-serif;margin:0}');
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname).slice(1);
  const base = path.startsWith("fonts/") ? resolve(root, "public") : output;
  const file = resolve(base, path);
  if (!file.startsWith(base + "/") && !file.startsWith(base + "\\")) { res.writeHead(403).end(); return; }
  try { res.setHeader("Content-Type", ({ ".html": "text/html; charset=utf-8", ".css": "text/css", ".ttf": "font/ttf" })[extname(file)] ?? "application/octet-stream"); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
}).listen(3012, "127.0.0.1", () => process.stdout.write("Static actual-component fixtures with mock billing data at http://127.0.0.1:3012/single.html\n"));
