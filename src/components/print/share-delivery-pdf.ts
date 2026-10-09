import { validateDeliveryPdfAction } from "@/app/orders/pdf-actions";
import { inlineCaptureImages, restoreCaptureImages } from "@/components/print/print-image-cache";

const DELIVERY_SHEET_WIDTH_MM = 210;
const DELIVERY_SHEET_HEIGHT_MM = 297;
const FALLBACK_CAPTURE_WIDTH = 794;
const FALLBACK_CAPTURE_HEIGHT = 1123;

let cachedFontEmbedCSS: string | null = null;
const exportTokens = new WeakMap<File, string>();

export function getDeliveryPdfExportToken(file: File) {
  return exportTokens.get(file);
}

export async function assertPreparedDeliveryPdfCurrent(file: File) {
  const token = exportTokens.get(file);
  if (!token) return;
  const result = await validateDeliveryPdfAction([token]);
  if (result.error) throw new Error(result.error);
}

export async function assertDeliveryDocumentCurrent(sourceDocument: Document = document) {
  const pages = Array.from(sourceDocument.querySelectorAll<HTMLElement>("[data-delivery-note-page='true']"));
  if (!pages.length) return;
  const tokens = [...new Set(pages.flatMap((page) => JSON.parse(page.dataset.exportTokens || "[]") as string[]))];
  const result = await validateDeliveryPdfAction(tokens);
  if (result.error) throw new Error(result.error);
}

export type DeliveryPdfPreview = {
  file: File;
  previewImages: string[];
};

function isWebKitOrSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium") && !ua.includes("android");
  const isLine = ua.includes("line");
  return isIOS || isSafari || isLine;
}

export async function preloadDeliveryFontEmbedCSS() {
  if (typeof window === "undefined" || (cachedFontEmbedCSS && cachedFontEmbedCSS.includes("Angsana New Delivery Note"))) return;
  const hasDeliveryNote = Boolean(document.querySelector("[data-delivery-note-page='true']"));
  if (!hasDeliveryNote) return;
  try {
    const { getFontEmbedCSS } = await import("html-to-image");
    cachedFontEmbedCSS = await Promise.race([
      getFontEmbedCSS(document.body),
      new Promise<string>((_, reject) =>
        window.setTimeout(() => reject(new Error("Font CSS preload timeout")), 2000)
      ),
    ]);
  } catch (e) {
    console.warn("[FontPreloader:DeliveryPDF] Failed to background-preload fonts:", e);
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPreparedDeliveryPdf(pdfFile: File) {
  await assertPreparedDeliveryPdfCurrent(pdfFile);
  downloadBlob(pdfFile, pdfFile.name);
}

export function buildDeliveryPdfFileName(input: string | undefined) {
  const baseName = (input?.trim() || "บิลจัดส่ง")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/-+/g, "-");
  return `${baseName}.pdf`;
}

export async function createDeliveryPdfPreviewFromDocument(
  sourceDocument: Document,
  fileName?: string,
  pageSelector = "[data-delivery-note-page='true']",
): Promise<DeliveryPdfPreview | null> {
  if (pageSelector === "[data-delivery-note-page='true']" && sourceDocument.querySelector(pageSelector)) {
    return createDeliveryPdfPreviewFromUrl(sourceDocument.location?.href || window.location.href, fileName);
  }
  const pages = Array.from(
    sourceDocument.querySelectorAll<HTMLElement>(pageSelector),
  );

  if (pages.length === 0) {
    window.alert("ไม่พบบิลส่งของสำหรับสร้าง PDF");
    return null;
  }

  const [{ toPng, getFontEmbedCSS }, { jsPDF }, html2canvas] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
    import("html2canvas").then((mod) => mod.default),
  ]);

  if (!cachedFontEmbedCSS || !cachedFontEmbedCSS.includes("Angsana New Delivery Note")) {
    try {
      cachedFontEmbedCSS = await Promise.race([
        getFontEmbedCSS(sourceDocument.body || document.body),
        new Promise<string>((_, reject) =>
          window.setTimeout(() => reject(new Error("Font CSS embed timeout")), 2000)
        ),
      ]);
    } catch (e) {
      console.warn("Failed to get font embed CSS:", e);
    }
  }

  // Wait for fonts to be ready with a timeout
  try {
    await Promise.race([
      Promise.all([
        document.fonts.ready,
        sourceDocument.fonts?.ready ?? Promise.resolve(),
      ]),
      new Promise((_, reject) =>
        window.setTimeout(() => reject(new Error("Fonts ready timeout")), 2000)
      ),
    ]);
  } catch (e) {
    console.warn("Fonts ready timed out, continuing anyway:", e);
  }

  const inlinedImages = await inlineCaptureImages(pages);

  try {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [DELIVERY_SHEET_WIDTH_MM, DELIVERY_SHEET_HEIGHT_MM],
      compress: true,
    });

    const isWebKit = isWebKitOrSafari();
    const isMobileDevice =
      typeof window !== "undefined" &&
      /iphone|ipad|ipod|android/i.test(window.navigator.userAgent.toLowerCase());
    // Safe High-DPI: Mobile 2.5x, Desktop 3.0x
    const selectedPixelRatio = isMobileDevice ? 2.5 : 3.0;
    const previewImages: string[] = [];

    for (const [index, page] of pages.entries()) {
      if (index > 0) {
        pdf.addPage([DELIVERY_SHEET_WIDTH_MM, DELIVERY_SHEET_HEIGHT_MM], "portrait");
      }

      const datasetWidth = Number(page.dataset.captureWidth ?? "");
      const datasetHeight = Number(page.dataset.captureHeight ?? "");
      const captureWidth = datasetWidth || page.offsetWidth || FALLBACK_CAPTURE_WIDTH;
      const captureHeight = datasetHeight || page.offsetHeight || FALLBACK_CAPTURE_HEIGHT;

      const captureStyle = {
        width: `${captureWidth}px`,
        height: `${captureHeight}px`,
        maxWidth: "none",
        maxHeight: "none",
        margin: "0",
        boxShadow: "none",
        display: "block",
        transform: "none",
        transformOrigin: "top left",
      };

      // Warm-up call to force WebKit/Safari to decode and cache cloned image elements
      if (isWebKit) {
        try {
          await toPng(page, {
            backgroundColor: "#ffffff",
            height: captureHeight,
            pixelRatio: selectedPixelRatio,
            width: captureWidth,
            fontEmbedCSS: cachedFontEmbedCSS || undefined,
            style: captureStyle,
          });
          await new Promise((resolve) => window.setTimeout(resolve, 80));
        } catch (e) {
          console.warn("Warm-up toPng failed:", e);
        }
      }

      let imageDataUrl: string;
      try {
        imageDataUrl = await toPng(page, {
          backgroundColor: "#ffffff",
          height: captureHeight,
          pixelRatio: selectedPixelRatio,
          width: captureWidth,
          fontEmbedCSS: cachedFontEmbedCSS || undefined,
          style: captureStyle,
        });
      } catch (captureErr) {
        console.warn("html-to-image failed, falling back to html2canvas:", captureErr);
        const canvas = await html2canvas(page, {
          width: captureWidth,
          height: captureHeight,
          scale: selectedPixelRatio,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
        });
        imageDataUrl = canvas.toDataURL("image/png");
      }

      previewImages.push(imageDataUrl);
      pdf.addImage(
        imageDataUrl,
        "PNG",
        0,
        0,
        DELIVERY_SHEET_WIDTH_MM,
        DELIVERY_SHEET_HEIGHT_MM,
        undefined,
        "FAST",
      );

      // Yield control to the main thread to keep UI responsive between rendering pages
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    const pdfBlob = pdf.output("blob");
    const pdfFileName = buildDeliveryPdfFileName(fileName);
    const file = new File([pdfBlob], pdfFileName, { type: "application/pdf" });
    return { file, previewImages };
  } finally {
    restoreCaptureImages(inlinedImages);
  }
}

export async function createDeliveryPdfFileFromDocument(sourceDocument: Document, fileName?: string) {
  const result = await createDeliveryPdfPreviewFromDocument(sourceDocument, fileName);
  return result?.file ?? null;
}

export async function sharePreparedDeliveryPdf(pdfFile: File, title = "บิลส่งของ") {
  await assertPreparedDeliveryPdfCurrent(pdfFile);
  if (navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
    await navigator.share({
      files: [pdfFile],
      title,
    });
    return;
  }

  downloadBlob(pdfFile, pdfFile.name);
}

export async function shareDeliveryPdfFromDocument(sourceDocument: Document, fileName?: string) {
  const pdfFile = await createDeliveryPdfFileFromDocument(sourceDocument, fileName);
  if (!pdfFile) return;
  await sharePreparedDeliveryPdf(pdfFile);
}

export async function createDeliveryPdfPreviewFromUrl(
  url: string,
  fileName?: string,
  sourceDocument?: Document,
): Promise<DeliveryPdfPreview | null> {
  const doc = sourceDocument || (typeof document !== "undefined" ? document : null);
  const pathname = new URL(url, window.location.origin).pathname;
  const isDeliveryBill = pathname === "/delivery/print" || pathname.startsWith("/orders/delivery-notes/");
  try {
    const response = await fetch("/api/delivery-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new Error(failure.error || "สร้าง PDF ไม่สำเร็จ กรุณาลองใหม่");
    }
    const token = response.headers.get("X-Delivery-Export-Token");
    if (isDeliveryBill && !token) throw new Error("บิลยังไม่ผ่านการตรวจสอบ กรุณาโหลดข้อมูลใหม่");
    const blob = await response.blob();
    if (blob.size <= 500) throw new Error("ไฟล์ PDF ไม่สมบูรณ์ กรุณาลองใหม่");
    const file = new File([blob], buildDeliveryPdfFileName(fileName), { type: "application/pdf" });
    if (token) exportTokens.set(file, token);
    return { file, previewImages: [] };
  } catch (error) {
    // Delivery bills must never fall back to a previously loaded document.
    if (isDeliveryBill) throw error;
    if (doc?.querySelector("[data-delivery-note-page='true']")) {
      return createDeliveryPdfPreviewFromDocument(doc, fileName, "[data-print-page='true']");
    }
    throw error;
  }
}

export async function createDeliveryPdfFileFromUrl(url: string, fileName?: string) {
  const result = await createDeliveryPdfPreviewFromUrl(url, fileName);
  return result?.file ?? null;
}

export async function shareDeliveryPdfFromUrl(url: string, fileName?: string) {
  const pdfFile = await createDeliveryPdfFileFromUrl(url, fileName);
  if (!pdfFile) return;
  await sharePreparedDeliveryPdf(pdfFile);
}

if (typeof window !== "undefined") {
  // Preload web fonts in the background to make PDF generation instant
  window.setTimeout(() => {
    preloadDeliveryFontEmbedCSS().catch((e) => {
      console.warn("[FontPreloader] Failed to background-preload fonts:", e);
    });
  }, 1200);
}
