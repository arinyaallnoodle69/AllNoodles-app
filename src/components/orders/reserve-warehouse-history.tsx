"use client";

import { useRef, useState } from "react";
import { Building2, CalendarDays, ChevronDown, History } from "lucide-react";
import { fetchReserveWarehouseHistory } from "@/app/orders/fresh-reserve-stock/history-actions";
import { reserveHistoryDay, reserveHistoryWeek, type WarehouseHistoryPage } from "@/lib/orders/reserve-warehouse-history";
import { ReserveStockDialog } from "./reserve-stock-dialog";
import { ReserveMovementList } from "./reserve-recent-activity";
import styles from "./reserve-warehouse-history.module.css";

export function ReserveWarehouseHistory({ groupId, warehouseName, supplierName, asOf, label = "ประวัติรวม" }: { groupId: string; warehouseName: string; supplierName: string; asOf: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({ from: reserveHistoryWeek(reserveHistoryDay(asOf)), to: reserveHistoryDay(asOf) });
  const [preset, setPreset] = useState("week");
  const [datesOpen, setDatesOpen] = useState(false);
  const [page, setPage] = useState<WarehouseHistoryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const rangeLabel = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).formatRange(new Date(`${range.from}T12:00:00+07:00`), new Date(`${range.to}T12:00:00+07:00`));
  async function load(next: typeof range, more = false) {
    const id = ++request.current;
    setLoading(true); setError("");
    if (!more) setPage(null);
    try {
      const result = await fetchReserveWarehouseHistory({ groupId, ...next, ...(more && page ? { asOf: page.asOf, cursor: page.cursor } : {}) });
      if (id !== request.current) return;
      setPage(previous => more && previous ? { ...result, items: [...previous.items, ...result.items] } : result);
    } catch (e) { if (id === request.current) setError(e instanceof Error ? e.message : "โหลดประวัติไม่สำเร็จ"); }
    finally { if (id === request.current) setLoading(false); }
  }
  function choose(value: "today" | "week") {
    const date = reserveHistoryDay(new Date().toISOString());
    const next = { from: value === "today" ? date : reserveHistoryWeek(date), to: date };
    setPreset(value); setRange(next); setDatesOpen(false); void load(next);
  }
  return <>
    <button type="button" onClick={() => { setOpen(true); void load(range); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#D7C8F2] px-3 text-base font-bold text-[#6D28D9]"><History className="h-5 w-5" />{label}</button>
    {open ? <ReserveStockDialog title="ประวัติรวม" ledger onClose={() => { request.current++; setOpen(false); }}>
      <div className={styles.history}>
        <div className={styles.filters}>
          <p className={styles.warehouse}><Building2 size={20} aria-hidden="true" />{warehouseName.replace(/^คลัง/, "")} · {supplierName}</p>
          <div className={styles.presets}>
            <button type="button" aria-pressed={preset === "today"} onClick={() => choose("today")}>วันนี้</button>
            <button type="button" aria-pressed={preset === "week"} onClick={() => choose("week")}>7 วัน</button>
            <button type="button" aria-expanded={datesOpen} aria-pressed={preset === "custom"} onClick={() => setDatesOpen(value => !value)}>เลือกวันที่</button>
            <button type="button" className={styles.range} aria-label="เลือกช่วงวันที่" aria-expanded={datesOpen} onClick={() => setDatesOpen(value => !value)}><CalendarDays size={18} />{rangeLabel}<ChevronDown size={14} /></button>
          </div>
          {datesOpen ? <form className={styles.dates} onSubmit={event => {
            event.preventDefault(); const data = new FormData(event.currentTarget);
            const next = { from: String(data.get("from")), to: String(data.get("to")) };
            if (next.from > next.to) { setError("วันเริ่มต้นต้องไม่เกินวันสิ้นสุด"); return; }
            setRange(next); setPreset("custom"); setDatesOpen(false); void load(next);
          }}><label>ตั้งแต่<input type="date" name="from" required defaultValue={range.from} min="2000-01-01" max="2100-12-31" /></label><label>ถึง<input type="date" name="to" required defaultValue={range.to} min="2000-01-01" max="2100-12-31" /></label><button type="submit">แสดงรายการ</button></form> : null}
        </div>
        {error ? <div role="alert" className={styles.status}>{error}<button type="button" disabled={loading} onClick={() => void load(range, Boolean(page))}>ลองใหม่</button></div> : null}
        <ReserveMovementList items={(page?.items ?? []).map(item => ({ ...item, product_id: "", waiting: item.waiting ?? Date.parse(item.effective_at) > Date.parse(page!.asOf), at: item.at ?? item.created_at, before: item.before ?? null, after: item.after ?? item.quantity_after }))} />
        {loading ? <p role="status" className={styles.status}>กำลังโหลดประวัติ…</p> : page && !page.items.length ? <p className={styles.status}>ไม่มีรายการในช่วงวันที่นี้</p> : null}
        <div className={styles.footer}><p>เหลือ = คงเหลือของสินค้านั้นหลังรายการ (กก.)<br />– = ไม่มีข้อมูลยอดคงเหลือ{page?.items.some(item => item.waiting) ? <><br />รอรับเข้า ยังไม่รวมในยอดใช้ได้ ณ เวลานั้น</> : null}</p>
          {page?.cursor ? <button type="button" disabled={loading} onClick={() => void load(range, true)}>โหลดรายการเพิ่มเติม</button> : null}
          {page ? <p className={styles.count}>แสดง {page.items.length.toLocaleString("th-TH")} จาก {page.total.toLocaleString("th-TH")} รายการ</p> : null}
        </div>
      </div>
    </ReserveStockDialog> : null}
  </>;
}
