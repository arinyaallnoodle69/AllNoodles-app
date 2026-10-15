"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, CalendarDays, History, Loader2, Package2, X } from "lucide-react";
import { fetchReserveProductHistory } from "@/app/orders/fresh-reserve-stock/history-actions";
import { bangkokDate, buildReserveHistory, reserveHistoryLabel, type ReserveHistorySnapshot } from "@/lib/orders/reserve-product-history";

type Props = { groupId: string; productId: string; name: string; sku: string; imageUrl?: string | null; warehouseName: string; supplierName: string };
const quantity = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
const dayLabel = (date: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${date}T12:00:00+07:00`));
const timeLabel = (date: string) => new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(new Date(date));
function shiftDay(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }

export function ReserveProductHistory(props: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`ดูประวัติ ${props.name}`} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 px-1 text-sm font-bold text-[#6D28D9] hover:underline"><History className="h-4 w-4" /><span className="hidden min-[360px]:inline">ประวัติ</span></button>
    {open ? createPortal(<ReserveProductHistoryDialog {...props} onClose={() => setOpen(false)} />, document.body) : null}
  </>;
}

export function ReserveProductHistoryDialog({ onClose, ...props }: Props & { onClose: () => void }) {
  const today = bangkokDate(new Date().toISOString());
  const [range, setRange] = useState({ from: shiftDay(today, -29), to: today });
  const [draft, setDraft] = useState(range);
  const [datesOpen, setDatesOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [resource, setResource] = useState<{ key: string; snapshot: ReserveHistorySnapshot | null; error: string | null } | null>(null);
  const requestKey = `${props.groupId}:${props.productId}:${range.from}:${retry}`;
  const loading = resource?.key !== requestKey;
  const snapshot = resource?.snapshot ?? null;
  const error = loading ? null : resource?.error;
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const y = window.scrollY;
    const old = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width, overflow: document.body.style.overflow };
    Object.assign(document.body.style, { position: "fixed", top: `-${y}px`, width: "100%", overflow: "hidden" });
    dialogRef.current?.focus();
    return () => { Object.assign(document.body.style, old); window.scrollTo(0, y); active?.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    let current = true;
    fetchReserveProductHistory({ groupId: props.groupId, productId: props.productId, from: range.from })
      .then(data => { if (current) setResource({ key: requestKey, snapshot: data, error: null }); })
      .catch(reason => { if (current) setResource({ key: requestKey, snapshot: null, error: reason instanceof Error ? reason.message : "โหลดประวัติไม่สำเร็จ" }); });
    return () => { current = false; };
  }, [props.groupId, props.productId, range.from, requestKey]);

  const result = snapshot ? buildReserveHistory(snapshot, range.from, range.to) : null;
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 lg:p-6" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="reserve-history-title" tabIndex={-1}
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key === "Tab") {
          const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length > 0);
          const first = nodes[0], last = nodes.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-[#15154F] outline-none lg:h-auto lg:max-h-[90dvh] lg:max-w-4xl lg:rounded-2xl">
      <header className="flex shrink-0 items-center justify-between bg-[#4A148C] px-3 py-3 text-white lg:px-6 lg:py-4" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <button type="button" onClick={onClose} aria-label="กลับหน้าสต็อค" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"><ChevronLeft className="h-8 w-8" /></button>
        <h2 id="reserve-history-title" className="text-2xl font-bold lg:text-3xl">ประวัติสินค้า</h2>
        <button type="button" onClick={onClose} aria-label="ปิดประวัติสินค้า" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"><X className="h-7 w-7" /></button>
      </header>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 lg:px-8" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-4 py-4 lg:gap-6">
          <div className="relative h-28 w-20 shrink-0 lg:h-32 lg:w-24">{props.imageUrl ? <Image src={props.imageUrl} alt={props.name} fill sizes="96px" className="object-contain" /> : <Package2 className="h-full w-full p-4 text-slate-300" />}</div>
          <div className="min-w-0"><h3 className="text-xl font-bold leading-relaxed lg:text-2xl">{props.name}</h3><p className="mt-1 text-base leading-relaxed text-[#4A5072] lg:text-lg">{props.sku} · {props.warehouseName}</p><p className="mt-1 text-base text-[#4A5072] lg:text-lg">{props.supplierName}</p></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F4EFFF] px-4 py-3 lg:px-6"><span className="text-lg font-bold lg:text-xl">คงเหลือปัจจุบัน</span><strong className="text-4xl font-black tabular-nums text-[#6D28D9] lg:text-5xl">{snapshot ? quantity(snapshot.available) : "—"} <span className="text-xl lg:text-2xl">กก.</span></strong></div>
        <button type="button" onClick={() => { setDraft(range); setDatesOpen(!datesOpen); }} aria-expanded={datesOpen} className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-lg border border-[#CDD2E0] px-3 py-2 text-left text-base lg:text-lg"><CalendarDays className="h-6 w-6 shrink-0" />{dayLabel(range.from)} – {dayLabel(range.to)}</button>
        {datesOpen ? <form className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-[#D7C8F2] p-3" onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); const next = { from: String(values.get("from")), to: String(values.get("to")) }; if (next.from > next.to || next.to > today) return; setRange(next); setDatesOpen(false); }}>
          <label className="min-w-0 text-base">ตั้งแต่<input aria-label="ตั้งแต่วันที่" name="from" type="date" required min="2000-01-01" max={draft.to} value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded border p-1" /></label>
          <label className="min-w-0 text-base">ถึง<input aria-label="ถึงวันที่" name="to" type="date" required min={draft.from} max={today} value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded border p-1" /></label>
          <button className="col-span-2 min-h-11 rounded-lg bg-[#6D28D9] font-bold text-white">แสดงประวัติ</button>
        </form> : null}
        {error ? <div role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-base text-red-700">{error}<button type="button" onClick={() => setRetry(value => value + 1)} className="ml-3 min-h-11 underline">ลองใหม่</button></div> : loading ? <p role="status" className="flex items-center justify-center gap-2 py-12 text-lg"><Loader2 className="h-5 w-5 animate-spin" />กำลังโหลดประวัติ…</p> : result ? <>
          {result.pending.length ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-base">รอรับเข้า {quantity(result.pending.reduce((sum, item) => sum + Number(item.delta), 0))} กก. · ยังไม่รวมในยอดคงเหลือ</p> : null}
          {result.futureLegacy > 0 ? <p className="mt-3 text-base text-[#4A5072]">ยอดคงเหลือหักออเดอร์เดิมล่วงหน้า {quantity(result.futureLegacy)} กก. แล้ว</p> : null}
          <p className="mb-2 mt-4 text-right text-base text-[#4A5072]">หน่วย: กก.</p>
          <table className="w-full table-fixed border-collapse text-base leading-relaxed lg:text-lg">
            <colgroup><col className="w-[18%] lg:w-[13%]" /><col className="w-[31%] lg:w-[42%]" /><col className="w-[17%] lg:w-[15%]" /><col className="w-[17%] lg:w-[15%]" /><col className="w-[17%] lg:w-[15%]" /></colgroup>
            <thead className="bg-[#F0E9FF] text-[#4A148C]"><tr><th colSpan={2} scope="col" className="border border-[#DADDE7] px-2 py-2 text-left font-bold">รายการ</th>{["รับ", "จ่าย", "เหลือ"].map(label => <th key={label} scope="col" className="border border-[#DADDE7] px-1 py-2 text-center font-bold">{label}</th>)}</tr></thead>
            {result.days.map(day => <tbody key={day.date}>
              <tr><th colSpan={5} scope="rowgroup" className="border border-[#DADDE7] bg-[#F0E9FF] px-2 py-2 text-left font-bold">{dayLabel(day.date)}{day.date === today ? <span className="text-[#6D28D9]"> · วันนี้</span> : null}</th></tr>
              <tr><td className="border border-[#DADDE7] px-1 py-2 text-center text-[#4A5072]">–</td><th scope="row" className="border border-[#DADDE7] px-2 py-2 text-left font-normal">ยกยอดมา</th><td className="border border-[#DADDE7] text-center">–</td><td className="border border-[#DADDE7] text-center">–</td><td className="break-words border border-[#DADDE7] px-1 text-center font-bold tabular-nums">{quantity(day.opening)}</td></tr>
              {day.rows.map((row, index) => <tr key={row.id}>
                <td className="border border-[#DADDE7] px-1 py-2 text-center text-[15px] text-[#4A5072] lg:text-base">{row.reason === "legacy" ? "–" : timeLabel(row.at)}</td>
                <th scope="row" className="break-words border border-[#DADDE7] px-2 py-2 text-left font-normal">{reserveHistoryLabel(row)}{row.reason === "legacy" ? <span className="block text-sm text-[#4A5072]">ยอดออเดอร์เดิม</span> : null}{row.notes && row.reason === "adjustment" ? <span className="block text-sm text-[#4A5072]">{row.notes}</span> : null}</th>
                <td className="break-words border border-[#DADDE7] px-1 py-2 text-center font-bold tabular-nums">{row.delta > 0 ? quantity(row.delta) : "–"}</td><td className="break-words border border-[#DADDE7] px-1 py-2 text-center font-bold tabular-nums">{row.delta < 0 ? quantity(-row.delta) : "–"}</td>
                <td className={`break-words border border-[#DADDE7] px-1 py-2 text-center font-bold tabular-nums ${index === day.rows.length - 1 && day === result.days.at(-1) ? "bg-[#F0E9FF] text-[#6D28D9]" : ""}`}>{quantity(row.remaining)}</td>
              </tr>)}
            </tbody>)}
          </table>
          {result.days.every(day => !day.rows.length) ? <p role="status" className="py-4 text-center text-base text-[#4A5072]">ไม่มีรายการเคลื่อนไหวในช่วงวันที่เลือก</p> : null}
          <button type="button" disabled={range.from <= snapshot!.startDate} onClick={() => setRange(value => ({ ...value, from: shiftDay(value.from, -30) < snapshot!.startDate ? snapshot!.startDate : shiftDay(value.from, -30) }))} className="mt-6 min-h-12 w-full rounded-xl border border-[#6D28D9] px-4 py-3 text-lg font-bold text-[#6D28D9] disabled:opacity-40">ดูรายการก่อนหน้า</button>
        </> : null}
      </div>
    </div>
  </div>;
}
