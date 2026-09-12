"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Layers,
  Printer,
  Settings,
  Truck,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  PackingListSummaryButton,
  type PackingListSummaryProduct,
  type PackingListSummaryStore,
} from "./packing-list-summary-button";
import { IncomingOrdersDeliveryActions } from "./incoming-orders-delivery-actions";
import { PrintFactoryOrderSheetButton } from "./print-factory-order-sheet-button";
import { PrintPackingListButton } from "./print-packing-list-button";
import { PrintVehicleProductSummaryButton } from "./print-vehicle-product-summary-button";

type VisibleOrderStore = {
  customerId: string;
  customerName: string;
  customerCode: string;
  orderDate: string;
  orderIds?: string[];
  orderNumbers?: string[];
  deliveryNoteIds?: string[];
  orderRounds: number;
  totalAmount: number;
  vehicleId?: string | null;
  vehicleName?: string | null;
};

type MobilePrintActionsProps = {
  date: string;
  endDate: string;
  dateLabel: string;
  summaryProducts: PackingListSummaryProduct[];
  summaryStores: PackingListSummaryStore[];
  visibleOrderStores: VisibleOrderStore[];
  vehicles?: { id: string; name: string }[];
  selectedVehicleId?: string;
  triggerLabel?: string;
};

type ActionCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
};

function ActionCard({ icon, action }: ActionCardProps) {
  return (
    <div className="group flex items-center gap-3 rounded-3xl border border-[#E1BEE7]/70 bg-white p-3 shadow-[0_12px_32px_rgba(74,20,140,0.08)] transition-all active:scale-[0.985]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1 [&_button]:h-12 [&_button]:w-full [&_button]:justify-center [&_button]:rounded-2xl [&_button]:border-[#4A148C] [&_button]:bg-[#4A148C] [&_button]:px-4 [&_button]:py-0 [&_button]:text-sm [&_button]:font-black [&_button]:text-white [&_button]:shadow-[0_12px_24px_rgba(74,20,140,0.22)] [&_button]:hover:bg-[#4A148C]">
          {action}
        </div>
      </div>
    </div>
  );
}

export function MobilePrintActions({
  date,
  endDate,
  dateLabel,
  summaryProducts,
  summaryStores,
  visibleOrderStores,
  vehicles = [],
  selectedVehicleId,
  triggerLabel = "พิมพ์และจัดการเอกสารออเดอร์",
}: MobilePrintActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isVehiclePickerOpen, setIsVehiclePickerOpen] = useState(false);
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

  const activeVehicleParam = useMemo(() => {
    if (isAllSelected || selectedVehicles.length === 0) return "__all__";
    return selectedVehicles.filter((id) => id !== "__all__").join(",");
  }, [isAllSelected, selectedVehicles]);

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
          setIsVehiclePickerOpen(false);
          setIsOpen(true);
        }}
        className="inline-flex h-14 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#4A148C] px-2 text-xs font-black leading-none text-white shadow-sm transition active:scale-[0.98] min-[360px]:gap-2 min-[360px]:px-3 min-[360px]:text-sm sm:hidden"
      >
        <Printer className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        {triggerLabel}
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="animate-in fixed inset-0 z-[500] flex items-end justify-center bg-black/40 backdrop-blur-sm fade-in duration-200"
              onClick={() => setIsOpen(false)}
            >
              <div
                className="animate-in relative z-[510] flex max-h-[85vh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl slide-in-from-bottom duration-300"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">พิมพ์และจัดการเอกสาร</h3>
                    <p className="hidden">
                      เลือกเอกสารหรือรายงานสรุปออเดอร์ที่ต้องการ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                    aria-label="ปิด"
                  >
                    <X className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                </div>

                <div className="scrollbar-hide flex-1 space-y-3 overflow-y-auto bg-[#FBF7FC] px-5 py-5 pb-12">
                  {/* Vehicle Checkbox Multi-Selector */}
                  {vehicles.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-[#E1BEE7]/60 bg-white shadow-sm">
                      <button
                        type="button"
                        aria-expanded={isVehiclePickerOpen}
                        onClick={() => setIsVehiclePickerOpen((current) => !current)}
                        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-xs font-black text-[#4A148C]">
                          <Truck className="h-4 w-4" strokeWidth={2.5} />
                            เลือกรถ / สายรถ
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-600">{selectedCountText}</span>
                        </span>
                        <ChevronDown className={`h-5 w-5 shrink-0 text-[#4A148C] transition-transform ${isVehiclePickerOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
                      </button>

                      {isVehiclePickerOpen ? <div className="border-t border-[#E1BEE7]/60 bg-[#FBF7FC] p-3">
                        <div className="mb-2 flex justify-end">
                          <button type="button" onClick={handleToggleAll} className="text-xs font-black text-[#4A148C]">
                            {isAllSelected ? "ล้างทั้งหมด" : "เลือกทั้งหมด"}
                          </button>
                        </div>
                        <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
                        {/* All option */}
                        <label
                          className={`col-span-2 flex items-center gap-2 rounded-xl border p-2 cursor-pointer transition ${
                            isAllSelected
                              ? "border-[#4A148C] bg-[#F3E5F5] font-bold text-[#4A148C]"
                              : "border-slate-200 bg-[#FBF7FC] text-slate-700"
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

                        {/* Vehicles list */}
                        {vehicles.map((v) => {
                          const isChecked = isAllSelected || selectedVehicles.includes(v.id);
                          return (
                            <label
                              key={v.id}
                              className={`flex items-center gap-2 rounded-xl border p-2 cursor-pointer transition ${
                                isChecked
                                  ? "border-[#4A148C] bg-[#F3E5F5] font-bold text-[#4A148C]"
                                  : "border-slate-200 bg-[#FBF7FC] text-slate-700"
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

                        {/* None vehicle */}
                        <label
                          className={`flex items-center gap-2 rounded-xl border p-2 cursor-pointer transition ${
                            isAllSelected || selectedVehicles.includes("__none__")
                              ? "border-[#4A148C] bg-[#F3E5F5] font-bold text-[#4A148C]"
                              : "border-slate-200 bg-[#FBF7FC] text-slate-700"
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
                      </div> : null}
                    </div>
                  )}

                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-[#F3E5F5] p-2.5 text-[#4A148C]">
                        <BarChart3 className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="สรุปยอดรวมสินค้า (ใบจัดของ)"
                    description="ดูรายงานสรุปยอดรวมจำนวนสินค้าและข้อมูลร้านค้าทั้งหมด เพื่อความสะดวกในการตรวจนับก่อนส่ง"
                    action={
                      <PackingListSummaryButton
                        dateLabel={dateLabel}
                        products={summaryProducts}
                        stores={summaryStores}
                      />
                    }
                  />

                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-[#F3E5F5] p-2.5 text-[#4A148C]">
                        <FileText className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="พิมพ์ใบออเดอร์ (ตารางมาตรฐาน)"
                    description="พิมพ์ใบจัดชุดสินค้าตามออเดอร์ในรูปแบบตารางมาตรฐาน เหมาะสำหรับการบรรจุทั่วไป"
                    action={
                      <PrintPackingListButton
                        date={date}
                        endDate={endDate}
                        vehicleId={activeVehicleParam}
                      />
                    }
                  />

                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-violet-50 p-2.5 text-violet-600">
                        <Layers className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="พิมพ์ใบออเดอร์ (สลับตาราง)"
                    description="พิมพ์ตารางใบจัดสินค้าแบบสลับแกนข้อมูล ช่วยประหยัดหน้ากระดาษและเช็กของง่ายขึ้นในกรณีที่ออเดอร์จำนวนมาก"
                    action={
                      <PrintPackingListButton
                        date={date}
                        endDate={endDate}
                        layout="transposed"
                        vehicleId={activeVehicleParam}
                        label="พิมพ์ใบออเดอร์ (สลับตาราง)"
                      />
                    }
                  />

                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-amber-50 p-2.5 text-amber-600">
                        <Truck className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="ใบขึ้นของ"
                    description="พิมพ์เอกสารใบสรุปของขึ้นขนส่ง แยกรายละเอียดสินค้าตามรถจัดส่งแต่ละคัน"
                    action={<PrintVehicleProductSummaryButton date={date} endDate={endDate} />}
                  />

                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-rose-50 p-2.5 text-rose-600">
                        <FileSpreadsheet className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="พิมพ์ใบสั่งของโรงงาน (A5 Landscape)"
                    description="พิมพ์ใบสั่งผลิตสินค้าบะหมี่และแผ่นเกี๊ยว ขนาด A5 แนวนอน ส่งโรงงานอนามัยโดยตรง"
                    action={<PrintFactoryOrderSheetButton date={date} endDate={endDate} />}
                  />

                  <ActionCard
                    icon={
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                        <Settings className="h-5 w-5" strokeWidth={2.5} />
                      </div>
                    }
                    title="จัดการบิลส่งของ / พิมพ์เอกสารขนส่ง"
                    description="จัดการ ออก หรือสั่งพิมพ์บิลส่งของของร้านค้าทั้งหมดในรอบจัดส่งพร้อมกัน"
                    action={
                      <IncomingOrdersDeliveryActions
                        date={date}
                        endDate={endDate}
                        stores={visibleOrderStores}
                      />
                    }
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
