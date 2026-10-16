"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronDown, CalendarDays, History, Info, Loader2, Minus, Plus, X } from "lucide-react";
import { fetchReserveProductHistory } from "@/app/orders/fresh-reserve-stock/history-actions";
import { bangkokDate, buildReserveHistory, reserveHistoryLabel, type ReserveHistoryDay, type ReserveHistorySnapshot } from "@/lib/orders/reserve-product-history";

import styles from "./reserve-product-history.module.css";

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
          const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')].filter(node => node.getClientRects().length > 0);
          const first = nodes[0], last = nodes.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-[#15154F] outline-none lg:h-auto lg:max-h-[90dvh] lg:max-w-4xl lg:rounded-2xl">
      <header className={styles.header}>
        <button type="button" onClick={onClose} aria-label="กลับหน้าสต็อค" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"><ChevronLeft className="h-8 w-8" /></button>
        <h2 id="reserve-history-title" className="text-2xl font-bold lg:text-3xl">ประวัติสินค้า</h2>
        <button type="button" onClick={onClose} aria-label="ปิดประวัติสินค้า" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"><X className="h-7 w-7" /></button>
      </header>
      <div ref={scrollRef} className={styles.scroll}>
        <div className={styles.identity}>
          <div><h3>{props.name}</h3><p>{props.sku} · {props.warehouseName.replace(/^คลัง/, "")}</p></div>
          <div className={styles.balance}><p>คงเหลือปัจจุบัน</p><strong>{snapshot ? quantity(snapshot.available) : "—"} <span>กก.</span></strong></div>
        </div>
        <button type="button" onClick={() => { setDraft(range); setDatesOpen(!datesOpen); }} aria-expanded={datesOpen} className={styles.range}><CalendarDays className="h-5 w-5" />{new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).formatRange(new Date(range.from + "T12:00:00+07:00"), new Date(range.to + "T12:00:00+07:00"))}<ChevronDown className="h-5 w-5" /></button>
        {datesOpen ? <form className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-[#D7C8F2] p-3" onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); const next = { from: String(values.get("from")), to: String(values.get("to")) }; if (next.from > next.to || next.to > today) return; setRange(next); setDatesOpen(false); }}>
          <label className="min-w-0 text-base">ตั้งแต่<input aria-label="ตั้งแต่วันที่" name="from" type="date" required min="2000-01-01" max={draft.to} value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded border p-1" /></label>
          <label className="min-w-0 text-base">ถึง<input aria-label="ถึงวันที่" name="to" type="date" required min={draft.from} max={today} value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded border p-1" /></label>
          <button className="col-span-2 min-h-11 rounded-lg bg-[#6D28D9] font-bold text-white">แสดงประวัติ</button>
        </form> : null}
        {error ? <div role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-base text-red-700">{error}<button type="button" onClick={() => setRetry(value => value + 1)} className="ml-3 min-h-11 underline">ลองใหม่</button></div> : loading ? <p role="status" className="flex items-center justify-center gap-2 py-12 text-lg"><Loader2 className="h-5 w-5 animate-spin" />กำลังโหลดประวัติ…</p> : result ? <>
          {result.pending.length ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-base">รอรับเข้า {quantity(result.pending.reduce((sum, item) => sum + Number(item.delta), 0))} กก. · ยังไม่รวมในยอดคงเหลือ</p> : null}
          {result.futureLegacy > 0 ? <p className="mt-3 text-base text-[#4A5072]">ยอดคงเหลือหักออเดอร์เดิมล่วงหน้า {quantity(result.futureLegacy)} กก. แล้ว</p> : null}
          <ReserveProductHistoryTable days={result.days} today={today} />
          <p className={styles.note}><Info size={18} /><span>รับ = เข้าออฟฟิศ · ปรับ = ตรวจนับ/แก้ยอด · หน่วย กก.<br />เครื่องหมาย + ในช่องจ่าย = คืนสำรอง</span></p>
          {result.days.every(day => !day.rows.length) ? <p role="status" className="py-4 text-center text-base text-[#4A5072]">ไม่มีรายการเคลื่อนไหวในช่วงวันที่เลือก</p> : null}
          <button type="button" disabled={range.from <= snapshot!.startDate} onClick={() => setRange(value => ({ ...value, from: shiftDay(value.from, -30) < snapshot!.startDate ? snapshot!.startDate : shiftDay(value.from, -30) }))} className={styles.more}>ดูรายการก่อนหน้า</button>
        </> : null}
      </div>
    </div>
  </div>;
}

export function ReserveProductHistoryTable({ days, today }: { days: ReserveHistoryDay[]; today: string }) {
  return <table className={styles.table} aria-label="รายการเคลื่อนไหวสินค้า หน่วยกิโลกรัม">
    <colgroup><col style={{ width: "40%" }} /><col style={{ width: "14%" }} /><col style={{ width: "14%" }} /><col style={{ width: "16%" }} /><col style={{ width: "16%" }} /></colgroup>
    <thead><tr><th scope="col">รายการ</th><th scope="col" className={styles.receive}><span className={styles.amount}><Plus size={12} aria-hidden="true" />รับ</span></th><th scope="col" className={styles.issue}><span className={styles.amount}><Minus size={12} aria-hidden="true" />จ่าย</span></th><th scope="col" className={styles.adjust}>ปรับ</th><th scope="col">เหลือ</th></tr></thead>
    {days.map(day => <tbody key={day.date}>
      <tr><th colSpan={5} scope="rowgroup" className={styles.day}>{dayLabel(day.date)}{day.date === today ? " · วันนี้" : ""}</th></tr>
      <tr><th scope="row">ของเหลือ</th><td>–</td><td>–</td><td>–</td><td className={styles.remaining}>{quantity(day.opening)}</td></tr>
      {day.rows.map((row, index) => {
        const receipt = row.reason === "office" && row.delta > 0;
        const adjustment = row.reason === "adjustment" || (row.reason === "office" && row.delta < 0);
        const label = row.reason === "adjustment" ? row.notes?.includes("ปรับฐาน") ? "แก้ฐาน" : "ตรวจนับ" : reserveHistoryLabel(row);
        return <tr key={row.id}>
          <th scope="row"><div className={styles.description}><span>{label}</span>{row.notes && adjustment ? <details className={styles.details}><summary aria-label={"ดูเหตุผล " + label}><Info size={17} /></summary><div>{row.notes}</div></details> : null}</div><span className={styles.time}>{row.reason === "legacy" ? "ยอดออเดอร์เดิม" : timeLabel(row.at)}</span></th>
          <td className={receipt ? styles.receive : undefined}>{receipt ? <span className={styles.amount} aria-label={"+" + quantity(row.delta)}><Plus size={12} aria-hidden="true" />{quantity(row.delta)}</span> : "–"}</td>
          <td className={!receipt && !adjustment && row.delta !== 0 ? styles.issue : undefined}>{!receipt && !adjustment && row.delta !== 0 ? <span className={styles.amount} aria-label={(row.delta < 0 ? "−" : "+") + quantity(Math.abs(row.delta))}>{row.delta < 0 ? <Minus size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}{quantity(Math.abs(row.delta))}</span> : "–"}</td>
          <td className={styles.adjust}>{adjustment && row.delta !== 0 ? (row.delta > 0 ? "+" : "−") + quantity(Math.abs(row.delta)) : "–"}</td>
          <td className={`${styles.remaining} ${index === day.rows.length - 1 && day === days.at(-1) ? styles.latest : ""}`}>{quantity(row.remaining)}</td>
        </tr>;
      })}
    </tbody>)}
  </table>;
}
