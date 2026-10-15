import { BILLING_INVOICE_STYLES, getBillingFontEmbedCSS } from "./billing-statement-layout";
import { createPackingListPdfPreviewFromDocument } from "./share-packing-list-pdf";

export async function exportBillingDocument(root: HTMLElement, mode: "print" | "pdf", fileName: string) {
  const pages = Array.from(root.querySelectorAll<HTMLElement>(".billing-invoice-page"));
  if (!pages.length) throw new Error("ไม่พบใบวางบิลสำหรับส่งออก");
  const frame = document.createElement("iframe");
  frame.title = "เอกสารใบวางบิล";
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0";
  document.body.appendChild(frame);
  let printing = false;
  try {
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) throw new Error("เปิดเอกสารใบวางบิลไม่สำเร็จ");
    doc.title = fileName;
    const style = doc.createElement("style");
    style.textContent = `${BILLING_INVOICE_STYLES}
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { margin: 0; padding: 0; gap: 0; background: white; }
      .billing-invoice-page-shell { border: 0; box-shadow: none; }
    `;
    doc.head.appendChild(style);
    for (const page of pages) {
      const shell = doc.createElement("div");
      shell.className = "billing-invoice-page-shell";
      const clone = page.cloneNode(true) as HTMLElement;
      // The shared report PDF exporter recognizes portrait pages by these classes.
      clone.classList.add("packing-sheet", "vehicle-summary-sheet");
      shell.appendChild(clone);
      doc.body.appendChild(shell);
    }
    await doc.fonts.load('16px "Noto Serif Thai Billing"');
    await doc.fonts.ready;
    if (mode === "pdf") return await createPackingListPdfPreviewFromDocument(doc, fileName, await getBillingFontEmbedCSS());
    const cleanup = () => frame.remove();
    frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
    frame.contentWindow.focus();
    frame.contentWindow.print();
    printing = true;
    window.setTimeout(cleanup, 60000);
    return null;
  } finally {
    if (!printing) frame.remove();
  }
}
