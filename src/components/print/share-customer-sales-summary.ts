import type { DeliveryPdfPreview } from "./share-delivery-pdf";

function createCapturePage(report: HTMLElement, sourceDocument: Document) {
  const page = report.cloneNode(true) as HTMLElement;
  page.removeAttribute("data-customer-sales-report");
  page.dataset.customerSalesCapturePage = "true";
  Object.assign(page.style, {
    width: "210mm",
    height: "297mm",
    minHeight: "297mm",
    maxHeight: "297mm",
    margin: "0",
    overflow: "hidden",
    boxShadow: "none",
    transform: "none",
    zoom: "1",
  });
  page.querySelector("tbody")?.replaceChildren();
  sourceDocument.body.appendChild(page);
  return page;
}

export function buildCustomerSalesPages(report: HTMLElement, sourceDocument: Document) {
  const sourceRows = Array.from(
    report.querySelectorAll<HTMLTableRowElement>("tbody tr[data-store-row]"),
  );
  const emptyRow = report.querySelector<HTMLTableRowElement>("tbody tr:not([data-store-row])");
  const host = sourceDocument.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "210mm",
    background: "white",
  });
  sourceDocument.body.appendChild(host);

  const pages: HTMLElement[] = [];
  const makePage = (includeFooter = true) => {
    const page = createCapturePage(report, sourceDocument);
    if (!includeFooter) {
      page.querySelector(".cs-footer")?.remove();
    }
    host.appendChild(page);
    return page;
  };

  if (sourceRows.length === 0) {
    const page = makePage(true);
    if (emptyRow) page.querySelector("tbody")?.appendChild(emptyRow.cloneNode(true));
    return { host, pages: [page] };
  }

  let start = 0;
  while (start < sourceRows.length) {
    // 1. Check if all remaining rows can fit on this page WITH the footer
    const testPage = makePage(true);
    const testBody = testPage.querySelector("tbody")!;
    let canFitAllWithFooter = true;

    for (let i = start; i < sourceRows.length; i++) {
      testBody.appendChild(sourceRows[i].cloneNode(true));
      if (testPage.scrollHeight > testPage.clientHeight + 1) {
        canFitAllWithFooter = false;
        break;
      }
    }

    if (canFitAllWithFooter) {
      pages.push(testPage);
      break;
    }

    // Since they cannot all fit with the footer, discard testPage
    testPage.remove();

    // 2. Build a page WITHOUT footer so we can fill it up with rows
    const page = makePage(false);
    const body = page.querySelector("tbody")!;
    let end = start;

    while (end < sourceRows.length) {
      body.appendChild(sourceRows[end].cloneNode(true));
      if (page.scrollHeight > page.clientHeight + 1) {
        body.lastElementChild?.remove();
        break;
      }
      end += 1;
    }

    if (end === start) {
      body.appendChild(sourceRows[end].cloneNode(true));
      end += 1;
    }

    // If all remaining rows fit without footer, leave at least 1 row for the next page
    // so the final page has rows alongside the summary footer
    if (end === sourceRows.length && end > start + 1) {
      body.lastElementChild?.remove();
      end -= 1;
    }

    pages.push(page);
    start = end;
  }

  return { host, pages };
}

export async function saveCustomerSalesImagesFromDocument(
  sourceDocument: Document,
  title = "รายงานสรุปยอดขายตามลูกค้า",
  fileNameBase = "customer-sales-summary",
) {
  await sourceDocument.fonts.ready;
  const report = sourceDocument.querySelector<HTMLElement>("[data-customer-sales-report]");
  if (!report) throw new Error("ไม่พบรายงานสำหรับบันทึกรูป");

  const { host, pages } = buildCustomerSalesPages(report, sourceDocument);
  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const { toBlob } = await import("html-to-image");
    const files: File[] = [];

    for (const [index, page] of pages.entries()) {
      const blob = await toBlob(page, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width: page.offsetWidth,
        height: page.offsetHeight,
      });
      if (!blob) throw new Error(`สร้างรูปหน้าที่ ${index + 1} ไม่สำเร็จ`);
      files.push(new File([blob], `${fileNameBase}-หน้า${index + 1}.png`, { type: "image/png" }));
    }

    const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isMobile && navigator.canShare?.({ files }) && navigator.share) {
      try {
        await navigator.share({ files, title });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.warn("[CustomerSales:ShareImage]", error);
      }
    }

    files.forEach((file, index) => {
      window.setTimeout(() => {
        const url = URL.createObjectURL(file);
        const link = sourceDocument.createElement("a");
        link.href = url;
        link.download = file.name;
        sourceDocument.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, index * 300);
    });
  } finally {
    host.remove();
  }
}

export async function createCustomerSalesPdfPreviewFromDocument(
  sourceDocument: Document,
  fileNameBase = "customer-sales-summary",
): Promise<DeliveryPdfPreview | null> {
  await sourceDocument.fonts.ready;
  const report = sourceDocument.querySelector<HTMLElement>("[data-customer-sales-report]");
  if (!report) throw new Error("ไม่พบรายงานสำหรับสร้าง PDF");

  const { host, pages } = buildCustomerSalesPages(report, sourceDocument);
  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const [{ toPng }, { jsPDF }] = await Promise.all([
      import("html-to-image"),
      import("jspdf"),
    ]);

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [210, 297],
      compress: true,
    });

    const previewImages: string[] = [];

    for (const [index, page] of pages.entries()) {
      if (index > 0) {
        pdf.addPage([210, 297], "portrait");
      }

      const dataUrl = await toPng(page, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width: page.offsetWidth,
        height: page.offsetHeight,
      });

      previewImages.push(dataUrl);
      pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
    }

    const pdfBlob = pdf.output("blob");
    const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
    const pdfFileName = `${fileNameBase}-${date}.pdf`;
    const file = new File([pdfBlob], pdfFileName, { type: "application/pdf" });

    return { file, previewImages };
  } finally {
    pages.forEach((page) => page.remove());
    host.remove();
  }
}
