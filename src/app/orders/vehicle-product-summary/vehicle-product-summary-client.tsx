"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState, useEffect } from "react";
import { Check, ChevronDown, Filter, RotateCcw, Truck, X } from "lucide-react";
import { AutoPrint, PackingListPrintButton } from "@/app/orders/packing-list/preview/print-button";
import { VehicleProductSummaryLayout } from "@/components/print/vehicle-product-summary-layout";
import { SharePackingListPdfButton } from "@/components/print/share-packing-list-pdf-button";
import type { VehicleProductSummaryData } from "@/lib/orders/vehicle-product-summary";
import { fmtDateRangeFileTH } from "@/lib/utils/date";

type VehicleProductSummaryClientProps = {
  summaryData: VehicleProductSummaryData;
  date: string;
  endDate: string;
  autoprint: boolean;
};

type VehicleMeta = {
  key: string;
  id: string | null;
  name: string;
  originalIndex: number;
  itemCount: number;
  totalQty: number;
};

export function VehicleProductSummaryClient({
  summaryData,
  date,
  endDate,
  autoprint,
}: VehicleProductSummaryClientProps) {
  const dropdownId = useId();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Compute stats for all vehicles from summaryData
  const allVehicles: VehicleMeta[] = useMemo(() => {
    return summaryData.vehicles.map((v, vehicleIndex) => {
      let itemCount = 0;
      let totalQty = 0;
      for (const row of summaryData.qty) {
        const q = row[vehicleIndex] ?? 0;
        if (q > 0) {
          itemCount += 1;
          totalQty += q;
        }
      }
      return {
        key: v.id ?? `__unassigned_${vehicleIndex}__`,
        id: v.id,
        name: v.name,
        originalIndex: vehicleIndex,
        itemCount,
        totalQty,
      };
    });
  }, [summaryData]);

  // Active vehicles are those with at least 1 item
  const activeVehicles = useMemo(
    () => allVehicles.filter((v) => v.itemCount > 0),
    [allVehicles],
  );

  // Default to selecting all active vehicles
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (activeVehicles.length > 0) {
      activeVehicles.forEach((v) => initial.add(v.key));
    } else {
      allVehicles.forEach((v) => initial.add(v.key));
    }
    return initial;
  });

  // Close dropdown on outside click or Esc
  useEffect(() => {
    if (!isDropdownOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDropdownOpen]);

  // Filtered summary data according to selected vehicles
  const filteredData = useMemo<VehicleProductSummaryData>(() => {
    const selectedVehiclesMeta = allVehicles.filter((v) => selectedKeys.has(v.key));

    const newVehicles = selectedVehiclesMeta.map((v) => ({
      id: v.id,
      name: v.name,
    }));

    const newQty = summaryData.products.map((_, pIndex) =>
      selectedVehiclesMeta.map((v) => summaryData.qty[pIndex]?.[v.originalIndex] ?? 0),
    );

    return {
      ...summaryData,
      vehicles: newVehicles,
      qty: newQty,
    };
  }, [summaryData, allVehicles, selectedKeys]);

  const selectedActiveCount = activeVehicles.filter((v) => selectedKeys.has(v.key)).length;
  const isAllSelected = activeVehicles.length > 0 && selectedActiveCount === activeVehicles.length;

  function toggleVehicle(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedKeys(new Set(allVehicles.map((v) => v.key)));
  }

  function deselectAll() {
    setSelectedKeys(new Set());
  }

  // Construct dynamic document title and file name for export
  const selectedVehicleList = activeVehicles.filter((v) => selectedKeys.has(v.key));
  const vehicleLabelSuffix =
    selectedVehicleList.length === 1
      ? `_${selectedVehicleList[0].name.replace(/[^\w\u0E00-\u0E7F-]+/g, "-")}`
      : selectedVehicleList.length < activeVehicles.length && selectedVehicleList.length > 0
        ? `_${selectedVehicleList.length}คัน`
        : "";

  const exportFileName = `ใบขึ้นของ${vehicleLabelSuffix}_${fmtDateRangeFileTH(date, endDate)}`;
  const documentTitle =
    selectedVehicleList.length === 1
      ? `ใบขึ้นของ (${selectedVehicleList[0].name})`
      : selectedVehicleList.length < activeVehicles.length && selectedVehicleList.length > 0
        ? `ใบขึ้นของ (${selectedVehicleList.length} คัน)`
        : "ใบขึ้นของ (สรุปตามรถ)";

  const hasData = summaryData.products.length > 0;
  const hasSelectedData = filteredData.vehicles.length > 0 && filteredData.products.length > 0;

  return (
    <>
      {autoprint ? <AutoPrint /> : null}

      <style>{`
        @media screen and (max-width: 767px) {
          .vehicle-summary-toolbar {
            position: sticky !important;
            top: 6px !important;
            left: 0 !important;
            right: 0 !important;
            transform: none !important;
            translate: none !important;
            z-index: 120 !important;
            width: calc(100vw - 12px) !important;
            max-width: calc(100vw - 12px) !important;
            margin: 6px auto 0 !important;
            box-sizing: border-box !important;
            padding: 8px 10px !important;
            border-radius: 14px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 6px !important;
            background: white !important;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
            border: 1px solid rgba(15,23,42,0.08) !important;
          }

          /* Mobile Row 1: Actions on Top */
          .vehicle-summary-toolbar__actions-row {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100% !important;
            gap: 6px !important;
            order: 1 !important;
          }

          .vehicle-summary-toolbar__actions {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            flex: 1 !important;
            min-width: 0 !important;
          }

          .vehicle-summary-toolbar__actions > * {
            flex: 1 !important;
            display: flex !important;
          }

          .vehicle-summary-toolbar__actions button {
            width: 100% !important;
            justify-content: center !important;
            white-space: nowrap !important;
            font-size: 12px !important;
            padding: 6px 8px !important;
          }

          /* Mobile Row 2: Vehicle Filter underneath actions */
          .vehicle-summary-toolbar__filter-row {
            display: flex !important;
            align-items: center !important;
            width: 100% !important;
            order: 2 !important;
          }

          .vehicle-summary-toolbar__filter-row .vehicle-filter-container {
            width: 100% !important;
          }

          .vehicle-summary-toolbar__filter-row .vehicle-filter-trigger {
            width: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 7px 12px !important;
            font-size: 12px !important;
            white-space: nowrap !important;
          }

          .vehicle-summary-page .packing-print-container {
            padding-top: 14px !important;
          }
        }

        @media screen and (min-width: 768px) {
          .vehicle-summary-toolbar {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 12px !important;
            background: white !important;
            padding: 8px 14px !important;
            border-radius: 16px !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1) !important;
            position: fixed !important;
            top: 12px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            z-index: 100 !important;
            border: 1px solid rgba(15,23,42,0.08) !important;
            width: max-content !important;
            max-width: calc(100vw - 24px) !important;
          }

          /* Desktop: Filter/Title on Left, Actions on Right */
          .vehicle-summary-toolbar__filter-row {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            order: 1 !important;
          }

          .vehicle-summary-toolbar__actions-row {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            order: 2 !important;
          }
        }
      `}</style>

      {/* Top Floating Control Bar */}
      <div
        className="no-print vehicle-summary-toolbar"
        style={{ fontFamily: 'var(--font-noto-sans-thai), "Noto Sans Thai", sans-serif' }}
      >
        {/* Actions Row: On mobile it is Row 1 (order-1), on desktop it is on right (order-2) */}
        <div className="vehicle-summary-toolbar__actions-row">
          <div className="vehicle-summary-toolbar__actions">
            <PackingListPrintButton
              unassignedStores={[]}
              dateLabel={summaryData.dateLabel}
              documentTitle={documentTitle}
              printButtonText="พิมพ์ / บันทึกรูป"
            />
            <SharePackingListPdfButton
              fileName={exportFileName}
              previewTitle={`ตัวอย่าง PDF ${documentTitle}`}
            />
          </div>

          <Link
            href={`/orders/incoming?date=${date}${endDate ? `&endDate=${endDate}` : ""}`}
            scroll={false}
            className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] md:text-[13px] font-bold text-rose-600 transition hover:bg-rose-100 active:scale-95"
          >
            กลับ
          </Link>
        </div>

        {/* Filter Row: On mobile it is Row 2 (under actions), on desktop it is on left */}
        <div className="vehicle-summary-toolbar__filter-row">
          <div className="hidden md:flex items-center gap-2 min-w-0">
            <span className="text-[14px] md:text-[15px] font-black text-[#4A148C] whitespace-nowrap">
              สรุปตามรถ
            </span>
            <span className="text-[12px] font-bold text-slate-400">·</span>
            <span className="text-[12px] font-semibold text-slate-500 whitespace-nowrap">
              {summaryData.dateLabel}
            </span>
          </div>

          {/* Vehicle Filter Multi-Select Dropdown */}
          <div className="relative vehicle-filter-container" ref={dropdownRef}>
            <button
              type="button"
              id={dropdownId}
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              aria-expanded={isDropdownOpen}
              className={`vehicle-filter-trigger inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[12px] md:text-[13px] font-bold transition active:scale-95 shadow-sm whitespace-nowrap ${
                selectedKeys.size === 0
                  ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : isAllSelected
                    ? "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-[#4A148C]/40 hover:bg-white"
                    : "border-[#4A148C]/30 bg-[#4A148C]/5 text-[#4A148C] hover:bg-[#4A148C]/10"
              }`}
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap min-w-0">
                <Truck className="h-4 w-4 shrink-0 text-[#4A148C]" strokeWidth={2.4} />
                <span className="whitespace-nowrap">
                  {selectedKeys.size === 0
                    ? "ยังไม่ได้เลือกรถ"
                    : selectedVehicleList.length === 1
                      ? `รถ: ${selectedVehicleList[0].name}`
                      : isAllSelected
                        ? `รถทั้งหมด (${activeVehicles.length} คัน)`
                        : `เลือกรถ (${selectedActiveCount}/${activeVehicles.length} คัน)`}
                </span>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
                  isDropdownOpen ? "rotate-180 text-[#4A148C]" : ""
                }`}
                strokeWidth={2.5}
              />
            </button>

            {/* Dropdown Menu Popover */}
            {isDropdownOpen && (
              <>
                {/* Mobile Backdrop */}
                <div
                  className="fixed inset-0 z-[240] bg-black/20 backdrop-blur-[1px] md:hidden"
                  onClick={() => setIsDropdownOpen(false)}
                />

                <div
                  className="absolute left-0 top-full mt-2 z-[250] w-[calc(100vw-28px)] max-w-[360px] md:w-[340px] rounded-2xl border border-slate-200/90 bg-white p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
                  style={{ fontFamily: 'var(--font-noto-sans-thai), "Noto Sans Thai", sans-serif' }}
                >
                  {/* Dropdown Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 px-1">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-[#4A148C]" />
                      <span className="text-[13px] font-black text-slate-800 leading-normal whitespace-nowrap">เลือกรถที่ต้องการพิมพ์</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(false)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:hidden"
                      aria-label="ปิดเมนู"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Quick Select Actions */}
                  <div className="flex items-center justify-between border border-slate-100 px-3 py-2 bg-slate-50/80 rounded-xl my-2.5 text-[12px] leading-normal">
                    <span className="text-slate-600 font-semibold whitespace-nowrap">
                      เลือกแล้ว {selectedActiveCount} คัน
                    </span>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={selectAll}
                        className="font-bold text-[#4A148C] hover:underline transition active:scale-95 whitespace-nowrap"
                      >
                        เลือกทั้งหมด
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={deselectAll}
                        className="font-bold text-slate-400 hover:text-rose-600 hover:underline transition active:scale-95 whitespace-nowrap"
                      >
                        ล้าง
                      </button>
                    </div>
                  </div>

                  {/* Vehicle Items List */}
                  <div className="max-h-[280px] overflow-y-auto px-0.5 py-1 space-y-1">
                    {allVehicles.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs font-semibold text-slate-400 whitespace-nowrap">
                        ไม่มีข้อมูลรถในวันที่เลือก
                      </p>
                    ) : (
                      allVehicles.map((vehicle) => {
                        const isSelected = selectedKeys.has(vehicle.key);
                        const hasItems = vehicle.itemCount > 0;

                        return (
                          <div
                            key={vehicle.key}
                            onClick={() => toggleVehicle(vehicle.key)}
                            className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition cursor-pointer select-none ${
                              isSelected
                                ? "bg-[#4A148C]/8 text-[#4A148C]"
                                : "hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                                  isSelected
                                    ? "border-[#4A148C] bg-[#4A148C] text-white"
                                    : "border-slate-300 bg-white"
                                }`}
                              >
                                {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                              </div>
                              <span
                                className={`text-[13px] font-bold leading-normal truncate ${
                                  !hasItems ? "text-slate-400 line-through decoration-slate-300" : ""
                                }`}
                              >
                                {vehicle.name}
                              </span>
                            </div>

                            <div className="shrink-0">
                              <span
                                className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold leading-normal whitespace-nowrap ${
                                  hasItems
                                    ? isSelected
                                      ? "bg-[#4A148C]/15 text-[#4A148C]"
                                      : "bg-slate-100 text-slate-600"
                                    : "bg-slate-50 text-slate-300"
                                }`}
                              >
                                {hasItems ? `${vehicle.itemCount} รายการ` : "ไม่มีของ"}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Dropdown Footer */}
                  <div className="border-t border-slate-100 pt-2.5 px-1 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(false)}
                      className="w-full md:w-auto inline-flex items-center justify-center rounded-xl bg-[#4A148C] px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#3b0f70] active:scale-95 whitespace-nowrap leading-normal"
                    >
                      ตกลง
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {!hasData ? (
        <div
          className="vehicle-summary-page"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            paddingTop: "120px",
            fontFamily: 'var(--font-noto-sans-thai), "Noto Sans Thai", sans-serif',
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>
            ไม่มีข้อมูลสินค้าสำหรับการแสดงฟอร์มนี้
          </p>
          <Link
            href={`/orders/incoming?date=${date}${endDate ? `&endDate=${endDate}` : ""}`}
            scroll={false}
            style={{ marginTop: "8px", color: "#4A148C", fontSize: "14px", fontWeight: 700 }}
          >
            กลับหน้ารายการออเดอร์
          </Link>
        </div>
      ) : selectedKeys.size === 0 || !hasSelectedData ? (
        <div
          className="vehicle-summary-page"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            padding: "80px 20px 40px",
            textAlign: "center",
            fontFamily: 'var(--font-noto-sans-thai), "Noto Sans Thai", sans-serif',
          }}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/80 mb-4 shadow-sm">
            <Truck className="h-8 w-8" strokeWidth={2.3} />
          </div>
          <h2 className="text-lg md:text-xl font-black text-slate-800">
            {selectedKeys.size === 0 ? "ยังไม่ได้เลือกรถเพื่อแสดงผล" : "ไม่มีรายการสินค้าสำหรับรถที่เลือก"}
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-500 font-medium">
            {selectedKeys.size === 0
              ? "กรุณาคลิกที่ปุ่มเลือกรถด้านบน เพื่อเลือกคันที่ต้องการดูตัวอย่าง บันทึกรูป หรือส่งออก PDF"
              : "รถที่เลือกไว้ในขณะนี้ไม่มีรายการสินค้าที่จะต้องขึ้นของ กรุณาเลือกรถคันอื่นเพิ่มเติม"}
          </p>
          <button
            type="button"
            onClick={selectAll}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#4A148C] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#3b0f70] active:scale-95 whitespace-nowrap"
          >
            <RotateCcw className="h-4 w-4" />
            เลือกรถทั้งหมด
          </button>
        </div>
      ) : (
        <div className="vehicle-summary-page packing-print-container">
          <VehicleProductSummaryLayout data={filteredData} />
        </div>
      )}
    </>
  );
}
