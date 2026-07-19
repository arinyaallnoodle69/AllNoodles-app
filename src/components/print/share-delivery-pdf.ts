const DELIVERY_SHEET_WIDTH_MM = 210;
const DELIVERY_SHEET_HEIGHT_MM = 297;

let cachedFontEmbedCSS: string | null = null;

function isWebKitOrSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium") && !ua.includes("android");
  const isLine = ua.includes("line");
  return isIOS || isSafari || isLine;
}

export async function preloadDeliveryFontEmbedCSS() {
  if (typeof window === "undefined" || cachedFontEmbedCSS) return;
  try {
    const { getFontEmbedCSS } = await import("html-to-image");
    cachedFontEmbedCSS = await Promise.race([
      getFontEmbedCSS(document.body),
      new Promise<string>((_, reject) =>
        window.setTimeout(() => reject(new Error("Font CSS preload timeout")), 2000)
      ),
    ]);
    console.log("[FontPreloader:DeliveryPDF] Web fonts pre-loaded and cached successfully.");
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

export function downloadPreparedDeliveryPdf(pdfFile: File) {
  downloadBlob(pdfFile, pdfFile.name);
}

export function buildDeliveryPdfFileName(input: string | undefined) {
  const baseName = input?.trim() || "delivery-notes";
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  return `${baseName}-${date}.pdf`;
}

async function waitForImage(image: HTMLImageElement) {
  try {
    // Wait for the browser to fully decode the image (essential for base64 / data URLs in Safari)
    await image.decode();
  } catch {
    // Fallback if decode is not supported or fails
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
      });
    }
  }
}

async function waitForDocumentImages(sourceDocument: Document) {
  const images = Array.from(sourceDocument.images);
  if (images.length === 0) return;
  await Promise.all(images.map((image) => waitForImage(image)));
}

export async function createDeliveryPdfFileFromDocument(sourceDocument: Document, fileName?: string) {
  const pages = Array.from(
    sourceDocument.querySelectorAll<HTMLElement>("[data-delivery-note-page='true']"),
  );

  if (pages.length === 0) {
    window.alert("ไม่พบบิลส่งของสำหรับสร้าง PDF");
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

  // Wait for images to load with a timeout
  try {
    await Promise.race([
      waitForDocumentImages(sourceDocument),
      new Promise((_, reject) =>
        window.setTimeout(() => reject(new Error("Images load timeout")), 2500)
      ),
    ]);
  } catch (e) {
    console.warn("Images load timed out, continuing anyway:", e);
  }

  // Give iOS WebKit a tiny moment to settle and paint fonts/images
  await new Promise((resolve) => window.setTimeout(resolve, 300));

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [DELIVERY_SHEET_WIDTH_MM, DELIVERY_SHEET_HEIGHT_MM],
    compress: true,
  });

  const isWebKit = isWebKitOrSafari();
  const isMobileDevice = typeof window !== "undefined" && /iphone|ipad|ipod|android/i.test(window.navigator.userAgent.toLowerCase());
  const selectedPixelRatio = isMobileDevice ? 1.25 : 1.7;

  for (const [index, page] of pages.entries()) {
    if (index > 0) {
      pdf.addPage([DELIVERY_SHEET_WIDTH_MM, DELIVERY_SHEET_HEIGHT_MM], "portrait");
    }

    // Warm-up call to force WebKit/Safari to decode and cache cloned image elements
    if (isWebKit) {
      try {
        await toJpeg(page, {
          backgroundColor: "#ffffff",
          height: page.offsetHeight,
          pixelRatio: selectedPixelRatio,
          width: page.offsetWidth,
          fontEmbedCSS: cachedFontEmbedCSS || undefined,
          quality: 0.8,
        });
        // Small pause to let Safari process the decoded image caching
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      } catch (e) {
        console.warn("Warm-up toJpeg failed:", e);
      }
    }

    let imageDataUrl: string;
    try {
      imageDataUrl = await toJpeg(page, {
        backgroundColor: "#ffffff",
        height: page.offsetHeight,
        pixelRatio: selectedPixelRatio,
        width: page.offsetWidth,
        fontEmbedCSS: cachedFontEmbedCSS || undefined,
        quality: 0.8,
      });
    } catch (captureErr) {
      console.warn("html-to-image failed, falling back to html2canvas:", captureErr);
      const canvas = await html2canvas(page, {
        width: page.offsetWidth,
        height: page.offsetHeight,
        scale: isMobileDevice ? 1.25 : 1.7,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      imageDataUrl = canvas.toDataURL("image/jpeg", 0.8);
    }

    pdf.addImage(imageDataUrl, "JPEG", 0, 0, DELIVERY_SHEET_WIDTH_MM, DELIVERY_SHEET_HEIGHT_MM);

    // Yield control to the main thread to keep UI responsive between rendering pages
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  const pdfBlob = pdf.output("blob");
  const pdfFileName = buildDeliveryPdfFileName(fileName);
  return new File([pdfBlob], pdfFileName, { type: "application/pdf" });
}

export async function sharePreparedDeliveryPdf(pdfFile: File) {
  if (navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
    await navigator.share({
      files: [pdfFile],
      title: "บิลส่งของ",
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

function waitForIframeLoad(iframe: HTMLIFrameElement) {
  return new Promise<Document>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Timed out while loading delivery PDF preview."));
    }, 45000);

    iframe.onload = () => {
      window.clearTimeout(timeout);
      const frameDocument = iframe.contentDocument;
      if (!frameDocument) {
        reject(new Error("Cannot access delivery PDF preview."));
        return;
      }
      resolve(frameDocument);
    };

    iframe.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Failed to load delivery PDF preview."));
    };
  });
}

export async function createDeliveryPdfFileFromUrl(url: string, fileName?: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "width:1200px",
    "height:1700px",
    "border:0",
    "opacity:0.01",
    "pointer-events:none",
    "z-index:-999",
  ].join(";");

  document.body.appendChild(iframe);

  try {
    const loadedDocumentPromise = waitForIframeLoad(iframe);
    iframe.src = url;
    const frameDocument = await loadedDocumentPromise;
    
    // Add a 1000ms delay to give iOS WebKit time to paint the styles/fonts of the iframe content before capture
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
    
    return await createDeliveryPdfFileFromDocument(frameDocument, fileName);
  } finally {
    iframe.remove();
  }
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

