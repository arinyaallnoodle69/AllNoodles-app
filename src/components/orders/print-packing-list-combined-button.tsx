"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutList, Layers, FileText, Truck, X } from "lucide-react";
import { createPortal } from "react-dom";

type PrintPackingListCombinedButtonProps = {
  date: string;
  endDate?: string;
  label?: string;
  vehicles?: { id: string; name: string }[];
  selectedVehicleId?: string;
};

export function PrintPackingListCombinedButton({
  date,
  endDate,
  label = "พิมพ์ใบออเดอร์",
  vehicles = [],
  selectedVehicleId,
}: PrintPackingListCombinedButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<"standard" | "transposed" | null>(null);

  const allOptionIds = useMemo(
    () => [...vehicles.map((v) => v.id), "__none__"],
    [vehicles],
  );

  const [selectedVehicles, setSelectedVehicles] = useState<string[]>(() => {
    if (!selectedVehicleId || selectedVehicleId === "__all__") {
      return ["__all__", ...allOptionIds];
    }
    return selectedVehicleId.split(",").map((s) => s.trim()).filter(Boolean);
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsOpen(false);
      setLoadingType(null);
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  const isAllSelected = useMemo(() => {
    if (allOptionIds.length === 0) return true;
    return (
      selectedVehicles.includes("__all__") ||
      allOptionIds.every((id) => selectedVehicles.includes(id))
    );
  }, [allOptionIds, selectedVehicles]);

  const handleToggleAll = () => {
    if (isAllSelected) {
      setSelectedVehicles([]);
    } else {
      setSelectedVehicles(["__all__", ...allOptionIds]);
    }
  };

  const handleToggleVehicle = (id: string) => {
    setSelectedVehicles((prev) => {
      const isCurrentlyChecked = prev.includes(id);
      let next: string[];

      if (isCurrentlyChecked) {
        next = prev.filter((item) => item !== id && item !== "__all__");
      } else {
        const base = prev.filter((item) => item !== "__all__");
        next = [...base, id];
        if (allOptionIds.every((optId) => next.includes(optId))) {
          next.push("__all__");
        }
      }
      return next;
    });
  };

  const getUrl = (layout: "standard" | "transposed") => {
    let vehicleParam = "";
    if (!isAllSelected && selectedVehicles.length > 0) {
      const filtered = selectedVehicles.filter((v) => v !== "__all__");
      if (filtered.length > 0) {
        vehicleParam = `&vehicle=${encodeURIComponent(filtered.join(","))}`;
      }
    }
    return `/orders/packing-list?date=${date}${endDate ? `&endDate=${endDate}` : ""}${
      layout !== "standard" ? `&layout=${layout}` : ""
    }${vehicleParam}`;
  };

  const handlePrint = (layout: "standard" | "transposed") => {
    if (selectedVehicles.length === 0) {
      window.alert("กรุณาเลือกสายรถอย่างน้อย 1 สายรถ");
      return;
    }
    setLoadingType(layout);
    const url = getUrl(layout);
    window.location.assign(url);
    window.setTimeout(() => {
      setLoadingType(null);
      setIsOpen(false);
    }, 1000);
  };

  const selectedCountText = useMemo(() => {
    if (isAllSelected) return "ทุกสายรถ";
    const actualSelected = selectedVehicles.filter((id) => id !== "__all__");
    if (actualSelected.length === 0) return "ยังไม่ได้เลือก";
    if (actualSelected.length === 1) {
      if (actualSelected[0] === "__none__") return "ไม่ระบุสายรถ";
      return vehicles.find((v) => v.id === actualSelected[0])?.name ?? "1 สายรถ";
    }
    return `เลือก ${actualSelected.length} สายรถ`;
  }, [isAllSelected, selectedVehicles, vehicles]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!selectedVehicleId || selectedVehicleId === "__all__") {
            setSelectedVehicles(["__all__", ...allOptionIds]);
          } else {
            setSelectedVehicles(selectedVehicleId.split(",").map((s) => s.trim()).filter(Boolean));
          }
          setIsOpen(true);
        }}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#4A148C]/20 bg-white px-3 py-1.5 text-[13px] font-bold text-[#4A148C] shadow-sm transition hover:bg-[#4A148C]/15 hover:shadow-md active:scale-[0.98] md:gap-2 md:px-6 md:py-2.5 md:text-sm"
      >
        <LayoutList className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" strokeWidth={2.5} />
        {label}
      </button>

      {/* Choice Dialog Modal */}
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[600] flex items-center justify-center bg-black/45 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setIsOpen(false)}
            >
              <div
                className="relative w-full max-w-md bg-white rounded-[24px] shadow-2xl p-6 m-4 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Title */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">เลือกรูปแบบใบจัดของ</h3>
                    <p className="text-xs font-semibold text-slate-400 mt-0.5">
                      เลือกสายรถ (ติ๊กเลือกได้หลายคัน) และรูปแบบตาราง
                    </p>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-full bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                  >
                    <X className="h-4.5 w-4.5" strokeWidth={2.5} />
                  </button>
                </div>

                {/* Vehicle Checkbox Multi-Selector */}
                <div className="mb-4 rounded-2xl border border-[#E1BEE7]/60 bg-[#FBF7FC] p-3.5">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4A148C]">
                      <Truck className="h-4 w-4" strokeWidth={2.5} />
                      เลือกรถ / สายรถที่จะพิมพ์ ({selectedCountText})
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleAll}
                      className="text-[11px] font-bold text-[#4A148C] hover:underline"
                    >
                      {isAllSelected ? "ล้างทั้งหมด" : "เลือกทั้งหมด"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
                    {/* All vehicles checkbox */}
                    <label
                      className={`col-span-2 flex items-center gap-2.5 rounded-xl border p-2.5 cursor-pointer transition ${
                        isAllSelected
                          ? "border-[#4A148C] bg-[#F3E5F5] font-bold text-[#4A148C]"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleAll}
                        className="h-4 w-4 rounded border-slate-300 accent-[#4A148C]"
                      />
                      <span className="text-xs">ทุกสายรถ (พิมพ์รวมทั้งหมด)</span>
                    </label>

                    {/* Individual vehicle checkboxes */}
                    {vehicles.map((v) => {
                      const isChecked = isAllSelected || selectedVehicles.includes(v.id);
                      return (
                        <label
                          key={v.id}
                          className={`flex items-center gap-2.5 rounded-xl border p-2.5 cursor-pointer transition ${
                            isChecked
                              ? "border-[#4A148C] bg-[#F3E5F5] font-bold text-[#4A148C]"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleVehicle(v.id)}
                            className="h-4 w-4 rounded border-slate-300 accent-[#4A148C]"
                          />
                          <span className="text-xs truncate">{v.name}</span>
                        </label>
                      );
                    })}

                    {/* None vehicle checkbox */}
                    <label
                      className={`flex items-center gap-2.5 rounded-xl border p-2.5 cursor-pointer transition ${
                        isAllSelected || selectedVehicles.includes("__none__")
                          ? "border-[#4A148C] bg-[#F3E5F5] font-bold text-[#4A148C]"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isAllSelected || selectedVehicles.includes("__none__")}
                        onChange={() => handleToggleVehicle("__none__")}
                        className="h-4 w-4 rounded border-slate-300 accent-[#4A148C]"
                      />
                      <span className="text-xs truncate">ไม่ระบุสายรถ</span>
                    </label>
                  </div>
                </div>

                {/* Options List */}
                <div className="space-y-3">
                  {/* Option 1: Standard Table */}
                  <button
                    type="button"
                    onClick={() => handlePrint("standard")}
                    disabled={loadingType !== null}
                    className="flex w-full items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left transition-all hover:bg-slate-50 hover:border-[#4A148C]/20 active:scale-[0.99] disabled:opacity-50"
                  >
                    <div className="flex shrink-0 items-center justify-center rounded-xl bg-[#F3E5F5] p-3 text-[#4A148C]">
                      <FileText className="h-6 w-6" strokeWidth={2.2} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-slate-900">ตารางมาตรฐาน (ดั้งเดิม)</span>
                        {loadingType === "standard" && (
                          <span className="text-[10px] bg-[#4A148C] text-white px-2 py-0.5 rounded-md font-bold animate-pulse">
                            กำลังเปิด...
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 mt-0.5 leading-relaxed">
                        ตารางสินค้าแยกตามรายการออเดอร์แนวนอนทั่วไป เช็คง่ายสำหรับการจัดแยกชุดแบบเรียงตามร้าน
                      </p>
                    </div>
                  </button>

                  {/* Option 2: Transposed Table */}
                  <button
                    type="button"
                    onClick={() => handlePrint("transposed")}
                    disabled={loadingType !== null}
                    className="flex w-full items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left transition-all hover:bg-slate-50 hover:border-[#4A148C]/20 active:scale-[0.99] disabled:opacity-50"
                  >
                    <div className="flex shrink-0 items-center justify-center rounded-xl bg-violet-50 p-3 text-violet-600">
                      <Layers className="h-6 w-6" strokeWidth={2.2} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-slate-900">ตารางสลับแนวแกน (สลับตาราง)</span>
                        {loadingType === "transposed" && (
                          <span className="text-[10px] bg-violet-600 text-white px-2 py-0.5 rounded-md font-bold animate-pulse">
                            กำลังเปิด...
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 mt-0.5 leading-relaxed">
                        สลับมุมมองตารางเพื่อรวมร้านค้าไว้ฝั่งเดียวกัน ช่วยประหยัดพื้นที่กระดาษเมื่อร้านค้าจำนวนมาก
                      </p>
                    </div>
                  </button>
                </div>

                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="mt-4 w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                >
                  ยกเลิก
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
