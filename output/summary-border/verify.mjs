// Reads live data; intercepts all saves so production records cannot change.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => line.includes("=") && !line.startsWith("#"))
  .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: user, error } = await db.from("app_users").select("id,organization_id").eq("is_active", true).eq("role", "admin").limit(1).single();
if (error) throw new Error(error.message);
const payload = { displayName: "UI verification", organizationId: user.organization_id, userId: user.id,
  role: "admin", sessionId: randomUUID(), expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
const cookie = encoded + "." + createHmac("sha256", env.SESSION_SECRET.trim()).update(encoded).digest("hex");
const origin=process.argv[2]||'http://localhost:3000';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try { const page=await browser.newPage(); await page.setCookie({name:'allnoodles_session',value:cookie,url:origin}); await page.goto(origin+'/orders/packing-list?date=2026-10-09',{waitUntil:'networkidle0'});await page.waitForSelector('.packing-table--combined-summary thead .packing-col');
for(const media of ['screen','print']) {await page.emulateMediaType(media); const borders=await page.$$eval('.packing-table--combined-summary thead .packing-col',cells=>cells.map(cell=>{const s=getComputedStyle(cell);return [s.borderTopWidth,s.borderTopStyle,s.borderTopColor]}));assert.ok(borders.length>1);for(const b of borders)assert.deepEqual(b,['1px','solid','rgb(0, 0, 0)']);console.log('PASS '+media+': '+borders.length+' summary headers have black top border');}
}finally{await browser.close();}
