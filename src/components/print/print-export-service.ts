"use client";

let cachedFontEmbedCSS: string | null = null;

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod|android/i.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

export function isWebKitOrSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium") && !ua.includes("android");
  const isLine = ua.includes("line");
  return isIOS || isSafari || isLine;
}

/**
 * Returns safe high-resolution pixel ratio.
 * Desktop: 3.0 (approx 300 DPI, razor-sharp vector-grade rasterization).
 * Mobile: 2.5 (approx 240 DPI, crystal clear while respecting iOS WebKit canvas memory limits).
 */
export function getSafePrintPixelRatio(): number {
  return isMobileDevice() ? 2.5 : 3.0;
}

/**
 * Ensures all web fonts are loaded and preloads font embedding CSS.
 */
export async function preloadPrintFonts(sourceDoc?: Document): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  if (cachedFontEmbedCSS) return cachedFontEmbedCSS;

  const doc = sourceDoc || document;

  try {
    await Promise.race([
      doc.fonts?.ready ?? Promise.resolve(),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("Fonts ready timeout")), 2000)),
    ]);
  } catch (e) {
    console.warn("[PrintExportService] Fonts ready check timed out, proceeding anyway:", e);
  }

  try {
    const { getFontEmbedCSS } = await import("html-to-image");
    cachedFontEmbedCSS = await Promise.race([
      getFontEmbedCSS(doc.body || document.body),
      new Promise<string>((_, reject) =>
        window.setTimeout(() => reject(new Error("Font CSS embed timeout")), 2000),
      ),
    ]);
  } catch (e) {
    console.warn("[PrintExportService] Failed to embed web fonts:", e);
  }

  return cachedFontEmbedCSS || undefined;
}

export type CapturePageOptions = {
  pixelRatio?: number;
  width?: number;
  height?: number;
  backgroundColor?: string;
  style?: Partial<CSSStyleDeclaration>;
};

/**
 * Captures an HTML element to high-fidelity PNG data URL with zero JPEG artifacts.
 */
export async function captureElementToPng(
  element: HTMLElement,
  options: CapturePageOptions = {},
): Promise<string> {
  const fontEmbedCSS = await preloadPrintFonts(element.ownerDocument);
  const pixelRatio = options.pixelRatio ?? getSafePrintPixelRatio();
  const width = options.width || element.offsetWidth;
  const height = options.height || element.offsetHeight;

  const [{ toPng }, html2canvas] = await Promise.all([
    import("html-to-image"),
    import("html2canvas").then((mod) => mod.default),
  ]);

  try {
    return await toPng(element, {
      backgroundColor: options.backgroundColor ?? "#ffffff",
      cacheBust: true,
      fontEmbedCSS,
      pixelRatio,
      width,
      height,
      style: options.style as Record<string, string>,
    });
  } catch (primaryErr) {
    console.warn("[PrintExportService] html-to-image failed, falling back to html2canvas:", primaryErr);
    const canvas = await html2canvas(element, {
      width,
      height,
      scale: pixelRatio,
      backgroundColor: options.backgroundColor ?? "#ffffff",
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL("image/png");
  }
}

/**
 * Downloads a Blob or File on the client.
 */
export function downloadFileBlob(blob: Blob | File, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Shares a file on mobile via Web Share API if supported, or falls back to direct download.
 */
export async function shareOrDownloadFile(file: File, title: string): Promise<boolean> {
  if (isMobileDevice() && typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title,
      });
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return false;
      }
      console.warn("[PrintExportService] WebShare failed, falling back to download:", err);
    }
  }

  downloadFileBlob(file, file.name);
  return true;
}

/**
 * Calls server-side headless Chromium to create a True Vector PDF (ISO 32000-2).
 */
export async function createVectorPdfFromUrl(
  url: string,
  fileName: string,
): Promise<File | null> {
  const response = await fetch("/api/delivery-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const errorMsg = (await response.json().catch(() => null))?.error ?? "Failed to create vector PDF.";
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  return new File([blob], fileName, { type: "application/pdf" });
}
