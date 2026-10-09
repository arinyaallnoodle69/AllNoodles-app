// Reads live data; intercepts all saves so production records cannot change.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => line.includes("=") && !line.startsWith("#"))
  .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: user, error } = await db.from("app_users").select("id,organization_id").eq("is_active", true).eq("role", "admin").limit(1).single();
if (error) throw new Error(error.message);
const { data: products, error: productError } = await db.from("products").select("sku,name,metadata")
  .eq("organization_id", user.organization_id).in("sku", ["ANP180", "ANP181", "ANP182"]);
if (productError) throw new Error(productError.message);
const payload = { displayName: "UI verification", organizationId: user.organization_id, userId: user.id,
  role: "admin", sessionId: randomUUID(), expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
const cookie = encoded + "." + createHmac("sha256", env.SESSION_SECRET.trim()).update(encoded).digest("hex");
const origin = process.argv[2] || "http://localhost:3011";
assert.ok(["localhost", "all-noodles.vercel.app"].includes(new URL(origin).hostname), "Use only the known application hosts; all saves are intercepted");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
mkdirSync("output/fresh-reserve", { recursive: true });
try {
  for (const mode of ["desktop", "mobile"]) {
    const page = await browser.newPage();
    await page.setViewport(mode === "desktop" ? { width: 1440, height: 1100 } : { width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.setCookie({ name: "allnoodles_session", value: cookie, url: origin });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", (request) => request.method() === "POST" ? request.abort() : request.continue());
    await page.goto(origin + "/orders/fresh-reserve?date=2026-10-09", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "ปรับยอดสั่งผลิต"));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "ปรับยอดสั่งผลิต").click());
    await page.waitForSelector('[aria-modal="true"]');
    const saveDisabled = () => page.evaluate(() => document.querySelector('[aria-modal="true"] footer button:last-child').disabled);
    assert.equal(await saveDisabled(), true);
    const original = products.find((product) => product.sku === "ANP180").metadata.factory_order_adjustments["2026-10-09"];
    let input;
    for (const field of await page.$$('[aria-label="ANP180 ของสำรอง"]')) {
      if (await field.boundingBox()) { input = field; break; }
    }
    assert.ok(input);
    const enter = async (value) => { await input.focus(); await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await input.type(String(value)); };
    assert.equal(await page.$eval('[aria-label="ANP180 คงเหลือ"]', (element) => element.readOnly), true);
    await enter(original.reserveQuantity - 1);
    assert.equal(await saveDisabled(), true);
    assert.match(await page.$eval('[role="alert"]', (element) => element.textContent), /ไม่ต่ำกว่ายอดเดิม/);
    await enter(original.reserveQuantity + 12);
    assert.equal(await saveDisabled(), false);
    const total = original.adjustedQuantity + 12;
    assert.match(await page.$eval('[aria-modal="true"]', (element) => element.textContent), new RegExp(total + " กก."));
    await page.screenshot({ path: `output/fresh-reserve/${mode}.png` });
    await page.evaluate(() => document.querySelector('[aria-modal="true"] footer button:last-child').click());
    await page.waitForSelector('[role="alert"]');
    assert.match(await page.$eval('[role="alert"]', (element) => element.textContent), /บันทึกไม่สำเร็จ/);
    await page.goto(origin + "/orders/fresh-reserve?date=2099-01-01", { waitUntil: "networkidle0" });
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "ปรับยอดสั่งผลิต").click());
    await page.waitForSelector('[aria-modal="true"]');
    const reserve = (await page.$$('[aria-label="ANP180 ของสำรอง"]'));
    for (const field of reserve) {
      if (await field.boundingBox()) { await field.click({ clickCount: 3 }); await field.type("12"); break; }
    }
    assert.match(await page.$eval('[aria-modal="true"]', (element) => element.textContent), /12/);
    if (mode === "desktop") {
      await page.goto(origin + "/orders/factory-order-sheet?date=2026-10-09", { waitUntil: "networkidle0" });
      for (const product of products) {
        const values = await page.evaluate((name) => [...document.querySelectorAll("section.factory-order-sheet")]
          .filter((section) => section.querySelector(".vehicle-summary-header__brand")?.textContent.includes("คลังกรุงเทพ"))
          .flatMap((section) => [...section.querySelectorAll("tbody tr")].filter((row) => row.querySelector(".vehicle-summary-table__product-name")?.textContent.trim() === name)
            .map((row) => Number(row.querySelector(".vehicle-summary-table__qty-cell").textContent.replace(/,/g, "").trim()))), product.name);
        assert.deepEqual(values, [product.metadata.factory_order_adjustments["2026-10-09"].adjustedQuantity], product.sku + " factory print must match confirmed production");
      }
      console.log("PASS: factory print uses confirmed production for all three products");
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${mode}: confirmed additions, zero-save disabled, failed save visible, initial confirmation, no page errors`);
    await page.close();
  }
} finally { await browser.close(); }
