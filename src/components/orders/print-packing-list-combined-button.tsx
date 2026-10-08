"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Layers, LayoutList, X } from "lucide-react";

type PrintPackingListCombinedButtonProps = {
  date: string;
  endDate?: string;
  label?: string;
};

export function PrintPackingListCombinedButton({
  date,
  endDate,
  label = "พิมพ์ใบออเดอร์",
}: PrintPackingListCombinedButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<"standard" | "transposed" | null>(null);

  function handlePrint(layout: "standard" | "transposed") {
    if (loadingType) return;
    setLoadingType(layout);
    const params = new URLSearchParams({ date });
    if (endDate) params.set("endDate", endDate);
    if (layout !== "standard") params.set("layout", layout);
    window.location.assign(`/orders/packing-list?${params.toString()}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#4A148C]/20 bg-white px-3 py-1.5 text-[13px] font-bold text-[#4A148C] shadow-sm transition hover:bg-[#4A148C]/15 hover:shadow-md active:scale-[0.98] md:gap-2 md:px-6 md:py-2.5 md:text-sm"
      >
        <LayoutList className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" strokeWidth={2.5} />
        {label}
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[600] flex items-center justify-center bg-black/45 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setIsOpen(false)}
            >
              <div
                className="relative m-4 w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">เลือกรูปแบบใบออเดอร์</h3>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      เลือกรูปแบบตารางก่อน แล้วเลือกสายรถได้ในหน้า preview
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="ปิด"
                    className="rounded-full bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handlePrint("standard")}
                    disabled={loadingType !== null}
                    className="flex w-full items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left transition-all hover:border-[#4A148C]/20 hover:bg-slate-50 active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="flex shrink-0 items-center justify-center rounded-xl bg-[#F3E5F5] p-3 text-[#4A148C]">
                      <FileText className="h-6 w-6" strokeWidth={2.2} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-black text-slate-900">
                        {loadingType === "standard" ? "กำลังเปิด..." : "ตารางมาตรฐาน (ดั้งเดิม)"}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-semibold leading-relaxed text-slate-500">
                        ตารางสินค้าแยกตามรายการออเดอร์แนวนอนทั่วไป
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrint("transposed")}
                    disabled={loadingType !== null}
                    className="flex w-full items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left transition-all hover:border-[#4A148C]/20 hover:bg-slate-50 active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="flex shrink-0 items-center justify-center rounded-xl bg-violet-50 p-3 text-violet-600">
                      <Layers className="h-6 w-6" strokeWidth={2.2} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-black text-slate-900">
                        {loadingType === "transposed" ? "กำลังเปิด..." : "ตารางสลับแนวแกน"}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-semibold leading-relaxed text-slate-500">
                        สลับมุมมองตาราง ช่วยประหยัดพื้นที่เมื่อมีร้านค้าจำนวนมาก
                      </span>
                    </span>
                  </button>
                </div>

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
