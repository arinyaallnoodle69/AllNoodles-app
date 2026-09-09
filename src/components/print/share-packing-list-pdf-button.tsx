"use client";

import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { DeliveryPdfPreviewModal } from "@/components/print/delivery-pdf-preview-modal";
import {
  createPackingListPdfPreviewFromDocument,
  type PackingListPdfPreview,
} from "@/components/print/share-packing-list-pdf";

type SharePackingListPdfButtonProps = {
  fileName?: string;
  className?: string;
  buttonText?: string;
};

export function SharePackingListPdfButton({
  fileName,
  className,
  buttonText = "ส่งออก PDF",
}: SharePackingListPdfButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<PackingListPdfPreview | null>(null);

  async function handlePreparePdf() {
    if (isSharing) return;

    setIsSharing(true);

    try {
      const pdf = await createPackingListPdfPreviewFromDocument(document, fileName);
      if (pdf) {
        setPreviewPdf(pdf);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      console.error("[packing-list/share-pdf]", error);
      window.alert("สร้างหรือแชร์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handlePreparePdf}
        disabled={isSharing}
        className={
          className ??
          "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
        }
        style={{ fontFamily: 'var(--font-noto-sans-thai), "Noto Sans Thai", sans-serif' }}
      >
        {isSharing ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.3} />
        ) : (
          <FileText className="h-4 w-4 text-rose-600" strokeWidth={2.3} />
        )}
        {isSharing ? "กำลังสร้าง PDF..." : buttonText}
      </button>
      {previewPdf ? (
        <DeliveryPdfPreviewModal
          file={previewPdf.file}
          previewImages={previewPdf.previewImages}
          title="ตัวอย่าง PDF ใบจัดของ"
          onClose={() => setPreviewPdf(null)}
        />
      ) : null}
    </>
  );
}
