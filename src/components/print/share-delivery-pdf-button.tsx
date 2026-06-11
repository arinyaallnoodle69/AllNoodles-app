"use client";

import { Loader2, Share2 } from "lucide-react";
import { useState } from "react";
import { DeliveryPdfPreviewModal } from "@/components/print/delivery-pdf-preview-modal";
import { createDeliveryPdfFileFromDocument } from "@/components/print/share-delivery-pdf";

type ShareDeliveryPdfButtonProps = {
  fileName?: string;
};

export function ShareDeliveryPdfButton({
  fileName,
}: ShareDeliveryPdfButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  async function handlePreparePdf() {
    if (isSharing) return;

    setIsSharing(true);

    try {
      const pdfFile = await createDeliveryPdfFileFromDocument(document, fileName);
      setPreviewFile(pdfFile);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      console.error("[delivery/share-pdf]", error);
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
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSharing ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.3} />
        ) : (
          <Share2 className="h-4 w-4" strokeWidth={2.3} />
        )}
        {isSharing ? "กำลังสร้าง PDF..." : "ส่งออก PDF"}
      </button>
      {previewFile ? (
        <DeliveryPdfPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      ) : null}
    </>
  );
}
