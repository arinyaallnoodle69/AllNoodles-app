"use client";

import { Download, FileText, Loader2, Printer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CustomerSalesSummaryLayout,
  type CustomerSalesSummaryData,
} from "@/components/print/customer-sales-summary-layout";
import { DeliveryPdfPreviewModal } from "@/components/print/delivery-pdf-preview-modal";
import {
  createCustomerSalesPdfPreviewFromDocument,
  saveCustomerSalesImagesFromDocument,
  type CustomerSalesPdfPreview,
} from "@/components/print/share-customer-sales-summary";

const A4_WIDTH_MM = 210;

type CustomerSalesSummaryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialVehicleId?: string;
  allVehiclesData: CustomerSalesSummaryData;
  vehicleDataList: CustomerSalesSummaryData[];
};

export function CustomerSalesSummaryModal({
  isOpen,
  onClose,
  initialVehicleId = "__all__",
  allVehiclesData,
  vehicleDataList,
}: CustomerSalesSummaryModalProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(initialVehicleId);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<CustomerSalesPdfPreview | null>(null);
  const [pageScale, setPageScale] = useState(1);
  const printAreaRef = useRef<HTMLDivElement | null>(null);
  const previewBodyRef = useRef<HTMLDivElement | null>(null);

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

  if (!isOpen) return null;

  async function handleExportPdf() {
    if (isSharingPdf || isSavingImage) return;
    setIsSharingPdf(true);

    try {
      const fileName = `customer-sales-summary-${activeData.vehicleName || "all"}`;
      const pdf = await createCustomerSalesPdfPreviewFromDocument(document, fileName);
      if (pdf) {
        setPreviewPdf(pdf);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("[CustomerSales:ExportPdf]", error);
      window.alert("สร้าง PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSharingPdf(false);
    }
  }

  async function handleSaveImage() {
    if (isSharingPdf || isSavingImage) return;
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

  function handlePrint() {
    window.print();
  }

  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col bg-[#0a0c10] animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="no-print sticky top-0 z-50 flex shrink-0 flex-col gap-3 border-b border-white/10 bg-[#12151c]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4A148C] text-white shadow-[0_0_20px_rgba(74,20,140,0.4)]">
              <FileText className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-white sm:text-lg">
                รายงานสรุปยอดขายตามลูกค้า (A4)
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
              disabled={isSharingPdf || isSavingImage}
              className="hidden items-center gap-1.5 rounded-xl bg-[#4A148C] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#4A148C]/90 active:scale-95 sm:flex"
            >
              <Printer className="h-4 w-4" />
              พิมพ์
            </button>

            <button
              type="button"
              onClick={handleSaveImage}
              disabled={isSharingPdf || isSavingImage}
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
              onClick={handleExportPdf}
              disabled={isSharingPdf || isSavingImage}
              className="hidden items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 sm:flex sm:text-sm"
            >
              {isSharingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 text-rose-400" />
              )}
              {isSharingPdf ? "กำลังสร้าง PDF..." : "ส่งออก PDF"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/60 transition hover:bg-rose-500/10 hover:text-rose-400 active:scale-95"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Vehicle Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setSelectedVehicleId("__all__")}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              selectedVehicleId === "__all__"
                ? "bg-[#4A148C] text-white ring-1 ring-[#EA80FC]/50"
                : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            ยอดขายรวมทุกคัน ({allVehiclesData.stores.length} ร้าน)
          </button>
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
        className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_center,rgba(74,20,140,0.08)_0%,transparent_70%)] p-4 pb-28 sm:p-12 sm:pb-12 flex flex-col items-center"
      >
        <div ref={printAreaRef} className="mx-auto flex w-full max-w-[210mm] flex-col items-center">
          <CustomerSalesSummaryLayout data={activeData} pageScale={pageScale} />
        </div>
      </div>

      {/* Mobile Footer Sticky Action Bar */}
      <div className="no-print border-t border-white/5 bg-[#12151c]/95 p-3 pb-safe-offset-3 backdrop-blur-xl sm:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={handleSaveImage}
          disabled={isSharingPdf || isSavingImage}
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
          onClick={handleExportPdf}
          disabled={isSharingPdf || isSavingImage}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 py-3 text-sm font-black text-white shadow-sm transition active:scale-95 disabled:opacity-70"
        >
          {isSharingPdf ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 text-rose-400" />
          )}
          {isSharingPdf ? "กำลังสร้าง PDF..." : "ส่งออก PDF"}
        </button>
      </div>

      {/* Embedded PDF Modal when Export PDF is triggered */}
      {previewPdf ? (
        <DeliveryPdfPreviewModal
          file={previewPdf.file}
          previewImages={previewPdf.previewImages}
          title="ตัวอย่าง PDF รายงานสรุปยอดขายตามลูกค้า"
          onClose={() => setPreviewPdf(null)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
