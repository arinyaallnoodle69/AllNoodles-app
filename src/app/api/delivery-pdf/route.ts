import { existsSync } from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const ALLOWED_PATHS = [
  "/delivery/print",
  "/orders/delivery-notes/preview",
  "/orders/delivery-notes/",
  "/orders/packing-list/preview",
  "/orders/packing-list",
  "/orders/vehicle-product-summary",
  "/orders/factory-order-sheet",
  "/reports/product-sales",
  "/reports/store-sales",
  "/reports/profit-sales",
  "/reports/profit-sales-detailed",
  "/reports/delivery-notes",
];

function localChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((path): path is string => Boolean(path));

  return candidates.find(existsSync);
}

export async function POST(request: NextRequest) {
  let browser;

  try {
    const body = (await request.json()) as { url?: string };
    const rawTargetUrl = new URL(body.url ?? "", request.nextUrl.origin);

    const isSameHost =
      rawTargetUrl.hostname === request.nextUrl.hostname ||
      rawTargetUrl.hostname === "localhost" ||
      rawTargetUrl.hostname === "127.0.0.1";

    const allowed =
      (rawTargetUrl.origin === request.nextUrl.origin || isSameHost) &&
      ALLOWED_PATHS.some((path) => rawTargetUrl.pathname === path || rawTargetUrl.pathname.startsWith(path));

    if (!allowed) {
      return NextResponse.json({ error: "Invalid document URL." }, { status: 400 });
    }

    // Next.js local server on port 3000 runs plain HTTP.
    // If client connects via https (e.g. reverse proxy or tunnel), accessing https://localhost:3000
    // causes net::ERR_SSL_PROTOCOL_ERROR. Force http for localhost/127.0.0.1.
    const targetUrl = new URL(rawTargetUrl.toString());
    if (
      (targetUrl.hostname === "localhost" || targetUrl.hostname === "127.0.0.1") &&
      targetUrl.protocol === "https:"
    ) {
      targetUrl.protocol = "http:";
    }

    const localExecutablePath = localChromePath();
    const executablePath = localExecutablePath ?? await chromium.executablePath();
    const headless = localExecutablePath ? true : "shell";
    const args = await puppeteer.defaultArgs({
      args: localExecutablePath ? ["--ignore-certificate-errors"] : [...chromium.args, "--ignore-certificate-errors"],
      headless,
    });
    browser = await puppeteer.launch({
      args,
      executablePath,
      headless: localExecutablePath ? true : "shell",
    });

    const page = await browser.newPage();
    const cookie = request.headers.get("cookie");
    if (cookie) await page.setExtraHTTPHeaders({ cookie });

    try {
      await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
    } catch (gotoErr) {
      if (
        gotoErr instanceof Error &&
        (gotoErr.message.includes("ERR_SSL_PROTOCOL_ERROR") || gotoErr.message.includes("ERR_CONNECTION_REFUSED"))
      ) {
        // Toggle protocol between http and https as fallback
        targetUrl.protocol = targetUrl.protocol === "https:" ? "http:" : "https:";
        console.warn(`[api/delivery-pdf] Goto failed, retrying with ${targetUrl.protocol}:`, targetUrl.toString());
        await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
      } else {
        throw gotoErr;
      }
    }
    await page.waitForSelector(
      "[data-delivery-note-page='true'], .packing-sheet, [data-print-page='true'], [data-customer-sales-report], #report-print-area, .vehicle-summary-page, .packing-print-container",
      { timeout: 30_000 },
    );
    await page.emulateMediaType("print");
    await page.evaluate(() => document.fonts.ready);

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    console.error("[api/delivery-pdf]", error);
    return NextResponse.json({ error: "สร้าง PDF บิลส่งของไม่สำเร็จ" }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
