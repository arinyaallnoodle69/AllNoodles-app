"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Truck, X } from "lucide-react";

type PackingListVehicleSelectorProps = {
  vehicles: { id: string; name: string }[];
  selectedVehicleIds: string[];
  isAllVehicles: boolean;
};

export function PackingListVehicleSelector({
  vehicles,
  selectedVehicleIds,
  isAllVehicles,
}: PackingListVehicleSelectorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const allOptionIds = useMemo(() => [...vehicles.map((vehicle) => vehicle.id), "__none__"], [vehicles]);
  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>(() =>
    isAllVehicles ? allOptionIds : selectedVehicleIds,
  );
  const [draftAllSelected, setDraftAllSelected] = useState(isAllVehicles);

  const selectionLabel = useMemo(() => {
    if (draftAllSelected) return "ทุกสายรถ";
    if (draftSelectedIds.length === 0) return "ยังไม่ได้เลือก";
    if (draftSelectedIds.length === 1) {
      if (draftSelectedIds[0] === "__none__") return "ไม่ระบุสายรถ";
      return vehicles.find((vehicle) => vehicle.id === draftSelectedIds[0])?.name ?? "1 สายรถ";
    }
    return `เลือก ${draftSelectedIds.length} สายรถ`;
  }, [draftAllSelected, draftSelectedIds, vehicles]);

  function openPicker() {
    setDraftAllSelected(isAllVehicles);
    setDraftSelectedIds(isAllVehicles ? allOptionIds : selectedVehicleIds);
    setIsOpen(true);
  }

  function toggleAll() {
    const next = !draftAllSelected;
    setDraftAllSelected(next);
    setDraftSelectedIds(next ? allOptionIds : []);
  }

  function toggleVehicle(id: string) {
    const next = draftSelectedIds.includes(id)
      ? draftSelectedIds.filter((selected) => selected !== id)
      : [...draftSelectedIds, id];
    const allSelected = allOptionIds.every((optionId) => next.includes(optionId));
    setDraftAllSelected(allSelected);
    setDraftSelectedIds(next);
  }

  function applySelection() {
    if (!draftAllSelected && draftSelectedIds.length === 0) {
      window.alert("กรุณาเลือกอย่างน้อย 1 สายรถ");
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("vehicleId");
    if (draftAllSelected) {
      url.searchParams.delete("vehicle");
    } else {
      url.searchParams.set("vehicle", draftSelectedIds.join(","));
    }
    setIsOpen(false);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E1BEE7] bg-[#FBF7FC] px-3 py-1.5 text-xs font-bold text-[#4A148C] transition hover:bg-[#F3E5F5] active:scale-[0.98] sm:text-[13px]"
      >
        <Truck className="h-4 w-4 shrink-0" />
        <span className="max-w-28 truncate">{selectionLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
              onClick={() => setIsOpen(false)}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="packing-list-vehicle-selector-title"
                className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
                  <div>
                    <h2 id="packing-list-vehicle-selector-title" className="text-base font-black text-slate-900">
                      เลือกรถ / สายรถ
                    </h2>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      เลือกรถที่ต้องการแสดงในใบออเดอร์
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="ปิด"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </header>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3 sm:p-4">
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                    draftAllSelected ? "border-[#4A148C] bg-[#F3E5F5]" : "border-slate-200 bg-white"
                  }`}>
                    <input
                      type="checkbox"
                      checked={draftAllSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 accent-[#4A148C]"
                    />
                    <span className="text-sm font-bold text-slate-800">ทุกสายรถ</span>
                  </label>

                  {vehicles.map((vehicle) => {
                    const checked = draftAllSelected || draftSelectedIds.includes(vehicle.id);
                    return (
                      <label
                        key={vehicle.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                          checked ? "border-[#4A148C] bg-[#F3E5F5]" : "border-slate-200 bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleVehicle(vehicle.id)}
                          className="h-4 w-4 accent-[#4A148C]"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                          {vehicle.name}
                        </span>
                        {checked ? <Check className="h-4 w-4 text-[#4A148C]" /> : null}
                      </label>
                    );
                  })}

                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                    draftAllSelected || draftSelectedIds.includes("__none__")
                      ? "border-[#4A148C] bg-[#F3E5F5]"
                      : "border-slate-200 bg-white"
                  }`}>
                    <input
                      type="checkbox"
                      checked={draftAllSelected || draftSelectedIds.includes("__none__")}
                      onChange={() => toggleVehicle("__none__")}
                      className="h-4 w-4 accent-[#4A148C]"
                    />
                    <span className="text-sm font-semibold text-slate-800">ไม่ระบุสายรถ</span>
                  </label>
                </div>

                <footer className="flex gap-2 border-t border-slate-100 bg-white p-3 sm:p-4">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={applySelection}
                    className="flex-1 rounded-xl bg-[#4A148C] px-4 py-3 text-sm font-bold text-white disabled:opacity-70"
                  >
                    แสดงใบออเดอร์
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
