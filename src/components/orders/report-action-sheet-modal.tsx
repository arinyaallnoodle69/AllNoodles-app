"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Banknote, ChevronRight, FileText, X } from "lucide-react";

type ReportActionSheetModalProps = {
  isOpen: boolean;
  onClose: () => void;
  targetVehicleName?: string;
  dateLabel: string;
  onSelectSalesReport: () => void;
  onSelectCollectionReport: () => void;
};

export function ReportActionSheetModal({
  isOpen,
  onClose,
  targetVehicleName,
  dateLabel,
  onSelectSalesReport,
  onSelectCollectionReport,
}: ReportActionSheetModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-action-sheet-title"
      style={{ zIndex: 99999 }}
      className="fixed inset-0 flex items-end justify-center bg-slate-900/60 p-0 transition-opacity sm:items-center sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-md flex-col rounded-t-2xl border-t border-slate-200 bg-white p-5 font-[family:var(--font-noto-sans-thai)] font-sans subpixel-antialiased sm:rounded-2xl sm:border sm:p-6 sm:shadow-[0_8px_30px_rgb(0_0_0/0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Indicator */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div>
            <h3 id="report-action-sheet-title" className="text-base font-bold text-slate-900 sm:text-lg">
              เลือกประเภทรายงาน A4
            </h3>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-600 font-medium">
              วันที่ {dateLabel}
              {targetVehicleName && targetVehicleName !== "ทุกสายรถ" ? (
                <span className="ml-1.5 inline-flex items-center rounded-md bg-[#4A148C]/10 px-2 py-0.5 text-xs font-bold text-[#4A148C]">
                  {targetVehicleName}
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดเมนู"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 active:scale-95 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Options List */}
        <div className="mt-3.5 flex flex-col gap-2.5">
          {/* Option 1: สรุปยอดขาย (ทั้งหมด) */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectSalesReport();
            }}
            className="group flex w-full items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-[#4A148C]/40 hover:bg-purple-50/40 active:scale-[0.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-[#4A148C] transition group-hover:bg-[#4A148C] group-hover:text-white">
              <FileText className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-bold text-slate-900">
                  รายงานสรุปยอดขายตามลูกค้า
                </span>
              </div>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-600 font-medium">
                สรุปยอดขายรวมทุกลูกค้าตามออเดอร์ทั้งหมด
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-[#4A148C] group-hover:translate-x-0.5 transition" />
          </button>

          {/* Option 2: สรุปยอดเก็บเงิน (เลือกร้านค้า) */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onSelectCollectionReport();
            }}
            className="group flex w-full items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-[#4A148C]/40 hover:bg-purple-50/40 active:scale-[0.99]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-[#4A148C] transition group-hover:bg-[#4A148C] group-hover:text-white">
              <Banknote className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-bold text-slate-900">
                  รายงานสรุปยอดเก็บเงินตามสายรถ
                </span>
                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-bold text-[#4A148C]">
                  เลือกร้านได้
                </span>
              </div>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-600 font-medium">
                เลือกเฉพาะร้านค้าที่ต้องเก็บเงินปลายทาง
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-[#4A148C] group-hover:translate-x-0.5 transition" />
          </button>
        </div>

        {/* Cancel Button */}
        <div className="mt-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-100 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-200 active:scale-[0.99] transition"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
