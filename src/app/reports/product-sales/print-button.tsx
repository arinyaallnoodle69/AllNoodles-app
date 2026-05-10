"use client";
"use client";
import { Printer, Image as ImageIcon } from "lucide-react";
import { useRef, useState } from "react";
import * as htmlToImage from "html-to-image";

export function PrintButton({ targetId = "report-print-area", fileName = "report" }: { targetId?: string; fileName?: string }) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const fallbackTimerRef = useRef<number | null>(null);

  function handlePrint() {
    if (isPrinting || isCapturing) return;

    setIsPrinting(true);
    const done = () => {
      if (fallbackTimerRef.current) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setIsPrinting(false);
      window.removeEventListener("afterprint", done);
    };

    window.addEventListener("afterprint", done, { once: true });
    fallbackTimerRef.current = window.setTimeout(done, 10000);
    window.print();
  }

  async function handleSaveImage() {
    if (isPrinting || isCapturing) return;

    const targetElement = document.getElementById(targetId);
    if (!targetElement) {
      alert("ไม่พบพื้นที่สำหรับบันทึกรูปภาพ");
      return;
    }

    setIsCapturing(true);

    try {
      // Find all page wrappers using data attribute for reliability with CSS Modules
      const pageElements = targetElement.querySelectorAll('[data-print-page="true"]');
      const elementsToCapture = pageElements.length > 0 ? Array.from(pageElements) : [targetElement];

      const originalTargetDisplay = targetElement.style.display;
      targetElement.style.setProperty("display", "block", "important");

      const originalStyles = new Map<Element, string>();

      // Capture each page
      for (let i = 0; i < elementsToCapture.length; i++) {
        const element = elementsToCapture[i] as HTMLElement;
        
        // Temporarily ensure the element and its children are visible
        const printOnlyElements = element.querySelectorAll('[class*="printHeader"], [class*="printFooter"]');
        printOnlyElements.forEach((el) => {
          const htmlEl = el as HTMLElement;
          originalStyles.set(el, htmlEl.style.display);
          htmlEl.style.setProperty("display", "block", "important");
          htmlEl.style.setProperty("visibility", "visible", "important");
          htmlEl.style.setProperty("opacity", "1", "important");
        });

        element.classList.add("capturing");
        
        const dataUrl = await htmlToImage.toPng(element, {
          quality: 1,
          backgroundColor: "#ffffff",
          pixelRatio: 2,
          filter: (node) => {
            if (node instanceof HTMLElement) {
              if (node.tagName === "BUTTON") return false;
              if (node.classList.contains("print:hidden")) return false;
            }
            return true;
          }
        });

        element.classList.remove("capturing");

        // Restore styles for this element
        printOnlyElements.forEach((el) => {
          (el as HTMLElement).style.display = originalStyles.get(el) || "";
        });

        // Trigger download
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `${fileName}_page_${i + 1}_${new Date().getTime()}.png`;
        link.click();
        
        // Small delay between downloads
        if (elementsToCapture.length > 1) await new Promise(r => setTimeout(r, 600));
      }

      targetElement.style.display = originalTargetDisplay;
    } catch (error) {
      console.error("Capture error:", error);
      alert("เกิดข้อผิดพลาดในการบันทึกรูปภาพ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsCapturing(false);
    }
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={handleSaveImage}
        disabled={isPrinting || isCapturing}
        className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-600 transition hover:bg-slate-50 hover:border-slate-300 active:scale-95 disabled:opacity-50"
        title="บันทึกเป็นรูปภาพ"
      >
        <ImageIcon className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
        <span className="hidden text-sm font-bold sm:inline">
          {isCapturing ? "กำลังบันทึก..." : "บันทึกรูป"}
        </span>
      </button>

      <button
        type="button"
        onClick={handlePrint}
        disabled={isPrinting || isCapturing}
        className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#003366] px-3 text-white transition hover:bg-[#002244] active:scale-95 disabled:opacity-50"
        aria-label="พิมพ์รายงาน"
      >
        <Printer className="h-4.5 w-4.5 shrink-0" strokeWidth={2} />
        <span className="hidden text-sm font-bold sm:inline">
          {isPrinting ? "กำลังพิมพ์..." : "พิมพ์"}
        </span>
      </button>
    </div>
  );
}
