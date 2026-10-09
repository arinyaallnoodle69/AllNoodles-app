// UI smoke check: intercepted saves never change production customer ordering.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => line.includes("=") && !line.startsWith("#"))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: user, error } = await db.from("app_users").select("id,organization_id").eq("is_active", true).eq("role", "admin").limit(1).single();
if (error) throw new Error(error.message);
const payload = { displayName: "UI verification", organizationId: user.organization_id, userId: user.id,
  role: "admin", sessionId: randomUUID(), expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
const cookie = encoded + "." + createHmac("sha256", env.SESSION_SECRET.trim()).update(encoded).digest("hex");
const origin = process.argv[2] || "http://localhost:3010";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync("output/customer-packing-order", { recursive: true });
try {
  for (const mode of ["desktop", "mobile"]) {
    const page = await browser.newPage();
    await page.setViewport(mode === "desktop" ? { width: 1440, height: 1100 } : { width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.setCookie({ name: "allnoodles_session", value: cookie, url: origin });
    const attemptedSaves = [];
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/settings/customers") {
        attemptedSaves.push(request.postData());
        request.abort();
      } else request.continue();
    });
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(origin + "/settings/customers", { waitUntil: "networkidle0" });
    for (const [label, group] of [["รถกรุงเทพ", "default"], ["รถกรุงเทพบะหมี่", "bkk_noodle"]]) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate((label) => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === label)?.click(), label);
      await page.waitForFunction(() => [...document.querySelectorAll('[aria-label^="ลากเพื่อจัดลำดับ"]')].filter((element) => element.getBoundingClientRect().height > 0).length > 1);
      const handles = await page.$$('[aria-label^="ลากเพื่อจัดลำดับ"]');
      const visible = [];
      for (const handle of handles) {
        const box = await handle.boundingBox();
        if (box) visible.push({ handle, box });
      }
      await visible[0].handle.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
      await delay(250);
      for (const item of visible.slice(0, 2)) item.box = await item.handle.boundingBox();
      const before = await visible[0].handle.evaluate((element) => element.getAttribute("aria-label"));
      const [a, b] = visible.slice(0, 2).map(({ box }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }));
      const saveCount = attemptedSaves.length;
      if (mode === "desktop") {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(b.x, b.y, { steps: 15 });
        await page.mouse.up();
      } else {
        const session = await page.createCDPSession();
        await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] });
        await delay(350);
        for (let step = 1; step <= 10; step++) {
          await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x, y: a.y + (b.y - a.y) * step / 10 }] });
          await delay(30);
        }
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await session.detach();
      }
      for (let tries = 0; tries < 30 && attemptedSaves.length === saveCount; tries++) await delay(100);
      assert.equal(attemptedSaves.length, saveCount + 1, `${mode}: ${label} drag must request a save`);
      assert.ok(attemptedSaves.at(-1).includes(group), `${mode}: correct packing-sheet scope sent`);
      await delay(600);
      const restored = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="ลากเพื่อจัดลำดับ"]')]
        .find((element) => element.getBoundingClientRect().height > 0)?.getAttribute("aria-label"));
      assert.equal(restored, before, "Failed save must restore the original order");
      console.log(JSON.stringify({ mode, group, dragSaveScopeVerified: true, failedSaveRestored: true }));
    }
    await page.screenshot({ path: `output/customer-packing-order/${mode}.png`, fullPage: false });
    await page.close();
  }
} finally {
  await browser.close();
}
