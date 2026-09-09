const PACKING_SHEET_WIDTH_MM = 297;
const PACKING_SHEET_HEIGHT_MM = 210;
const FALLBACK_CAPTURE_WIDTH = 1123;
const FALLBACK_CAPTURE_HEIGHT = 794;

let cachedFontEmbedCSS: string | null = null;

export type PackingListPdfPreview = {
  file: File;
  previewImages: string[];
};

function isWebKitOrSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari =
    ua.includes("safari") &&
    !ua.includes("chrome") &&
    !ua.includes("chromium") &&
    !ua.includes("android");
  const isLine = ua.includes("line");
  return isIOS || isSafari || isLine;
}

export async function preloadPackingListFontEmbedCSS() {
  if (typeof window === "undefined" || cachedFontEmbedCSS) return;
  try {
    const { getFontEmbedCSS } = await import("html-to-image");
    cachedFontEmbedCSS = await Promise.race([
      getFontEmbedCSS(document.body),
      new Promise<string>((_, reject) =>
        window.setTimeout(() => reject(new Error("Font CSS preload timeout")), 2000),
      ),
    ]);
  } catch (e) {
    console.warn("[FontPreloader:PackingListPDF] Failed to preload fonts:", e);
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

export function downloadPreparedPackingListPdf(pdfFile: File) {
  downloadBlob(pdfFile, pdfFile.name);
}

export function buildPackingListPdfFileName(input: string | undefined) {
  const safe = (input?.trim() || "packing-list")
    .replace(/[^\w\u0E00-\u0E7F-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  return `${safe || "packing-list"}-${date}.pdf`;
}

type RestorableImage = {
  image: HTMLImageElement;
  src: string;
  crossOrigin: string | null;
};

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
}

async function inlineCaptureImages(targets: HTMLElement[]): Promise<RestorableImage[]> {
  const images = Array.from(
    new Set(targets.flatMap((target) => Array.from(target.querySelectorAll("img")))),
  );
  const restorable: RestorableImage[] = [];

  await Promise.all(
    images.map(async (image) => {
      const src = image.currentSrc || image.src;
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;

      try {
        const response = await fetch(src, { cache: "force-cache", mode: "cors" });
        if (!response.ok) throw new Error(`โหลดรูปไม่สำเร็จ (${response.status})`);

        const dataUrl = await blobToDataUrl(await response.blob());
        restorable.push({ image, src: image.src, crossOrigin: image.getAttribute("crossorigin") });
        image.removeAttribute("crossorigin");
        image.src = dataUrl;
        await image.decode().catch(() => undefined);
      } catch (error) {
        console.warn("[PackingListPDF] Cannot inline image:", src, error);
      }
    }),
  );

  return restorable;
}

function restoreCaptureImages(images: RestorableImage[]) {
  images.forEach(({ image, src, crossOrigin }) => {
    image.src = src;
    if (crossOrigin === null) image.removeAttribute("crossorigin");
    else image.setAttribute("crossorigin", crossOrigin);
  });
}

export async function createPackingListPdfPreviewFromDocument(
  sourceDocument: Document,
  fileName?: string,
): Promise<PackingListPdfPreview | null> {
  const pages = Array.from(sourceDocument.querySelectorAll<HTMLElement>(".packing-sheet"));

  if (pages.length === 0) {
    window.alert("ไม่พบใบจัดของสำหรับสร้าง PDF");
    return null;
  }

  const [{ toJpeg, getFontEmbedCSS }, { jsPDF }, html2canvas] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
    import("html2canvas").then((mod) => mod.default),
  ]);

  if (!cachedFontEmbedCSS) {
    try {
      cachedFontEmbedCSS = await Promise.race([
        getFontEmbedCSS(sourceDocument.body || document.body),
        new Promise<string>((_, reject) =>
          window.setTimeout(() => reject(new Error("Font CSS embed timeout")), 2000),
        ),
      ]);
    } catch (e) {
      console.warn("Failed to get font embed CSS:", e);
    }
  }

  try {
    await Promise.race([
      Promise.all([
        document.fonts.ready,
        sourceDocument.fonts?.ready ?? Promise.resolve(),
      ]),
      new Promise((_, reject) =>
        window.setTimeout(() => reject(new Error("Fonts ready timeout")), 2000),
      ),
    ]);
  } catch (e) {
    console.warn("Fonts ready timed out, continuing anyway:", e);
  }

  const inlinedImages = await inlineCaptureImages(pages);

  try {
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [PACKING_SHEET_WIDTH_MM, PACKING_SHEET_HEIGHT_MM],
      compress: true,
    });

    const isWebKit = isWebKitOrSafari();
    const isMobileDevice =
      typeof window !== "undefined" &&
      /iphone|ipad|ipod|android/i.test(window.navigator.userAgent.toLowerCase());
    const selectedPixelRatio = isMobileDevice ? 1.5 : 2.0;
    const previewImages: string[] = [];

    for (const [index, page] of pages.entries()) {
      if (index > 0) {
        pdf.addPage([PACKING_SHEET_WIDTH_MM, PACKING_SHEET_HEIGHT_MM], "landscape");
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

      if (isWebKit) {
        try {
          await toJpeg(page, {
            backgroundColor: "#ffffff",
            height: captureHeight,
            pixelRatio: selectedPixelRatio,
            width: captureWidth,
            fontEmbedCSS: cachedFontEmbedCSS || undefined,
            quality: 0.85,
            style: captureStyle,
          });
          await new Promise((resolve) => window.setTimeout(resolve, 80));
        } catch (e) {
          console.warn("Warm-up toJpeg failed:", e);
        }
      }

      let imageDataUrl: string;
      try {
        imageDataUrl = await toJpeg(page, {
          backgroundColor: "#ffffff",
          height: captureHeight,
          pixelRatio: selectedPixelRatio,
          width: captureWidth,
          fontEmbedCSS: cachedFontEmbedCSS || undefined,
          quality: 0.85,
          style: captureStyle,
        });
      } catch (captureErr) {
        console.warn("html-to-image failed, falling back to html2canvas:", captureErr);
        const canvas = await html2canvas(page, {
          width: captureWidth,
          height: captureHeight,
          scale: isMobileDevice ? 1.5 : 2.0,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
        });
        imageDataUrl = canvas.toDataURL("image/jpeg", 0.85);
      }

      previewImages.push(imageDataUrl);
      pdf.addImage(
        imageDataUrl,
        "JPEG",
        0,
        0,
        PACKING_SHEET_WIDTH_MM,
        PACKING_SHEET_HEIGHT_MM,
      );

      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    const pdfBlob = pdf.output("blob");
    const pdfFileName = buildPackingListPdfFileName(fileName);
    const file = new File([pdfBlob], pdfFileName, { type: "application/pdf" });
    return { file, previewImages };
  } finally {
    restoreCaptureImages(inlinedImages);
  }
}

if (typeof window !== "undefined") {
  window.setTimeout(() => {
    preloadPackingListFontEmbedCSS().catch(() => undefined);
  }, 1200);
}
