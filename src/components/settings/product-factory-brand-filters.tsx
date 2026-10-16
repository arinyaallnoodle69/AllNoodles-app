"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ListFilter, X } from "lucide-react";

type Props = {
  factoryOptions: string[];
  brandOptions: string[];
  selectedFactory: string;
  selectedBrand: string;
  onFactorySelect: (value: string) => void;
  onBrandSelect: (value: string) => void;
  variant?: "desktop" | "mobile";
};

export function ProductFactoryBrandFilters({ factoryOptions, brandOptions, selectedFactory, selectedBrand, onFactorySelect, onBrandSelect, variant }: Props) {
  const [drawer, setDrawer] = useState<"factory" | "brand" | null>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!drawer) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawer(null); };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", escape); previous?.focus({ preventScroll: true }); };
  }, [drawer]);
  const rows = [
    { key: "factory" as const, label: "โรงงาน", all: "ทุกโรงงาน", options: factoryOptions, selected: selectedFactory, select: onFactorySelect },
    { key: "brand" as const, label: "แบรนด์", all: "ทั้งหมด", options: brandOptions, selected: selectedBrand, select: onBrandSelect },
  ];
  const current = rows.find(row => row.key === drawer);
  function select(value: string, event: MouseEvent<HTMLButtonElement>, callback: Props["onFactorySelect"]) {
    callback(value);
    const button = event.currentTarget, strip = button.parentElement;
    if (strip) strip.scrollTo({ left: button.offsetLeft - strip.offsetLeft - (strip.clientWidth - button.offsetWidth) / 2, behavior: "smooth" });
  }
  return <>
    <div className={variant === "desktop" ? "hidden lg:block" : variant === "mobile" ? "mb-0 mt-2 block w-full max-w-full overflow-hidden border-b border-slate-200 bg-white px-4 py-1 lg:hidden" : "w-full min-w-0 overflow-hidden border-b border-slate-200 bg-white px-4 py-1 lg:px-6"}>
      {rows.filter(row => row.options.length > 0).map((row, index) => <div key={row.key} className={`flex min-w-0 items-center gap-5 ${index > 0 || variant === "desktop" ? "border-t border-slate-100" : ""} ${variant === "desktop" ? "pt-3" : ""}`}>
        <button type="button" onClick={() => setDrawer(row.key)} aria-label={`เปิดรายการ${row.label}ทั้งหมด`} className={`flex shrink-0 items-center gap-1.5 font-black ${variant === "desktop" ? "min-h-10 min-w-[70px] text-xs uppercase tracking-wider text-slate-400" : "h-12 text-sm text-[#4A148C]"}`}>
          {row.label}<ListFilter className={`h-4 w-4 ${variant === "desktop" ? "hidden" : ""}`} strokeWidth={2.5} />
        </button>
        <div className="no-scrollbar relative flex min-w-0 flex-1 items-center gap-6 overflow-x-auto overscroll-x-contain">
          {[{ value: "__all__", label: row.all }, ...row.options.map(value => ({ value, label: value }))].map(option => <button key={option.value} type="button" aria-pressed={row.selected === option.value} onClick={event => select(option.value, event, row.select)} className={`relative shrink-0 whitespace-nowrap px-1 text-sm font-black transition-colors ${variant === "desktop" ? "h-10" : "h-12"} ${row.selected === option.value ? "text-[#4A148C]" : "text-slate-500 hover:text-[#4A148C]"}`}>
            {option.label}{row.selected === option.value ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" /> : null}
          </button>)}
        </div>
      </div>)}
    </div>
    {current && typeof document !== "undefined" ? createPortal(<div className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-6" onClick={event => { if (event.target === event.currentTarget) setDrawer(null); }}>
      <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`เลือก${current.label}`} className="relative flex max-h-[78dvh] w-full flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-xl outline-none sm:max-w-md sm:rounded-2xl" onKeyDown={event => {
        if (event.key !== "Tab") return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first?.focus(); }
      }}>
        <header className="flex items-center justify-between border-b border-[#E1BEE7] px-5 py-4"><h3 className="text-xl font-black text-slate-950">เลือก{current.label}</h3><button type="button" aria-label="ปิดรายการตัวกรอง" onClick={() => setDrawer(null)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E1BEE7] text-[#4A148C]"><X className="h-5 w-5" /></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2">{[{ value: "__all__", label: current.all }, ...current.options.map(value => ({ value, label: value }))].map(option => <button key={option.value} type="button" aria-pressed={current.selected === option.value} onClick={() => { current.select(option.value); setDrawer(null); }} className={`flex min-h-14 w-full items-center justify-between gap-3 border-b border-[#E1BEE7]/70 text-left text-base font-black ${current.selected === option.value ? "text-[#4A148C]" : "text-slate-950"}`}>{option.label}{current.selected === option.value ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#4A148C]" /> : null}</button>)}</div>
      </section>
    </div>, document.body) : null}
  </>;
}
