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
      // Find all page wrappers using data attribute for reliability
      const pageElements = targetElement.querySelectorAll('[data-print-page="true"]');
      const elementsToCapture = pageElements.length > 0 ? Array.from(pageElements) : [targetElement];

      // Configuration for Desktop-like capture
      const CAPTURE_WIDTH = 1200; // Standard desktop-ish width
      
      // Create a temporary off-screen container for the clone
      const captureContainer = document.createElement("div");
      captureContainer.style.position = "fixed";
      captureContainer.style.left = "-9999px";
      captureContainer.style.top = "0";
      captureContainer.style.width = `${CAPTURE_WIDTH}px`;
      captureContainer.style.backgroundColor = "#ffffff";
      captureContainer.style.zIndex = "-100";
      document.body.appendChild(captureContainer);

      for (let i = 0; i < elementsToCapture.length; i++) {
        const sourceElement = elementsToCapture[i] as HTMLElement;
        
        // Clone the element to manipulate it safely
        const clone = sourceElement.cloneNode(true) as HTMLElement;
        
        // Force critical styles on the clone to ensure desktop layout and font rendering
        clone.style.width = `${CAPTURE_WIDTH}px`;
        clone.style.minWidth = `${CAPTURE_WIDTH}px`;
        clone.style.maxWidth = `${CAPTURE_WIDTH}px`;
        clone.style.position = "relative";
        clone.style.left = "0";
        clone.style.backgroundColor = "#ffffff";
        clone.style.color = "#000000";
        clone.style.transform = "none";
        clone.style.display = "block";
        clone.style.padding = "20px"; // Add some padding for safety
        
        // Force font for Thai characters
        clone.style.fontFamily = "'Sarabun', 'Noto Sans Thai', sans-serif";
        
        // Append clone to the off-screen container
        captureContainer.innerHTML = ""; // Clear previous
        captureContainer.appendChild(clone);

        // Ensure all capturing elements are visible in the clone
        const printOnlyElements = clone.querySelectorAll('[class*="printHeader"], [class*="printFooter"]');
        printOnlyElements.forEach((el) => {
          (el as HTMLElement).style.setProperty("display", "block", "important");
          (el as HTMLElement).style.setProperty("visibility", "visible", "important");
          (el as HTMLElement).style.setProperty("opacity", "1", "important");
        });

        // Add capturing class to clone
        clone.classList.add("capturing");

        // Wait for fonts and styles to settle
        await new Promise(r => setTimeout(r, 500));

        // Use toJpeg for better mobile compatibility (less likely to result in blank images)
        const dataUrl = await htmlToImage.toJpeg(clone, {
          quality: 0.95,
          backgroundColor: "#ffffff",
          pixelRatio: 2, // High resolution
          width: CAPTURE_WIDTH,
          style: {
            fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif",
          },
          filter: (node) => {
            if (node instanceof HTMLElement) {
              if (node.tagName === "BUTTON") return false;
              if (node.classList.contains("print:hidden")) return false;
            }
            return true;
          }
        });

        // Trigger download
        const timestamp = new Date().getTime();
        const finalFileName = `${fileName}_${i + 1}_${timestamp}.jpg`;
        
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = finalFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Small delay between downloads
        if (elementsToCapture.length > 1) await new Promise(r => setTimeout(r, 800));
      }

      // Cleanup
      document.body.removeChild(captureContainer);
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
