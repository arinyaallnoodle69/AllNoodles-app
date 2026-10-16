// Isolated UI probe: real hook + real Realtime, simulated orders only.
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = resolve("output/order-entry");
const compile = path => ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
writeFileSync(`${root}/hook.cjs`, compile("src/components/orders/use-order-entry.ts"));
writeFileSync(`${root}/browser.cjs`, compile("src/lib/supabase/browser.ts"));
writeFileSync(`${root}/entry.cjs`, `const React=require('react');const{createRoot}=require('react-dom/client');const{useOrderEntry}=require('./hook.cjs');function App(){const[open,setOpen]=React.useState(true);const entry=useOrderEntry(open,'2026-10-16');const[shop,setShop]=React.useState(false);const[n,setN]=React.useState('20');return React.createElement('main',null,
React.createElement('h1',null,'ทดสอบสองเครื่อง · ไม่บันทึกออเดอร์จริง'),
React.createElement('button',{onClick:()=>{setOpen(!open);setShop(false);}},open?'ปิดฟอร์ม':'เปิดฟอร์ม'),
open&&React.createElement(React.Fragment,null,
React.createElement('p',null,(entry.counts?.shop??0)>0?'สั่งแล้ววันนี้':'ยังไม่ได้สั่ง'),
React.createElement('p',null,entry.locks.some(l=>!l.owned)?'อีกเครื่องกำลังกรอก':'ไม่มีเครื่องอื่นกำลังกรอก'),
React.createElement('button',{disabled:entry.busy||entry.locks.some(l=>!l.owned),onClick:async()=>{if(await entry.select('shop','2026-10-16'))setShop(true);}},'เลือกร้านทดสอบ'),
shop&&React.createElement('label',null,'จำนวน ',React.createElement('input',{value:n,onChange:e=>setN(e.target.value)})),
React.createElement('p',null,entry.error??(entry.ready?'พร้อมบันทึก':'ยังไม่มีสิทธิ์บันทึก')),
React.createElement('button',{disabled:!entry.ready,onClick:async()=>{entry.saving.current=true;try{const r=await fetch('/fixture/save',{method:'POST',body:JSON.stringify({token:entry.token.current})});if(!r.ok)throw Error('Lease rejected');entry.release();setShop(false);}finally{entry.saving.current=false;}}},'บันทึกข้อมูลทดสอบ'),
React.createElement('button',{onClick:()=>fetch('/fixture/expire',{method:'POST'})},'จำลองสิทธิ์หมดอายุ')));};createRoot(document.getElementById('app')).render(React.createElement(App));`);
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
await new Promise((done, fail) => webpack({ mode: "development", target: "web", entry: `${root}/entry.cjs`, output: { path: root, filename: "bundle.js" }, resolve: { alias: { "@/lib/supabase/browser": `${root}/browser.cjs` } }, plugins: [new webpack.DefinePlugin({ "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL), "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) })] }, (error, stats) => error || stats.hasErrors() ? fail(error ?? stats.toString({ all: false, errors: true })) : done()));
const topic = `entry-probe:${randomUUID()}`;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let lease = null, count = 0;
async function broadcast() { const channel = admin.channel(topic); try { await channel.httpSend("changed", {}); } finally { await admin.removeChannel(channel); } }
createServer(async (req, res) => {
  try {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "application/javascript"); return res.end(readFileSync(`${root}/bundle.js`)); }
    if (!req.url.startsWith("/api/") && !req.url.startsWith("/fixture/")) { res.setHeader("Content-Type", "text/html; charset=utf-8"); return res.end('<!doctype html><meta name="viewport" content="width=device-width"><style>body{font:18px sans-serif;color:#28134a;max-width:500px;margin:24px}button,input{font:inherit;padding:12px;margin:8px 0;display:block}button{background:#eee2ff;border:1px solid #7428c7;border-radius:10px}button:disabled{opacity:.4}</style><div id="app"></div><script src="/bundle.js"></script>'); }
    let body = ""; for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
    if (lease?.expiresAt <= Date.now()) lease = null;
    let granted = false;
    if (data.action === "acquire" && (!lease || lease.token === data.token)) { lease = { token: data.token, expiresAt: Date.now() + 90000 }; granted = true; }
    if (data.action === "renew" && lease?.token === data.token) { lease.expiresAt = Date.now() + 90000; granted = true; }
    if (data.action === "release" && lease?.token === data.token) lease = null;
    if (req.url === "/fixture/expire") lease = null;
    if (req.url === "/fixture/save") { if (lease?.token !== data.token) { res.statusCode = 409; return res.end('{}'); } count++; lease = null; }
    const state = { granted, orderedCount: count, counts: { shop: count }, locks: lease ? [{ customerId: "shop", displayName: "ผู้ทดสอบ", expiresAt: new Date(lease.expiresAt).toISOString(), owned: lease.token === data.token }] : [], topic };
    if (["acquire", "release"].includes(data.action) || req.url.startsWith("/fixture/")) await broadcast();
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(state));
  } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })); }
}).listen(3027, "127.0.0.1", () => console.log("Order entry probe ready at http://127.0.0.1:3027; simulated data only"));
