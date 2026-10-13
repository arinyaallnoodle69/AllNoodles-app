import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { resolve, extname } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const require = createRequire(import.meta.url);
const root = process.cwd(), output = resolve(root, "output/reserve-stock");
let setup = false, provincial = false;
const images = readdirSync("public/product").filter(name => /\.(png|webp)$/.test(name));
const products = ["เส้นเล็ก 1 โล สั้น มังกรฟ้า", "เส้นใหญ่แผ่น ถัง", "เส้นใหญ่ม้วน กระดาษ", "ผัดไทยมังกร 1 โล สั้น"].map((name, index) => ({ id: `p${index}`, name, sku: `ตัวอย่าง ${index + 1}`, imageUrl: `/product/${images[index]}` }));
const mocks = {
  react: { ...React, useState: initial => React.useState(initial && typeof initial === "object" ? { p0: provincial ? "50" : "100", p1: provincial ? "30" : "80" } : initial) },
  "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
  "next/navigation": { useRouter: () => ({ replace() {}, refresh() {} }) },
  "@/components/settings/settings-shell": { SettingsShell: ({ children }) => children },
  "@/components/settings/product-image-preview": { ProductImagePreview: ({ src, alt }) => React.createElement("img", { src, alt, className: "h-full w-full object-contain" }) },
  "@/components/orders/fresh-reserve-refresh": { FreshReserveRefresh: () => null },
  "@/components/orders/daily-special-order-manager": { DailySpecialOrderManager: () => React.createElement("button", { className: "min-h-12 w-full rounded-xl bg-[#6D28D9] px-5 text-lg font-bold text-white" }, "กรอกรายการพิเศษ") },
  "@/app/orders/fresh-reserve-stock/actions": { initializeReserveStockAction: async () => ({ ok: true }), adjustReserveBalanceAction: async () => ({ ok: true }) },
  "@/lib/auth/authorization": { requireAnyRole: async () => ({ organizationId: "org", userId: "user" }) },
  "@/lib/orders/daily-special-items": { getDailySpecialCatalog: async () => products, getDailySpecialItems: async () => [] },
  "@/lib/orders/manage": { getVehiclesForOrder: async () => [{ id: "bkk", name: "รถกรุงเทพ" }, { id: "province", name: "รถระนอง1" }] },
  "@/lib/supabase/admin": { getSupabaseAdmin: () => ({ from(table) {
    const data = table === "warehouses" ? { id: "wh" } : table === "suppliers" ? { id: "supplier" } : table === "fresh_reserve_stock_groups" ? setup ? [] : [{ id: "group", warehouse_id: "wh", supplier_id: "supplier", start_date: "2026-10-14" }] : table === "product_warehouse_fulfillment_modes" ? products.map(product => ({ product_id: product.id })) : table.endsWith("stock_balances") ? products.map((product, i) => ({ product_id: product.id, available: [100, 80, 0, 15][i], pending: table.startsWith("provincial") ? 0 : i === 0 ? 50 : 0, pending_at: "2026-10-15T00:00:00+07:00" })) : [];
    const query = { select() { return this; }, eq() { return this; }, single() { return this; }, order() { return this; }, limit() { return this; }, then(done) { return Promise.resolve({ data, error: null }).then(done); } };
    return query;
  } }) },
};
function load(path) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => mocks[name] ?? require(name), loaded, loaded.exports);
  return loaded.exports;
}
for (const name of ["reserve-stock-opening-form", "reserve-stock-balance-editor"]) mocks[`@/components/orders/${name}`] = load(`src/components/orders/${name}.tsx`);
const Page = load("src/app/orders/fresh-reserve-stock/page.tsx").default;
const css = await postcss([tailwind()]).process('@import "tailwindcss"; @source "../../src/app/orders/fresh-reserve-stock/page.tsx"; @source "../../src/components/orders/reserve-stock-opening-form.tsx"; @source "../../src/components/orders/reserve-stock-balance-editor.tsx";', { from: resolve(output, "fixture.css") });
writeFileSync(resolve(output, "fixture.css"), css.css + '@font-face{font-family:Noto;src:url(/fonts/NotoSansThai-Regular.ttf);font-weight:400 500}@font-face{font-family:Noto;src:url(/fonts/NotoSansThai-Bold.ttf);font-weight:600 900}body{font-family:Noto,sans-serif;margin:0}');
for (const scope of ["bangkok", "province"]) for (setup of [true, false]) {
  provincial = scope === "province";
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ scope, setup: setup ? "1" : "0" }) }));
  assert.ok(html.includes("ต่างจังหวัด") && html.includes("กรุงเทพ"));
  if (setup) assert.ok(html.includes("grid-cols-2"));
  if (!setup && scope === "province") assert.ok(!html.includes("รอรับเข้า"));
  writeFileSync(resolve(output, `${scope}-${setup ? "setup" : "stock"}.html`), `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><title>ตรวจเลย์เอาต์ — ข้อมูลจำลอง</title><div style="padding:12px 16px;color:#6D28D9;font-size:14px">ตรวจเลย์เอาต์ · ข้อมูลจำลอง · ไม่บันทึกเข้าระบบ</div>${html}</html>`);
}
createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const relative = decodeURIComponent(url.pathname).slice(1);
  const base = /^(product|fonts|brand)\//.test(relative) ? resolve(root, "public") : output;
  const file = resolve(base, relative);
  if (!file.startsWith(base + "/") && !file.startsWith(base + "\\")) { res.writeHead(403).end(); return; }
  try {
    res.setHeader("Content-Type", ({ ".html": "text/html; charset=utf-8", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".ttf": "font/ttf" })[extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
}).listen(3012, "127.0.0.1", () => process.stdout.write("Layout fixtures: http://127.0.0.1:3012/bangkok-setup.html\n"));
