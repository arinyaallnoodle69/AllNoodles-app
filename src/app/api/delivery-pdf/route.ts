import { existsSync } from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const ALLOWED_PATHS = [
  "/delivery/print",
  "/orders/delivery-notes/preview",
  "/orders/delivery-notes/",
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
    const targetUrl = new URL(body.url ?? "", request.nextUrl.origin);
    const allowed =
      targetUrl.origin === request.nextUrl.origin &&
      ALLOWED_PATHS.some((path) => targetUrl.pathname === path || targetUrl.pathname.startsWith(path));

    if (!allowed) {
      return NextResponse.json({ error: "Invalid delivery-note URL." }, { status: 400 });
    }

    const localExecutablePath = localChromePath();
    const executablePath = localExecutablePath ?? await chromium.executablePath();
    const headless = localExecutablePath ? true : "shell";
    const args = await puppeteer.defaultArgs({
      args: localExecutablePath ? [] : chromium.args,
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

    await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("[data-delivery-note-page='true']", { timeout: 30_000 });
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
