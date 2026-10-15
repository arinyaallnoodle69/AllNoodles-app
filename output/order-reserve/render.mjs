import { readFileSync, writeFileSync } from "node:fs";

let script = readFileSync("output/reserve-stock/render-barcode.mjs", "utf8");
script = script.replaceAll("output/reserve-stock/barcode", "output/order-reserve/reserve").replaceAll('href="/barcode.css"', 'href="/reserve.css"');
script = script.replace('const original = readFileSync("src/components/orders/create-order-modal.tsx", "utf8");', `const original = readFileSync("src/components/orders/create-order-modal.tsx", "utf8")
  .replace('const [reserveMode, setReserveMode] = useState(false);', 'const [reserveMode, setReserveMode] = useState(true);')
  .replace('const [reserveStock, setReserveStock] = useState<Record<string, number>>({});', 'const [reserveStock, setReserveStock] = useState<Record<string, number>>({ANP137:50,ANP138:20,ANP139:0});');`);
script = script.replace('"@/app/orders/incoming/actions":', '"@/app/orders/incoming/reserve-stock-actions": { fetchOrderReserveStockAction: async () => [] },\n  "@/app/orders/incoming/actions":');
script = script.replace('setBarcodeMode] = useState(${picker})', 'setBarcodeMode] = useState(false)');
script = script.replace('ตรวจบาร์โค้ด — ข้อมูลจำลอง', 'ตรวจสำรอง — ข้อมูลจำลอง ไม่บันทึกจริง');
writeFileSync("output/order-reserve/generated-render.mjs", script);
await import("./generated-render.mjs");
