"use client";

import { Download, Loader2, Share2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  downloadPreparedDeliveryPdf,
  sharePreparedDeliveryPdf,
} from "@/components/print/share-delivery-pdf";

type DeliveryPdfPreviewModalProps = {
  file: File;
  onClose: () => void;
};

export function DeliveryPdfPreviewModal({ file, onClose }: DeliveryPdfPreviewModalProps) {
  const [isSharing, setIsSharing] = useState(false);
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function handleShare() {
    if (isSharing) return;

    setIsSharing(true);
    try {
      await sharePreparedDeliveryPdf(file);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("[delivery/share-pdf]", error);
      window.alert("แชร์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSharing(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[500] bg-[#001038]/40 p-0 text-[#002050] backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:p-6">
      <div className="grid h-[100dvh] w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-white sm:h-[92vh] sm:max-w-[1280px] sm:border sm:border-[#D0A040]/40">
        <div className="flex h-1 w-full">
          <div className="h-full flex-1 bg-[#002050]" />
          <div className="h-full flex-1 bg-[#D0A040]" />
        </div>

        <div className="border-b border-[#D0A040]/30 bg-white px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-[#D0A040]/45 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/512x512.png" alt="All Noodles" className="h-9 w-9 object-contain" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D0A040] sm:text-xs">
                  ALL NOODLES PDF EXPORT
                </p>
                <h3 className="mt-1 truncate text-xl font-black leading-none tracking-[0.01em] text-[#002050] sm:text-2xl">
                  ตัวอย่าง PDF ใบส่งของ
                </h3>
                <p className="mt-1 truncate text-[11px] font-semibold text-[#002050]/60 sm:text-xs">
                  {file.name}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D0A040]/45 bg-white text-[#002050] transition hover:border-[#D0A040] hover:bg-[#D0A040]/10 active:scale-95 sm:hidden"
              aria-label="ปิดตัวอย่าง PDF"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>

          <div className="mt-4 hidden items-center justify-end gap-3 sm:flex">
            <button
              type="button"
              onClick={() => downloadPreparedDeliveryPdf(file)}
              className="inline-flex h-12 items-center gap-2 bg-[#D0A040] px-6 text-sm font-black uppercase tracking-[0.14em] text-[#001038] transition hover:bg-[#C89840] active:scale-[0.98]"
            >
              <Download className="h-4 w-4" strokeWidth={2.6} />
              ดาวน์โหลด
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={isSharing}
              className="inline-flex h-12 items-center gap-2 bg-[#002050] px-6 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#002858] active:scale-[0.98] disabled:opacity-60"
            >
              {isSharing ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
              ) : (
                <Share2 className="h-4 w-4" strokeWidth={2.4} />
              )}
              แชร์ / LINE
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[#D0A040]/45 bg-white text-[#002050] transition hover:border-[#D0A040] hover:bg-[#D0A040]/10 active:scale-95"
              aria-label="ปิดตัวอย่าง PDF"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="min-h-0 bg-[#F6F7FA] p-3 sm:p-5">
          <div className="mx-auto grid h-full w-full max-w-[1120px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border border-[#D0A040]/30 bg-white">
            <div className="flex items-center justify-between border-b border-[#D0A040]/25 bg-white px-3 py-2 sm:px-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-[#D0A040]" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#002050]/75">
                  PDF PREVIEW
                </span>
              </div>
              <span className="hidden text-[10px] font-black uppercase tracking-[0.18em] text-[#002050]/45 sm:inline">
                Download or share after review
              </span>
            </div>
            <iframe
              src={previewUrl}
              title="ตัวอย่าง PDF ใบส่งของ"
              className="h-full min-h-[62dvh] w-full bg-white"
            />
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-[#D0A040]/30 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:hidden">
          <button
            type="button"
            onClick={() => downloadPreparedDeliveryPdf(file)}
            className="inline-flex h-14 items-center justify-center gap-2 bg-[#D0A040] text-sm font-black uppercase tracking-[0.12em] text-[#001038] transition active:scale-95"
          >
            <Download className="h-5 w-5" strokeWidth={2.8} />
            ดาวน์โหลด
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={isSharing}
            className="inline-flex h-14 items-center justify-center gap-2 bg-[#002050] text-sm font-black uppercase tracking-[0.12em] text-white transition active:scale-95 disabled:opacity-60"
          >
            {isSharing ? (
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.6} />
            ) : (
              <Share2 className="h-5 w-5" strokeWidth={2.6} />
            )}
            แชร์ / LINE
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
