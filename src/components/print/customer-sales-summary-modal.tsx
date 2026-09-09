"use client";

import { Download, FileText, Loader2, Printer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CustomerSalesSummaryLayout,
  type CustomerSalesSummaryData,
} from "@/components/print/customer-sales-summary-layout";
import {
  buildCustomerSalesPages,
  saveCustomerSalesImagesFromDocument,
} from "@/components/print/share-customer-sales-summary";

const A4_WIDTH_MM = 210;

type CustomerSalesSummaryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialVehicleId?: string;
  allVehiclesData: CustomerSalesSummaryData;
  vehicleDataList: CustomerSalesSummaryData[];
  showAllVehicles?: boolean;
};

export function CustomerSalesSummaryModal({
  isOpen,
  onClose,
  initialVehicleId = "__all__",
  allVehiclesData,
  vehicleDataList,
  showAllVehicles = true,
}: CustomerSalesSummaryModalProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(initialVehicleId);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);

  const [pageScale, setPageScale] = useState(1);
  const printAreaRef = useRef<HTMLDivElement | null>(null);
  const previewBodyRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedVehicleId(initialVehicleId);
    }
  }, [isOpen, initialVehicleId]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !previewBodyRef.current) return;

    const updateScale = () => {
      const container = previewBodyRef.current;
      if (!container) return;

      const dummy = document.createElement("div");
      dummy.style.width = `${A4_WIDTH_MM}mm`;
      dummy.style.position = "absolute";
      dummy.style.visibility = "hidden";
      document.body.appendChild(dummy);
      const sheetWidth = dummy.offsetWidth;
      document.body.removeChild(dummy);

      const availableWidth = container.clientWidth - 24;
      setPageScale(availableWidth > 0 && sheetWidth > availableWidth ? availableWidth / sheetWidth : 1);
    };

    const timer = setTimeout(updateScale, 100);
    window.addEventListener("resize", updateScale);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateScale);
    };
  }, [isOpen, selectedVehicleId]);

  const activeData: CustomerSalesSummaryData = useMemo(() => {
    if (selectedVehicleId === "__all__") {
      return allVehiclesData;
    }
    const found = vehicleDataList.find((v) => v.vehicleId === selectedVehicleId);
    return found || allVehiclesData;
  }, [selectedVehicleId, allVehiclesData, vehicleDataList]);

  useEffect(() => {
    if (!isOpen || !sourceRef.current || !printAreaRef.current) return;
    const source = sourceRef.current.querySelector<HTMLElement>("[data-customer-sales-report]");
    if (!source) return;

    let cancelled = false;
    let cleanup = () => {};
    void document.fonts.ready.then(() => {
      if (cancelled || !printAreaRef.current) return;
      const { host, pages } = buildCustomerSalesPages(source, document);
      pages.forEach((page) => {
        page.style.zoom = String(pageScale);
        printAreaRef.current?.appendChild(page);
      });
      host.remove();
      cleanup = () => pages.forEach((page) => page.remove());
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [activeData, isOpen, pageScale]);

  if (!isOpen) return null;

  async function handleSaveImage() {
    if (isPrinting || isSavingImage) return;
    setIsSavingImage(true);

    try {
      const fileName = `customer-sales-summary-${activeData.vehicleName || "all"}`;
      await saveCustomerSalesImagesFromDocument(
        document,
        `รายงานสรุปยอดขายตามลูกค้า - ${activeData.vehicleName}`,
        fileName,
      );
    } catch (error) {
      console.error("[CustomerSales:SaveImage]", error);
      window.alert("บันทึกรูปภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSavingImage(false);
    }
  }

  async function handlePrint() {
    if (isPrinting || isSavingImage) return;
    setIsPrinting(true);
    const previousTitle = document.title;
    try {
      await document.fonts.ready;
      document.title = `สรุปยอดขาย-${activeData.vehicleName}-${activeData.dateLabel}`;
      window.print();
    } finally {
      document.title = previousTitle;
      setIsPrinting(false);
    }
  }
  return createPortal(
    <div className="customer-sales-modal fixed inset-0 z-[500] flex flex-col bg-[#0a0c10] animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="no-print sticky top-0 z-50 flex shrink-0 flex-col gap-3 border-b border-white/10 bg-[#12151c]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4A148C] text-white shadow-[0_0_20px_rgba(74,20,140,0.4)]">
              <FileText className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-white sm:text-lg">
                รายงานสรุปยอดขายตามลูกค้า
              </h2>
              <p className="truncate text-xs font-semibold text-slate-400">
                {activeData.dateLabel} · รวม {activeData.stores.length} ร้านค้า · ฿
                {activeData.totalAmount.toLocaleString("th-TH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting || isSavingImage}
              className="hidden items-center gap-1.5 rounded-xl bg-[#4A148C] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#4A148C]/90 active:scale-95 sm:flex"
            >
              <Printer className="h-4 w-4" />
              พิมพ์
            </button>

            <button
              type="button"
              onClick={handleSaveImage}
              disabled={isPrinting || isSavingImage}
              className="hidden items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 sm:flex sm:text-sm"
            >
              {isSavingImage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isSavingImage ? "กำลังบันทึก..." : "บันทึกรูป"}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting || isSavingImage}
              className="hidden items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 sm:flex sm:text-sm"
            >
              {isPrinting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 text-rose-400" />
              )}
              {isPrinting ? "กำลังเปิด..." : "บันทึก PDF"}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดตัวอย่างรายงาน"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/60 transition hover:bg-rose-500/10 hover:text-rose-400 active:scale-95"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Vehicle Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {showAllVehicles ? <button
            type="button"
            onClick={() => setSelectedVehicleId("__all__")}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              selectedVehicleId === "__all__"
                ? "bg-[#4A148C] text-white ring-1 ring-[#EA80FC]/50"
                : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            ยอดขายรวมทุกคัน ({allVehiclesData.stores.length} ร้าน)
          </button> : null}
          {vehicleDataList.map((v) => (
            <button
              key={v.vehicleId}
              type="button"
              onClick={() => setSelectedVehicleId(v.vehicleId)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                selectedVehicleId === v.vehicleId
                  ? "bg-[#4A148C] text-white ring-1 ring-[#EA80FC]/50"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {v.vehicleName} ({v.stores.length} ร้าน)
            </button>
          ))}
        </div>
      </div>

      {/* Main Preview Canvas */}
      <div
        ref={previewBodyRef}
        className="customer-sales-preview-body min-h-0 flex-1 overflow-y-auto bg-slate-950 p-3 sm:p-6 flex flex-col items-center"
      >
        <div ref={printAreaRef} className="customer-sales-print-area mx-auto flex w-full max-w-[210mm] flex-col items-center gap-3 sm:gap-6" />
        <div ref={sourceRef} className="customer-sales-source fixed left-[-10000px] top-0" aria-hidden="true">
          <CustomerSalesSummaryLayout key={selectedVehicleId} data={activeData} />
        </div>
      </div>

      {/* Mobile Footer Sticky Action Bar */}
      <div className="no-print border-t border-white/5 bg-[#12151c]/95 p-3 pb-safe-offset-3 backdrop-blur-xl sm:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={handleSaveImage}
          disabled={isPrinting || isSavingImage}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-black text-white shadow-sm transition active:scale-95 disabled:opacity-70"
        >
          {isSavingImage ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {isSavingImage ? "กำลังบันทึก..." : "บันทึกรูป"}
        </button>

        <button
          type="button"
          onClick={handlePrint}
          disabled={isPrinting || isSavingImage}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 py-3 text-sm font-black text-white shadow-sm transition active:scale-95 disabled:opacity-70"
        >
          {isPrinting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 text-rose-400" />
          )}
          {isPrinting ? "กำลังเปิด..." : "บันทึก PDF"}
        </button>
      </div>

    </div>,
    document.body,
  );
}
