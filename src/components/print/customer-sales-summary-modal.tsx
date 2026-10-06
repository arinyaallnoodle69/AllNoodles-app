"use client";

import { ArrowLeft, Download, FileText, Loader2, Printer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CustomerSalesSummaryLayout,
  type CustomerSalesSummaryData,
} from "@/components/print/customer-sales-summary-layout";
import {
  buildCustomerSalesPages,
  createCustomerSalesPdfPreviewFromDocument,
  saveCustomerSalesImagesFromDocument,
} from "@/components/print/share-customer-sales-summary";
import { DeliveryPdfPreviewModal } from "@/components/print/delivery-pdf-preview-modal";
import type { DeliveryPdfPreview } from "@/components/print/share-delivery-pdf";
import { getCustomerSalesPreviewSize } from "@/components/print/customer-sales-preview-scale";

const A4_WIDTH_MM = 210;

type CustomerSalesSummaryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  initialVehicleId?: string;
  allVehiclesData: CustomerSalesSummaryData;
  vehicleDataList: CustomerSalesSummaryData[];
  showAllVehicles?: boolean;
  modalTitle?: string;
  fileNamePrefix?: string;
};

export function CustomerSalesSummaryModal({
  isOpen,
  onClose,
  onBack,
  initialVehicleId = "__all__",
  allVehiclesData,
  vehicleDataList,
  showAllVehicles = true,
  modalTitle,
  fileNamePrefix,
}: CustomerSalesSummaryModalProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(initialVehicleId);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<DeliveryPdfPreview | null>(null);

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
        const frame = document.createElement("div");
        frame.dataset.customerSalesPreviewFrame = "true";
        const size = getCustomerSalesPreviewSize(
          page.offsetWidth * pageScale,
          page.offsetWidth,
          page.offsetHeight,
        );
        Object.assign(frame.style, {
          width: `${size.width}px`,
          height: `${size.height}px`,
          flex: "0 0 auto",
          overflow: "hidden",
          position: "relative",
        });
        Object.assign(page.style, {
          left: "0",
          position: "absolute",
          top: "0",
          transform: `scale(${size.scale})`,
          transformOrigin: "top left",
          zoom: "1",
        });
        frame.appendChild(page);
        printAreaRef.current?.appendChild(frame);
      });
      host.remove();
      cleanup = () => pages.forEach((page) => page.parentElement?.remove());
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [activeData, isOpen, pageScale]);

  const currentTitle = modalTitle || activeData.reportTitle || "รายงานสรุปยอดขายตามลูกค้า";
  const currentFileNamePrefix = fileNamePrefix || (activeData.reportTitle ? "customer-collection-summary" : "customer-sales-summary");

  if (!isOpen) return null;

  async function handleSaveImage() {
    if (isPrinting || isSavingImage || isSavingPdf) return;
    setIsSavingImage(true);

    try {
      const fileName = `${currentFileNamePrefix}-${activeData.vehicleName || "all"}`;
      await saveCustomerSalesImagesFromDocument(
        document,
        `${currentTitle} - ${activeData.vehicleName}`,
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
    if (isPrinting || isSavingImage || isSavingPdf) return;
    setIsPrinting(true);
    const previousTitle = document.title;
    try {
      await document.fonts.ready;
      document.title = `${currentTitle}-${activeData.vehicleName}-${activeData.dateLabel}`;
      window.print();
    } finally {
      document.title = previousTitle;
      setIsPrinting(false);
    }
  }
  async function handleSavePdf() {
    if (isPrinting || isSavingImage || isSavingPdf) return;
    setIsSavingPdf(true);
    try {
      const preview = await createCustomerSalesPdfPreviewFromDocument(
        document,
        `${currentFileNamePrefix}-${activeData.vehicleName || "all"}`,
      );
      if (preview) setPdfPreview(preview);
    } catch (error) {
      console.error("[CustomerSales:SavePdf]", error);
      window.alert("สร้างไฟล์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSavingPdf(false);
    }
  }
  return createPortal(
    <><div style={{ zIndex: 99999 }} className="customer-sales-modal fixed inset-0 flex flex-col bg-[#0a0c10] subpixel-antialiased animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="no-print sticky top-0 z-50 flex shrink-0 flex-col gap-2.5 border-b border-white/10 bg-[#12151c] px-3 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] sm:px-6 sm:py-3.5">
        <div className="flex w-full items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-[#4A148C] text-white shadow-[0_0_20px_rgba(74,20,140,0.4)]">
              <FileText className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm sm:text-base md:text-lg font-bold text-white leading-tight">
                {currentTitle}
              </h2>
              <p className="truncate text-xs sm:text-sm font-semibold text-slate-300 leading-tight mt-0.5">
                {activeData.dateLabel} · {activeData.stores.length} ร้าน · ฿
                {activeData.totalAmount.toLocaleString("th-TH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label="ย้อนกลับไปแก้ไขร้านค้า"
                className="flex shrink-0 items-center gap-1 rounded-xl border border-purple-400/40 bg-purple-600/30 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-bold text-purple-200 transition hover:bg-purple-600/50 hover:text-white active:scale-95"
              >
                <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>แก้ไข</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting || isSavingImage || isSavingPdf}
              className="hidden items-center gap-1.5 rounded-xl bg-[#4A148C] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#4A148C]/90 active:scale-95 sm:flex"
            >
              <Printer className="h-4 w-4" />
              พิมพ์
            </button>

            <button
              type="button"
              onClick={handleSaveImage}
              disabled={isPrinting || isSavingImage || isSavingPdf}
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
              onClick={handleSavePdf}
              disabled={isPrinting || isSavingImage || isSavingPdf}
              className="hidden items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 sm:flex sm:text-sm"
            >
              {isSavingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 text-rose-400" />
              )}
              {isSavingPdf ? "กำลังสร้าง..." : "บันทึก PDF"}
            </button>

            <button
              type="button"
              onClick={onBack ? onBack : onClose}
              aria-label={onBack ? "ย้อนกลับไปแก้ไขร้านค้า" : "ปิดตัวอย่างรายงาน"}
              className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80 transition hover:bg-rose-500/20 hover:text-rose-400 active:scale-95"
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
            {allVehiclesData.totalLabel ? `${allVehiclesData.totalLabel.replace("ทั้งสิ้น", "").trim()} (${allVehiclesData.stores.length} ร้าน)` : `ยอดขายรวมทุกคัน (${allVehiclesData.stores.length} ร้าน)`}
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
      <div className="no-print border-t border-white/10 bg-[#12151c] p-2.5 pb-safe-offset-2 sm:hidden flex items-center gap-1.5">
        <button
          type="button"
          onClick={handlePrint}
          disabled={isPrinting || isSavingImage || isSavingPdf}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#4A148C] py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-70"
        >
          <Printer className="h-3.5 w-3.5" />
          <span>พิมพ์</span>
        </button>

        <button
          type="button"
          onClick={handleSaveImage}
          disabled={isPrinting || isSavingImage || isSavingPdf}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-70"
        >
          {isSavingImage ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          <span>{isSavingImage ? "บันทึก..." : "บันทึกรูป"}</span>
        </button>

        <button
          type="button"
          onClick={handleSavePdf}
          disabled={isPrinting || isSavingImage || isSavingPdf}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-70"
        >
          {isSavingPdf ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-rose-400" />
          )}
          <span>{isSavingPdf ? "สร้าง..." : "บันทึก PDF"}</span>
        </button>
      </div>

    </div>{pdfPreview ? (
      <DeliveryPdfPreviewModal
        file={pdfPreview.file}
        previewImages={pdfPreview.previewImages}
        title={`ตัวอย่าง PDF ${currentTitle}`}
        onClose={() => setPdfPreview(null)}
      />
    ) : null}</>,
    document.body,
  );
}
