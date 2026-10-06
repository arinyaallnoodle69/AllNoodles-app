"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Banknote,
  Check,
  CheckSquare,
  FileText,
  Search,
  Square,
  Truck,
  X,
} from "lucide-react";
import type { CustomerSalesSummaryData, CustomerSalesSummaryStore } from "@/components/print/customer-sales-summary-layout";
import type { VehicleSalesSummaryItem } from "./vehicle-sales-summary";

type VehicleCashCollectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialVehicleId?: string;
  vehicles: VehicleSalesSummaryItem[];
  dateLabel: string;
  printedAt: string;
  selectedStoresByVehicle: Record<string, Set<string>>;
  setSelectedStoresByVehicle: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
  onConfirm: (
    allVehiclesData: CustomerSalesSummaryData,
    vehicleDataList: CustomerSalesSummaryData[],
    initialVehicleId: string,
  ) => void;
};

function formatAmount(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function VehicleCashCollectionModal({
  isOpen,
  onClose,
  initialVehicleId = "__all__",
  vehicles,
  dateLabel,
  printedAt,
  selectedStoresByVehicle,
  setSelectedStoresByVehicle,
  onConfirm,
}: VehicleCashCollectionModalProps) {
  const [activeVehicleId, setActiveVehicleId] = useState<string>(() => {
    if (initialVehicleId !== "__all__" && vehicles.some((v) => v.id === initialVehicleId)) {
      return initialVehicleId;
    }
    return vehicles[0]?.id || "__all__";
  });

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Current active vehicle
  const currentVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === activeVehicleId) || vehicles[0];
  }, [vehicles, activeVehicleId]);

  // Stores in current vehicle
  const currentStores = useMemo(() => currentVehicle?.stores || [], [currentVehicle]);

  // Filtered stores by search
  const filteredStores = useMemo(() => {
    if (!searchQuery.trim()) return currentStores;
    const q = searchQuery.toLowerCase().trim();
    return currentStores.filter(
      (s) =>
        s.customerName.toLowerCase().includes(q) ||
        s.customerCode.toLowerCase().includes(q),
    );
  }, [currentStores, searchQuery]);

  // Selected store codes for current vehicle
  const currentSelectedCodes = useMemo(() => {
    const set = selectedStoresByVehicle[currentVehicle?.id || ""];
    if (set) return set;
    return new Set(currentStores.map((s) => s.customerCode));
  }, [selectedStoresByVehicle, currentVehicle, currentStores]);

  // Toggle single store
  const handleToggleStore = (code: string) => {
    if (!currentVehicle) return;
    setSelectedStoresByVehicle((prev) => {
      const currentSet = new Set(prev[currentVehicle.id] || currentVehicle.stores.map((s) => s.customerCode));
      if (currentSet.has(code)) {
        currentSet.delete(code);
      } else {
        currentSet.add(code);
      }
      return {
        ...prev,
        [currentVehicle.id]: currentSet,
      };
    });
  };

  // Select all for current vehicle
  const handleSelectAll = () => {
    if (!currentVehicle) return;
    setSelectedStoresByVehicle((prev) => ({
      ...prev,
      [currentVehicle.id]: new Set(currentVehicle.stores.map((s) => s.customerCode)),
    }));
  };

  // Deselect all for current vehicle
  const handleDeselectAll = () => {
    if (!currentVehicle) return;
    setSelectedStoresByVehicle((prev) => ({
      ...prev,
      [currentVehicle.id]: new Set(),
    }));
  };

  // Current vehicle selected totals
  const currentSelectedStores = useMemo(
    () => currentStores.filter((s) => currentSelectedCodes.has(s.customerCode)),
    [currentStores, currentSelectedCodes],
  );
  const currentSelectedAmount = useMemo(
    () => currentSelectedStores.reduce((sum, s) => sum + s.totalAmount, 0),
    [currentSelectedStores],
  );

  // Confirm and generate data for preview
  const handleConfirm = () => {
    const reportTitle = "รายงานสรุปยอดเก็บเงินตามสายรถ";
    const tableHeaderAmount = "ยอดเก็บเงิน (บาท)";
    const totalLabel = "ยอดเก็บเงินรวมทั้งสิ้น";

    const vehicleDataList: CustomerSalesSummaryData[] = vehicles.map((v) => {
      const selectedSet = selectedStoresByVehicle[v.id] || new Set(v.stores.map((s) => s.customerCode));
      const filtered = v.stores.filter((s) => selectedSet.has(s.customerCode));
      const amount = filtered.reduce((acc, s) => acc + s.totalAmount, 0);
      const orders = filtered.reduce((acc, s) => acc + (s.orderCount || 1), 0);
      return {
        vehicleId: v.id,
        vehicleName: v.name,
        dateLabel,
        printedAt,
        stores: filtered,
        totalAmount: amount,
        totalWeightGrams: v.weightGrams,
        totalOrders: orders,
        reportTitle,
        tableHeaderAmount,
        totalLabel,
      };
    });

    // Combined all stores
    const allFilteredStoresMap = new Map<string, CustomerSalesSummaryStore>();
    for (const v of vehicles) {
      const selectedSet = selectedStoresByVehicle[v.id] || new Set(v.stores.map((s) => s.customerCode));
      for (const store of v.stores) {
        if (selectedSet.has(store.customerCode)) {
          const existing = allFilteredStoresMap.get(store.customerCode);
          if (existing) {
            existing.totalAmount += store.totalAmount;
            existing.orderCount = (existing.orderCount || 1) + (store.orderCount || 1);
          } else {
            allFilteredStoresMap.set(store.customerCode, { ...store });
          }
        }
      }
    }

    const combinedStores = Array.from(allFilteredStoresMap.values()).sort(
      (a, b) => a.customerCode.localeCompare(b.customerCode, "th") || a.customerName.localeCompare(b.customerName, "th"),
    );
    const combinedAmount = combinedStores.reduce((acc, s) => acc + s.totalAmount, 0);
    const combinedOrders = combinedStores.reduce((acc, s) => acc + (s.orderCount || 1), 0);

    const allVehiclesData: CustomerSalesSummaryData = {
      vehicleId: "__all__",
      vehicleName: "ทุกสายรถ",
      dateLabel,
      printedAt,
      stores: combinedStores,
      totalAmount: combinedAmount,
      totalOrders: combinedOrders,
      reportTitle,
      tableHeaderAmount,
      totalLabel,
    };

    onConfirm(allVehiclesData, vehicleDataList, activeVehicleId);
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cash-collection-modal-title"
      style={{ zIndex: 99999 }}
      className="fixed inset-0 flex flex-col justify-end bg-slate-900/60 p-0 transition-opacity duration-150 sm:items-center sm:justify-center sm:p-4 animate-in fade-in"
    >
      <div
        className="relative flex h-full w-full max-w-2xl flex-col bg-white text-slate-900 subpixel-antialiased font-[family:var(--font-noto-sans-thai)] font-sans sm:h-[88vh] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-[0_8px_30px_rgb(0_0_0/0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3.5 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4A148C] text-white shadow-sm">
              <Banknote className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div>
              <h2 id="cash-collection-modal-title" className="text-base font-bold text-slate-900 sm:text-xl leading-tight">
                เลือกร้านค้าที่ต้องเก็บเงิน
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm font-medium text-slate-600">
                วันที่ {dateLabel} · ปลดติ๊กร้านที่ลูกค้าโอนเงินแล้ว
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 active:scale-95 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Vehicle Selection Tabs (Horizontal Scroll) */}
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {vehicles.map((v) => {
              const selectedSet = selectedStoresByVehicle[v.id] || new Set(v.stores.map((s) => s.customerCode));
              const selectedCount = selectedSet.size;
              const totalCount = v.stores.length;
              const isActive = activeVehicleId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setActiveVehicleId(v.id);
                    setSearchQuery("");
                  }}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition active:scale-95 ${
                    isActive
                      ? "bg-[#4A148C] text-white shadow-sm"
                      : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  <Truck className="h-4 w-4 shrink-0" />
                  <span>{v.name}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {selectedCount}/{totalCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Filter & Select Toolbar */}
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหารหัสร้าน หรือชื่อลูกค้า..."
                className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-8 text-sm sm:text-base font-normal text-slate-900 placeholder:text-slate-400 focus:border-[#4A148C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#4A148C]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {/* Quick Actions */}
            <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleSelectAll}
                className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs sm:text-sm font-bold text-[#4A148C] hover:bg-purple-100 active:scale-95 transition"
              >
                <CheckSquare className="h-4 w-4" />
                เลือกทั้งหมด
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 active:scale-95 transition"
              >
                <Square className="h-4 w-4" />
                ปลดทั้งหมด
              </button>
            </div>
          </div>
        </div>

        {/* Store Checklist Area */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3.5 sm:p-5 [scrollbar-width:thin]">
          {filteredStores.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <p className="text-sm sm:text-base font-semibold text-slate-600">
                {searchQuery ? "ไม่พบร้านค้าที่ตรงกับคำค้นหา" : "ไม่มีร้านค้าในสายรถนี้"}
              </p>
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="mt-2 text-sm font-bold text-[#4A148C] underline"
                >
                  ล้างการค้นหา
                </button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredStores.map((store) => {
                const isChecked = currentSelectedCodes.has(store.customerCode);
                return (
                  <div
                    key={store.customerCode}
                    onClick={() => handleToggleStore(store.customerCode)}
                    className={`group flex min-h-[64px] cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 sm:p-4 transition-all active:scale-[0.99] select-none ${
                      isChecked
                        ? "border-[#4A148C]/40 bg-[#FAF5FF]"
                        : "border-slate-200 bg-slate-50/80 opacity-60"
                    }`}
                  >
                    {/* Left: Checkbox + Customer Code + Name */}
                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          isChecked
                            ? "border-[#4A148C] bg-[#4A148C] text-white"
                            : "border-slate-300 bg-white text-transparent group-hover:border-slate-400"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-200/90 px-2 py-0.5 text-xs sm:text-sm font-mono font-bold text-slate-800">
                            {store.customerCode}
                          </span>
                          <span
                            className={`truncate text-sm font-bold sm:text-base ${
                              isChecked ? "text-slate-900" : "text-slate-500 line-through"
                            }`}
                          >
                            {store.customerName}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          {isChecked ? (
                            <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-emerald-700">
                              ● ให้คนขับเก็บเงิน
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-500">
                              ○ โอนเงินแล้ว (ไม่ต้องเก็บ)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Amount */}
                    <div className="shrink-0 text-right">
                      <span
                        className={`block text-base sm:text-lg font-bold tabular-nums ${
                          isChecked ? "text-[#4A148C]" : "text-slate-400"
                        }`}
                      >
                        ฿{formatAmount(store.totalAmount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Sticky Bottom Footer */}
        <div className="shrink-0 border-t border-slate-200 bg-white p-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:p-4">
          <div className="flex items-center justify-between gap-3">
            {/* Summary info */}
            <div className="min-w-0">
              <span className="block text-xs sm:text-sm font-medium text-slate-600">
                {currentVehicle ? currentVehicle.name : "รวมทุกสายรถ"}: เลือก{" "}
                <strong className="text-slate-900 font-bold">{currentSelectedStores.length}</strong> /{" "}
                {currentStores.length} ร้าน
              </span>
              <strong className="block truncate text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
                ฿{formatAmount(currentSelectedAmount)}
              </strong>
            </div>

            {/* Confirm & Open A4 Preview Button */}
            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center gap-2 rounded-xl bg-[#4A148C] hover:bg-[#3B1070] px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-bold text-white shadow-sm transition active:scale-95"
            >
              <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>ดูรายงาน A4</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
