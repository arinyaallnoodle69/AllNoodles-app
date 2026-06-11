const DELIVERY_SHEET_WIDTH_MM = 210;
const DELIVERY_SHEET_HEIGHT_MM = 297;

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

function waitForImage(image: HTMLImageElement) {
  if (image.complete) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const done = () => resolve();
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
  });
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
    window.alert("ไม่พบใบส่งของสำหรับสร้าง PDF");
    return null;
  }

  const [{ toCanvas }, { jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);

  await Promise.all([
    document.fonts.ready,
    sourceDocument.fonts?.ready ?? Promise.resolve(),
  ]);
  await waitForDocumentImages(sourceDocument);

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [DELIVERY_SHEET_WIDTH_MM, DELIVERY_SHEET_HEIGHT_MM],
    compress: true,
  });

  for (const [index, page] of pages.entries()) {
    if (index > 0) {
      pdf.addPage([DELIVERY_SHEET_WIDTH_MM, DELIVERY_SHEET_HEIGHT_MM], "portrait");
    }

    const canvas = await toCanvas(page, {
      backgroundColor: "#ffffff",
      cacheBust: true,
      height: page.offsetHeight,
      pixelRatio: 1.7,
      width: page.offsetWidth,
    });
    const imageDataUrl = canvas.toDataURL("image/png");

    pdf.addImage(imageDataUrl, "PNG", 0, 0, DELIVERY_SHEET_WIDTH_MM, DELIVERY_SHEET_HEIGHT_MM);
  }

  const pdfBlob = pdf.output("blob");
  const pdfFileName = buildDeliveryPdfFileName(fileName);
  return new File([pdfBlob], pdfFileName, { type: "application/pdf" });
}

export async function sharePreparedDeliveryPdf(pdfFile: File) {
  if (navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
    await navigator.share({
      files: [pdfFile],
      title: "ใบส่งของ",
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
    "top:-10000px",
    "left:-10000px",
    "width:1200px",
    "height:1700px",
    "border:0",
    "opacity:0",
    "pointer-events:none",
  ].join(";");

  document.body.appendChild(iframe);

  try {
    const loadedDocumentPromise = waitForIframeLoad(iframe);
    iframe.src = url;
    const frameDocument = await loadedDocumentPromise;
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
