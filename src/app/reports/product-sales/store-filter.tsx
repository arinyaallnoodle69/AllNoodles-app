"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Store, X } from "lucide-react";
import { normalizeSearch } from "@/lib/utils/search";
import { getActiveVehiclesAction } from "@/app/order/actions";

type Customer = { id: string; name: string; defaultVehicleId?: string | null };

export function StoreFilter({
  customers,
  selectedIds,
}: {
  customers: Customer[];
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | "__all__">("__all__");
  const [vehicles, setVehicles] = useState<{ id: string; name: string }[]>([]);
  const vehicleTabsContainerRef = useRef<HTMLDivElement>(null);
  const [vehicleUnderlineStyle, setVehicleUnderlineStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    getActiveVehiclesAction().then((data) => {
      setVehicles(data);
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    const container = vehicleTabsContainerRef.current;
    if (!container) return;
    const timer = setTimeout(() => {
      const activeEl = container.querySelector('[data-active="true"]') as HTMLElement;
      if (activeEl) {
        setVehicleUnderlineStyle({
          left: `${activeEl.offsetLeft}px`,
          width: `${activeEl.offsetWidth}px`,
        });
      } else {
        setVehicleUnderlineStyle(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedVehicleId, open]);

  const handleVehicleSelect = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedVehicleId(id);
    setVehicleUnderlineStyle({
      left: `${e.currentTarget.offsetLeft}px`,
      width: `${e.currentTarget.offsetWidth}px`,
    });
    e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const filtered = customers.filter((c) => {
    const matchesSearch = normalizeSearch(c.name).includes(normalizeSearch(search));
    const matchesVehicle = selectedVehicleId === "__all__" || c.defaultVehicleId === selectedVehicleId;
    return matchesSearch && matchesVehicle;
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const selectAll = () => setSelected(new Set(customers.map((c) => c.id)));
  const clearAll = () => setSelected(new Set<string>());

  const noneSelected = selected.size === 0;
  const allSelected = selected.size === customers.length && customers.length > 0;

  const label = noneSelected
    ? "ร้านค้าทั้งหมด"
    : allSelected
      ? "ทุกร้านค้า"
      : `${selected.size} ร้านที่เลือก`;

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input carries comma-separated IDs to the GET form */}
      <input type="hidden" name="stores" value={[...selected].join(",")} />

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-xl border-0 bg-white py-2.5 pl-3 pr-3 text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#4A148C]/20 ${
          open ? "ring-2 ring-[#4A148C]/20" : "ring-1 ring-slate-200"
        }`}
      >
        <Store className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} />
        <span
          className={`flex-1 text-left ${
            noneSelected ? "text-slate-400" : "font-medium text-slate-800"
          }`}
        >
          {label}
        </span>
        {!noneSelected && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                clearAll();
              }
            }}
            className="shrink-0 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[260px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {/* Search */}
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาร้านค้า..."
                className="w-full rounded-lg py-1.5 pl-8 pr-3 text-sm text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-[#4A148C]/20"
              />
            </div>
          </div>

          {/* Vehicle Tabs */}
          {vehicles.length > 0 && (
            <div className="relative border-b border-slate-100 bg-slate-50/50 overflow-hidden">
              <div
                ref={vehicleTabsContainerRef}
                className="flex gap-4 overflow-x-auto px-3 pb-2 pt-2 scrollbar-none relative"
              >
                {/* Underline indicator */}
                <span
                  className="absolute bottom-0 h-[2.5px] rounded-full bg-[#4A148C] transition-all duration-200 ease-out"
                  style={{
                    ...(vehicleUnderlineStyle ?? { left: 0, width: 0 }),
                    opacity: vehicleUnderlineStyle ? 1 : 0,
                  }}
                />

                <button
                  type="button"
                  data-active={selectedVehicleId === "__all__"}
                  onClick={(e) => handleVehicleSelect("__all__", e)}
                  className={`relative shrink-0 pb-1 text-xs font-black transition ${
                    selectedVehicleId === "__all__"
                      ? "text-[#4A148C]"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  ทั้งหมด
                </button>

                {vehicles.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    data-active={selectedVehicleId === v.id}
                    onClick={(e) => handleVehicleSelect(v.id, e)}
                    className={`relative shrink-0 pb-1 text-xs font-black transition ${
                      selectedVehicleId === v.id
                        ? "text-[#4A148C]"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Select / clear all */}
          <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-semibold text-[#4A148C] hover:underline"
            >
              เลือกทั้งหมด
            </button>
            <span className="text-slate-200">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-semibold text-slate-400 hover:underline"
            >
              ยกเลิกทั้งหมด
            </button>
            {!noneSelected && (
              <span className="ml-auto text-xs text-slate-400">
                เลือก {selected.size}/{customers.length}
              </span>
            )}
          </div>

          {/* Checkbox list */}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-center text-sm text-slate-400">
                ไม่พบร้านค้า
              </p>
            ) : (
              filtered.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-[#4A148C]"
                  />
                  <span
                    className={`flex-1 truncate ${selected.has(c.id) ? "font-medium text-slate-800" : "text-slate-600"}`}
                  >
                    {c.name}
                  </span>
                  {selected.has(c.id) && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4A148C]" />
                  )}
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
