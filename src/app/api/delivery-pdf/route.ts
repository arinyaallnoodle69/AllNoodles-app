import { existsSync } from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth/session";
import { createDeliveryExportToken, validateDeliveryExportToken } from "@/lib/delivery/export-consistency";

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
    const session = await getAppSession();
    if (!session) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
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
    const isDeliveryBill = rawTargetUrl.pathname === "/delivery/print" || rawTargetUrl.pathname.startsWith("/orders/delivery-notes/");

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
      { timeout: 30_000, visible: true },
    );
    await page.emulateMediaType("print");
    await page.evaluate(() => document.fonts.ready);

    const tokens = isDeliveryBill ? await page.evaluate(() => Array.from(new Set(
      Array.from(document.querySelectorAll<HTMLElement>("[data-delivery-note-page='true']"))
        .flatMap((element) => JSON.parse(element.dataset.exportTokens || "[]") as string[]),
    ))) : [];
    if (isDeliveryBill && tokens.length === 0) {
      return NextResponse.json({ error: "ไม่พบบิลที่ผ่านการตรวจสอบ กรุณาโหลดข้อมูลใหม่" }, { status: 409 });
    }
    if (isDeliveryBill) {
      for (const token of tokens) await validateDeliveryExportToken(token, session.organizationId);
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    const versions = [];
    for (const token of tokens) {
      try {
        versions.push(...await validateDeliveryExportToken(token, session.organizationId));
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "ออเดอร์เปลี่ยนแล้ว กรุณาสร้าง PDF ใหม่" }, { status: 409 });
      }
    }

    const exportToken = isDeliveryBill ? createDeliveryExportToken(session.organizationId, versions, pdf) : null;
    if (exportToken && exportToken.length > 7000) {
      return NextResponse.json({ error: "ชุดบิลใหญ่เกินไป กรุณาแบ่งสร้าง PDF เป็นชุดเล็กลง" }, { status: 413 });
    }
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/pdf",
        ...(exportToken ? { "X-Delivery-Export-Token": exportToken } : {}),
      },
    });
  } catch (error) {
    console.error("[api/delivery-pdf]", error);
    return NextResponse.json({ error: "สร้าง PDF บิลส่งของไม่สำเร็จ" }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
