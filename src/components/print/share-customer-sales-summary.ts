const A4_PORTRAIT_WIDTH_MM = 210;
const A4_PORTRAIT_HEIGHT_MM = 297;
const FALLBACK_CAPTURE_WIDTH = 794;
const FALLBACK_CAPTURE_HEIGHT = 1123;

let cachedFontEmbedCSS: string | null = null;

export type CustomerSalesPdfPreview = {
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

export async function preloadCustomerSalesFontEmbedCSS() {
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
    console.warn("[FontPreloader:CustomerSalesPDF] Failed to preload fonts:", e);
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

export function buildCustomerSalesPdfFileName(input: string | undefined) {
  const safe = (input?.trim() || "customer-sales-summary")
    .replace(/[^\w\u0E00-\u0E7F-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  return `${safe || "customer-sales-summary"}-${date}.pdf`;
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
        console.warn("[CustomerSalesPDF] Cannot inline image:", src, error);
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

export async function createCustomerSalesPdfPreviewFromDocument(
  sourceDocument: Document,
  fileName?: string,
): Promise<CustomerSalesPdfPreview | null> {
  const pages = Array.from(
    sourceDocument.querySelectorAll<HTMLElement>("[data-customer-sales-page='true']"),
  );

  if (pages.length === 0) {
    window.alert("ไม่พบหน้ารายงานสำหรับสร้าง PDF");
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
      orientation: "portrait",
      unit: "mm",
      format: [A4_PORTRAIT_WIDTH_MM, A4_PORTRAIT_HEIGHT_MM],
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
        pdf.addPage([A4_PORTRAIT_WIDTH_MM, A4_PORTRAIT_HEIGHT_MM], "portrait");
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
        A4_PORTRAIT_WIDTH_MM,
        A4_PORTRAIT_HEIGHT_MM,
      );

      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    const pdfBlob = pdf.output("blob");
    const pdfFileName = buildCustomerSalesPdfFileName(fileName);
    const file = new File([pdfBlob], pdfFileName, { type: "application/pdf" });
    return { file, previewImages };
  } finally {
    restoreCaptureImages(inlinedImages);
  }
}

export async function saveCustomerSalesImagesFromDocument(
  sourceDocument: Document,
  title = "รายงานสรุปยอดขายตามลูกค้า",
  fileNameBase = "customer-sales-summary",
) {
  const pages = Array.from(
    sourceDocument.querySelectorAll<HTMLElement>("[data-customer-sales-page='true']"),
  );

  if (pages.length === 0) {
    window.alert("ไม่พบหน้ารายงานสำหรับบันทึกรูป");
    return;
  }

  const { toPng } = await import("html-to-image");
  const isMobileDevice =
    typeof window !== "undefined" &&
    /iphone|ipad|ipod|android/i.test(window.navigator.userAgent.toLowerCase());
  const selectedPixelRatio = isMobileDevice ? 2.0 : 2.5;

  const capturedBlobs: { blob: Blob; name: string }[] = [];

  for (const [index, page] of pages.entries()) {
    const datasetWidth = Number(page.dataset.captureWidth ?? "");
    const datasetHeight = Number(page.dataset.captureHeight ?? "");
    const captureWidth = datasetWidth || page.offsetWidth || FALLBACK_CAPTURE_WIDTH;
    const captureHeight = datasetHeight || page.offsetHeight || FALLBACK_CAPTURE_HEIGHT;

    const dataUrl = await toPng(page, {
      backgroundColor: "#ffffff",
      pixelRatio: selectedPixelRatio,
      width: captureWidth,
      height: captureHeight,
      style: {
        width: `${captureWidth}px`,
        height: `${captureHeight}px`,
        maxWidth: "none",
        maxHeight: "none",
        margin: "0",
        boxShadow: "none",
        display: "block",
        transform: "none",
      },
    });

    const parts = dataUrl.split(",");
    const binary = atob(parts[1] ?? "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "image/png" });
    const fileName = `${fileNameBase}-หน้า${index + 1}.png`;
    capturedBlobs.push({ blob, name: fileName });
  }

  const isMobile =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

  const files = capturedBlobs.map(
    (item) => new File([item.blob], item.name, { type: "image/png" }),
  );

  if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({
        files,
        title,
      });
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.warn("[WebShare:CustomerSales]", error);
    }
  }

  // Fallback download
  capturedBlobs.forEach((item, index) => {
    window.setTimeout(() => {
      downloadBlob(item.blob, item.name);
    }, index * 400);
  });
}

if (typeof window !== "undefined") {
  window.setTimeout(() => {
    preloadCustomerSalesFontEmbedCSS().catch(() => undefined);
  }, 1200);
}
