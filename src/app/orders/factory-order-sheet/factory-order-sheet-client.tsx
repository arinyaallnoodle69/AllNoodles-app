"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Check, ChevronDown, Filter } from "lucide-react";
import { AutoPrint, PackingListPrintButton } from "@/app/orders/packing-list/preview/print-button";
import { SharePackingListPdfButton } from "@/components/print/share-packing-list-pdf-button";
import { FactoryOrderSheetLayout } from "@/components/print/factory-order-sheet-layout";
import type { VehicleProductSummaryData } from "@/lib/orders/vehicle-product-summary";

type FactoryOption = {
  name: string;
  productCount: number;
  warehouseName?: string;
};

type Props = {
  factorySheets: VehicleProductSummaryData[];
  date: string;
  endDate: string;
  autoprint?: boolean;
};

export function FactoryOrderSheetClient({
  factorySheets,
  date,
  endDate,
  autoprint = false,
}: Props) {
  const [selectedFactories, setSelectedFactories] = useState<string[]>(["__all__"]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const desktopDropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);

  // Extract unique factories that actually have items on that date
  const factoryOptions = useMemo<FactoryOption[]>(() => {
    const map = new Map<string, FactoryOption>();
    for (const sheet of factorySheets) {
      const key = sheet.factoryName || "โรงงานทั่วไป";
      const existing = map.get(key) || {
        name: key,
        productCount: 0,
        warehouseName: sheet.warehouseName,
      };
      existing.productCount += sheet.products.length;
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [factorySheets]);

  const allFactoryNames = useMemo(
    () => factoryOptions.map((f) => f.name),
    [factoryOptions],
  );

  const isAllSelected = useMemo(() => {
    if (factoryOptions.length === 0) return true;
    return (
      selectedFactories.includes("__all__") ||
      (allFactoryNames.length > 0 &&
        allFactoryNames.every((name) => selectedFactories.includes(name)))
    );
  }, [allFactoryNames, factoryOptions.length, selectedFactories]);

  const visibleSheets = useMemo(() => {
    if (isAllSelected) return factorySheets;
    if (selectedFactories.length === 0) return [];
    return factorySheets.filter((sheet) =>
      selectedFactories.includes(sheet.factoryName || "โรงงานทั่วไป"),
    );
  }, [factorySheets, isAllSelected, selectedFactories]);

  // Label strictly in a single line with full factory name
  const selectedLabel = useMemo(() => {
    if (isAllSelected) {
      return factoryOptions.length > 1
        ? `ทุกโรงงาน (${factoryOptions.length} แห่ง)`
        : factoryOptions[0]?.name || "ทุกโรงงาน";
    }
    if (selectedFactories.length === 0) {
      return "เลือกโรงงาน";
    }
    if (selectedFactories.length === 1) {
      return selectedFactories[0];
    }
    return `เลือก ${selectedFactories.length} โรงงาน`;
  }, [factoryOptions, isAllSelected, selectedFactories]);

  const exportFileName = useMemo(() => {
    const datePart = date === endDate ? date : `${date}-to-${endDate}`;
    if (isAllSelected) {
      return `factory-order-sheet-${datePart}-ทุกโรงงาน`;
    }
    if (selectedFactories.length === 1) {
      const safeName = selectedFactories[0].replace(/[^\w\u0E00-\u0E7F-]+/g, "-");
      return `factory-order-sheet-${datePart}-${safeName}`;
    }
    if (selectedFactories.length > 1) {
      return `factory-order-sheet-${datePart}-${selectedFactories.length}โรงงาน`;
    }
    return `factory-order-sheet-${datePart}`;
  }, [date, endDate, isAllSelected, selectedFactories]);

  const firstSheet = factorySheets[0];
  const dateLabel = firstSheet?.dateLabel ?? (date === endDate ? date : `${date} - ${endDate}`);
  const hasData = factorySheets.length > 0;

  // Multi-select toggle handlers
  const handleToggleAll = () => {
    if (isAllSelected) {
      // Uncheck all to let user freely pick 1 or 2 specific factories
      setSelectedFactories([]);
    } else {
      // Select all factories
      setSelectedFactories(["__all__"]);
    }
  };

  const handleToggleFactory = (factoryName: string) => {
    if (isAllSelected) {
      // Currently all are selected; unchecking this factory leaves the remaining factories checked
      const remaining = allFactoryNames.filter((name) => name !== factoryName);
      setSelectedFactories(remaining);
      return;
    }

    const isChecked = selectedFactories.includes(factoryName);
    if (isChecked) {
      const next = selectedFactories.filter((name) => name !== factoryName);
      setSelectedFactories(next);
    } else {
      const next = [...selectedFactories, factoryName];
      if (allFactoryNames.length > 0 && allFactoryNames.every((name) => next.includes(name))) {
        setSelectedFactories(["__all__"]);
      } else {
        setSelectedFactories(next);
      }
    }
  };

  // Click outside to close dropdown smoothly
  useEffect(() => {
    if (!isDropdownOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (
        desktopDropdownRef.current?.contains(target) ||
        mobileDropdownRef.current?.contains(target)
      ) {
        return;
      }
      setIsDropdownOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Clean, modern dropdown list showing ONLY checkbox + factory name (No clutter)
  const renderDropdownMenu = () => (
    <div
      className="bg-white rounded-xl shadow-2xl border border-slate-200/90 p-1.5 flex flex-col max-h-[340px] overflow-y-auto [scrollbar-width:thin]"
      style={{ fontFamily: 'var(--font-noto-sans-thai), "Noto Sans Thai", sans-serif' }}
    >
      {/* Option 1: All Factories Checkbox */}
      <button
        type="button"
        onClick={handleToggleAll}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
      >
        <div
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
            isAllSelected
              ? "border-[#4A148C] bg-[#4A148C] text-white"
              : "border-slate-300 bg-white"
          }`}
        >
          {isAllSelected && <Check className="h-3 w-3 stroke-[3]" />}
        </div>
        <span className="text-xs sm:text-sm font-black text-slate-900 whitespace-nowrap">
          ทุกโรงงาน
        </span>
      </button>

      <div className="my-1 border-t border-slate-100" />

      {/* Factory Options: Checkbox + Full Factory Name in single line */}
      <div className="space-y-0.5">
        {factoryOptions.map((factory) => {
          const isChecked = isAllSelected || selectedFactories.includes(factory.name);
          return (
            <button
              key={factory.name}
              type="button"
              onClick={() => handleToggleFactory(factory.name)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
            >
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                  isChecked
                    ? "border-[#4A148C] bg-[#4A148C] text-white"
                    : "border-slate-300 bg-white"
                }`}
              >
                {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
              <span
                className={`text-xs sm:text-sm whitespace-nowrap ${
                  isChecked ? "font-bold text-slate-900" : "font-medium text-slate-700"
                }`}
              >
                {factory.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Compact Official Footer */}
      <div className="mt-1 pt-1.5 px-2.5 border-t border-slate-100 flex items-center justify-between gap-3 text-[11px] text-slate-500 font-bold">
        <span className="whitespace-nowrap">
          เลือก {isAllSelected ? factoryOptions.length : selectedFactories.length} จาก {factoryOptions.length} โรงงาน
        </span>
        <button
          type="button"
          onClick={() => setIsDropdownOpen(false)}
          className="text-[#4A148C] font-black hover:underline px-1 py-0.5 whitespace-nowrap"
        >
          เสร็จสิ้น
        </button>
      </div>
    </div>
  );

  return (
    <>
      {autoprint ? <AutoPrint /> : null}

      <style>{`
        @media print {
          header, .no-print {
            display: none !important;
          }
          .packing-print-container {
            padding-top: 0 !important;
            margin-top: 0 !important;
          }
        }
        @media screen {
          .vehicle-summary-page.packing-print-container {
            padding-top: 16px !important;
            padding-bottom: 32px !important;
          }
          @media (max-width: 640px) {
            .vehicle-summary-page.packing-print-container {
              padding-top: 14px !important;
              padding-bottom: 32px !important;
              scroll-padding-top: 140px;
            }
          }
        }
      `}</style>

      {/* Modern, Clean, Sticky Top Navigation Bar */}
      <header className="no-print print:hidden sticky top-0 z-50 w-full border-b border-slate-200/90 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 py-2.5 sm:py-3">
          {/* Main Row: Header title, date info & action buttons (Desktop) */}
          <div className="flex items-center justify-between gap-3">
            {/* Left: Back button + Title + Date */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Link
                href={`/orders/incoming?date=${date}${endDate ? `&endDate=${endDate}` : ""}`}
                scroll={false}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-black text-slate-700 transition active:scale-95 shrink-0"
                title="กลับหน้ารายการออเดอร์"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>กลับ</span>
              </Link>

              <div className="h-4 w-px bg-slate-200 shrink-0 hidden sm:block" />

              <div className="min-w-0 flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-[#4A148C] truncate">
                  ใบสั่งของ
                </h1>
                <span className="text-[11px] sm:text-xs font-black px-2.5 py-0.5 rounded-full bg-[#F3E5F5] text-[#4A148C] shrink-0">
                  {dateLabel}
                </span>
                <span className="text-xs font-bold text-slate-400 shrink-0 hidden lg:inline">
                  · {visibleSheets.length} ใบ
                </span>
              </div>
            </div>

            {/* Mobile: Sheet count badge on right */}
            <div className="flex items-center gap-1.5 sm:hidden shrink-0">
              <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {visibleSheets.length} ใบ
              </span>
            </div>

            {/* Desktop Right: Factory Selector + Action Buttons */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              {/* Desktop Factory Dropdown Trigger (Anchored directly under button) */}
              {factoryOptions.length > 1 ? (
                <div ref={desktopDropdownRef} className="relative hidden sm:block">
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#4A148C]/25 bg-[#F3E5F5]/70 hover:bg-[#F3E5F5] px-3.5 py-2 text-xs sm:text-sm font-black text-[#4A148C] transition active:scale-95 shadow-sm"
                    title="คลิกเพื่อเลือกโรงงาน"
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-[#4A148C]" />
                    <span className="whitespace-nowrap font-black">{selectedLabel}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-[#4A148C]/70 transition-transform duration-200 ${
                        isDropdownOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 z-50 min-w-[260px] w-max max-w-[min(480px,90vw)] animate-in fade-in-50 zoom-in-95 duration-150">
                      {renderDropdownMenu()}
                    </div>
                  )}
                </div>
              ) : factoryOptions.length === 1 ? (
                <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs sm:text-sm font-black text-slate-700">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="whitespace-nowrap font-black">{factoryOptions[0]?.name}</span>
                </div>
              ) : null}

              {/* Print and PDF Action Buttons */}
              <PackingListPrintButton
                unassignedStores={[]}
                dateLabel={dateLabel}
                documentTitle={`ใบสั่งของ ${!isAllSelected && selectedFactories.length > 0 ? `(${selectedLabel})` : ""}`}
                printButtonText="พิมพ์ใบสั่งของ"
              />
              <SharePackingListPdfButton
                fileName={exportFileName}
                previewTitle={`ตัวอย่าง PDF ใบสั่งของ (${selectedLabel})`}
                buttonText="แชร์ PDF"
              />
            </div>
          </div>

          {/* Mobile Row 2: Action Buttons (Print & Share PDF) side-by-side */}
          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 sm:hidden">
            <PackingListPrintButton
              unassignedStores={[]}
              dateLabel={dateLabel}
              documentTitle={`ใบสั่งของ ${!isAllSelected && selectedFactories.length > 0 ? `(${selectedLabel})` : ""}`}
              printButtonText="พิมพ์ใบสั่งของ"
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#4A148C] px-3 py-2 text-xs font-bold text-white shadow-sm transition active:scale-95"
            />
            <SharePackingListPdfButton
              fileName={exportFileName}
              previewTitle={`ตัวอย่าง PDF ใบสั่งของ (${selectedLabel})`}
              buttonText="แชร์ PDF"
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-[#4A148C]/25 bg-white px-3 py-2 text-xs font-bold text-[#4A148C] shadow-sm transition hover:bg-[#F3E5F5]/40 active:scale-95"
            />
          </div>

          {/* Mobile Row 3: Full-width Factory Selector Button */}
          {factoryOptions.length > 1 && (
            <div ref={mobileDropdownRef} className="relative mt-2 sm:hidden">
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#4A148C]/25 bg-[#F3E5F5]/60 hover:bg-[#F3E5F5] px-3.5 py-2 text-xs font-black text-[#4A148C] transition active:scale-[0.99] shadow-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-4 w-4 shrink-0 text-[#4A148C]" />
                  <span className="whitespace-nowrap font-black">{selectedLabel}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white text-[#4A148C] border border-[#4A148C]/20 whitespace-nowrap">
                    {visibleSheets.length} ใบ
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-[#4A148C]/70 transition-transform duration-200 ${
                      isDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              {isDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 animate-in fade-in-50 zoom-in-95 duration-150">
                  {renderDropdownMenu()}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Print Sheets Content */}
      {!hasData ? (
        <div
          className="vehicle-summary-page"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            paddingTop: "60px",
            fontFamily: 'var(--font-noto-sans-thai), "Noto Sans Thai", sans-serif',
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>
            ไม่มีรายการสินค้าผลิตสดสำหรับใบสั่งของนี้
          </p>
          <Link
            href={`/orders/incoming?date=${date}${endDate ? `&endDate=${endDate}` : ""}`}
            scroll={false}
            style={{ marginTop: "8px", color: "#4A148C", fontSize: "14px", fontWeight: 700 }}
          >
            กลับหน้ารายการออเดอร์
          </Link>
        </div>
      ) : visibleSheets.length === 0 ? (
        <div
          className="vehicle-summary-page"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            paddingTop: "60px",
            fontFamily: 'var(--font-noto-sans-thai), "Noto Sans Thai", sans-serif',
          }}
        >
          <Filter className="h-12 w-12 text-slate-300" />
          <p style={{ fontSize: "16px", fontWeight: 700, color: "#475569" }}>
            กรุณาเลือกอย่างน้อย 1 โรงงานเพื่อดูใบสั่งของ
          </p>
          <button
            type="button"
            onClick={handleToggleAll}
            className="rounded-xl bg-[#4A148C] px-4 py-2 text-xs sm:text-sm font-bold text-white shadow active:scale-95 transition"
          >
            เลือกทุกโรงงาน
          </button>
        </div>
      ) : (
        <div className="vehicle-summary-page packing-print-container">
          {visibleSheets.map((sheet, index) => (
            <FactoryOrderSheetLayout
              key={`${sheet.factoryName ?? "factory"}-${sheet.warehouseName ?? "wh"}-${index}`}
              data={sheet}
            />
          ))}
        </div>
      )}
    </>
  );
}
