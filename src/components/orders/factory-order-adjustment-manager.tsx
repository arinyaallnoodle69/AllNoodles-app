"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays, Keyboard, Settings2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { saveFactoryOrderAdjustmentsAction } from "@/app/orders/incoming/factory-order-adjustment-actions";

export type FactoryAdjustmentProduct = {
  adjustedQuantity: number;
  name: string;
  orderDemand: number;
  productId: string;
  remainingQuantity: number;
  reserveQuantity: number;
  sku: string;
};

type Props = {
  date: string;
  dateLabel: string;
  products: FactoryAdjustmentProduct[];
  variant: "desktop" | "mobile" | "toolbar";
};

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

function toNumber(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function FactoryOrderAdjustmentManager({ date, dateLabel, products, variant }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [rows, setRows] = useState(products);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setIsOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    adjusted: sum.adjusted + row.adjustedQuantity,
    demand: sum.demand + row.orderDemand,
    remaining: sum.remaining + row.remainingQuantity,
    reserve: sum.reserve + row.reserveQuantity,
  }), { adjusted: 0, demand: 0, remaining: 0, reserve: 0 }), [rows]);

  function updateRow(index: number, field: "remainingQuantity" | "reserveQuantity", value: string) {
    setSaved(false);
    setError("");
    setRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, [field]: toNumber(value) };
      return { ...next, adjustedQuantity: Math.max(0, next.orderDemand + next.reserveQuantity - next.remainingQuantity) };
    }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveFactoryOrderAdjustmentsAction(date, rows);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
      window.setTimeout(() => setIsOpen(false), 450);
    });
  }

  const triggerClass = variant === "mobile"
    ? "inline-flex h-14 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-xs font-black leading-none text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50 min-[360px]:gap-2 min-[360px]:px-3 min-[360px]:text-sm"
    : variant === "toolbar"
      ? "inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-black text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50"
      : "inline-flex h-full w-full items-center justify-center gap-2 rounded-2xl border border-[#EA80FC]/35 px-5 py-3.5 text-sm font-black text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50";

  return (
    <>
      <button type="button" className={triggerClass} style={{ backgroundColor: "#C62F75" }} onClick={() => { setRows(products); setError(""); setSaved(false); setIsOpen(true); }} disabled={products.length !== 3}>
        <Settings2 className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        ปรับยอดสั่งผลิต
      </button>

      {isOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[600] flex items-end justify-center bg-[#111827]/55 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && setIsOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="factory-adjustment-title" className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-2xl sm:max-w-[900px] sm:rounded-[16px]">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#E8E4EF] px-4 py-4 sm:px-7 sm:py-5">
              <div className="min-w-0">
                <h2 id="factory-adjustment-title" className="text-xl font-black text-[#17152F] sm:text-2xl">ปรับยอดสั่งผลิต</h2>
                <p className="mt-0.5 text-xs font-semibold text-[#4A148C] sm:text-sm">เฉพาะ ANP180 · ANP181 · ANP182</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-2 rounded-xl border border-[#D9C9F3] bg-[#FAF7FF] px-3 py-2 text-sm font-bold text-[#321471] sm:inline-flex">
                  <CalendarDays className="h-4 w-4" /> {dateLabel}
                </span>
                <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-2 text-[#241857] transition hover:bg-[#F3E5F5]" aria-label="ปิด">
                  <X className="h-5 w-5" strokeWidth={2.25} />
                </button>
              </div>
            </header>

            <div className="overflow-y-auto px-3 py-3 sm:px-7 sm:py-4">
              <div className="hidden overflow-hidden rounded-xl border border-[#DED8E8] sm:block">
                <div className="grid grid-cols-[1.45fr_1fr_28px_1fr_28px_1fr_28px_1fr] items-center bg-[#F7F8FB] px-3 py-3 text-center text-sm font-black text-[#17152F]">
                  <span className="text-left">สินค้า</span><span>ยอดออเดอร์<br />(กก.)</span><span /><span>คงเหลือ<br />(กก.)</span><span /><span>ของสำรอง<br />(กก.)</span><span /><span>ยอดสั่ง<br />(กก.)</span>
                </div>
                {rows.map((row, index) => (
                  <div key={row.productId} className="grid grid-cols-[1.45fr_1fr_28px_1fr_28px_1fr_28px_1fr] items-center border-t border-[#DED8E8] px-3 py-3 text-[#17152F]">
                    <div className="min-w-0 pr-2"><p className="text-base font-black text-[#18125D]">{row.sku}</p><p className="truncate text-sm font-medium text-[#334155]">{row.name}</p></div>
                    <div className="rounded-lg bg-[#EFF1F6] px-2 py-2.5 text-center text-base font-black tabular-nums">{formatQuantity(row.orderDemand)}</div>
                    <span className="text-center text-xl font-black text-[#321471]">−</span>
                    <input aria-label={`${row.sku} คงเหลือ`} inputMode="decimal" value={row.remainingQuantity} onChange={(event) => updateRow(index, "remainingQuantity", event.target.value)} className="min-w-0 rounded-lg border-2 border-[#6930DC] bg-white px-2 py-2 text-center text-base font-black tabular-nums text-[#17152F] outline-none focus:ring-2 focus:ring-[#6930DC]/20" />
                    <span className="text-center text-xl font-black text-[#321471]">+</span>
                    <input aria-label={`${row.sku} ของสำรอง`} inputMode="decimal" value={row.reserveQuantity} onChange={(event) => updateRow(index, "reserveQuantity", event.target.value)} className="min-w-0 rounded-lg border-2 border-[#6930DC] bg-white px-2 py-2 text-center text-base font-black tabular-nums text-[#17152F] outline-none focus:ring-2 focus:ring-[#6930DC]/20" />
                    <span className="text-center text-lg font-black text-[#321471]">=</span>
                    <div className="rounded-lg bg-[#5720B7] px-2 py-2.5 text-center text-base font-black tabular-nums text-white">{formatQuantity(row.adjustedQuantity)} กก.</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5 sm:hidden">
                {rows.map((row, index) => (
                  <article key={row.productId} className="rounded-xl border border-[#DED8E8] bg-white p-3">
                    <div className="mb-3 flex items-baseline gap-2"><h3 className="text-base font-black text-[#18125D]">{row.sku}</h3><p className="min-w-0 truncate text-sm font-medium text-[#334155]">{row.name}</p></div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                      <label className="min-w-0 text-xs font-bold text-[#241857]">ยอดออเดอร์ (กก.)<span className="mt-1 flex h-11 items-center justify-center rounded-lg bg-[#EFF1F6] text-base font-black tabular-nums text-[#17152F]">{formatQuantity(row.orderDemand)}</span></label>
                      <label className="min-w-0 text-xs font-bold text-[#241857]">ของสำรอง (กก.)<input aria-label={`${row.sku} ของสำรอง`} inputMode="decimal" value={row.reserveQuantity} onChange={(event) => updateRow(index, "reserveQuantity", event.target.value)} className="mt-1 h-11 w-full rounded-lg border-2 border-[#6930DC] px-2 text-center text-base font-black tabular-nums outline-none focus:ring-2 focus:ring-[#6930DC]/20" /></label>
                      <label className="min-w-0 text-xs font-bold text-[#241857]">คงเหลือ (กก.)<input aria-label={`${row.sku} คงเหลือ`} inputMode="decimal" value={row.remainingQuantity} onChange={(event) => updateRow(index, "remainingQuantity", event.target.value)} className="mt-1 h-11 w-full rounded-lg border-2 border-[#6930DC] px-2 text-center text-base font-black tabular-nums outline-none focus:ring-2 focus:ring-[#6930DC]/20" /></label>
                      <div className="min-w-0 text-xs font-bold text-[#241857]">ยอดสั่ง (กก.)<div className="mt-1 flex h-11 items-center justify-center rounded-lg bg-[#5720B7] px-2 text-base font-black tabular-nums text-white">{formatQuantity(row.adjustedQuantity)} กก.</div></div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 rounded-xl bg-[#F3E8FF] p-2 sm:p-3">
                {[["รวมยอดออเดอร์", totals.demand], ["รวมคงเหลือ", totals.remaining], ["รวมของสำรอง", totals.reserve], ["รวมยอดสั่ง", totals.adjusted]].map(([label, value], index) => (
                  <div key={String(label)} className={`min-w-0 rounded-lg px-1 py-2 text-center sm:px-2 ${index === 3 ? "bg-[#5720B7] text-white" : "bg-white/75 text-[#27106B]"}`}>
                    <p className="truncate text-[9px] font-black sm:text-xs">{label}</p><p className="mt-0.5 whitespace-nowrap text-sm font-black tabular-nums sm:text-xl">{formatQuantity(Number(value))}<span className="hidden sm:inline"> กก.</span></p>
                  </div>
                ))}
              </div>
              {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
              {saved ? <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">บันทึกยอดสั่งผลิตแล้ว</p> : null}
            </div>

            <footer className="shrink-0 border-t border-[#E8E4EF] bg-white px-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:flex sm:items-center sm:justify-between sm:px-7">
              <span className="hidden items-center gap-2 text-sm font-semibold text-[#4B5680] sm:inline-flex"><Keyboard className="h-5 w-5" /> Tab เพื่อกรอกช่องถัดไป</span>
              <div className="grid grid-cols-[0.8fr_1.4fr] gap-2 sm:flex">
                <button type="button" onClick={() => setIsOpen(false)} className="h-12 rounded-xl border-2 border-[#5720B7] px-6 text-sm font-black text-[#321471]">ยกเลิก</button>
                <button type="button" onClick={handleSave} disabled={isPending} className="h-12 whitespace-nowrap rounded-xl bg-[#5720B7] px-4 text-sm font-black text-white shadow-sm disabled:opacity-60 sm:px-6">
                  {isPending ? "กำลังบันทึก..." : <><span className="sm:hidden">บันทึกยอดสั่ง</span><span className="hidden sm:inline">บันทึกและใช้ในใบสั่งของ</span></>}
                </button>
              </div>
            </footer>
          </section>
        </div>, document.body) : null}
    </>
  );
}
