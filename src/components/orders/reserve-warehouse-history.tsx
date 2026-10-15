"use client";

import { Fragment, useRef, useState } from "react";
import { Building2, CalendarDays, ChevronDown, History } from "lucide-react";
import { fetchReserveWarehouseHistory } from "@/app/orders/fresh-reserve-stock/history-actions";
import { reserveHistoryDay, reserveHistoryWeek, type WarehouseHistoryPage } from "@/lib/orders/reserve-warehouse-history";
import { ReserveStockDialog } from "./reserve-stock-dialog";
import styles from "./reserve-warehouse-history.module.css";

const quantity = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
const thaiDate = (day: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${day}T12:00:00+07:00`));
export function ReserveWarehouseHistory({ groupId, warehouseName, supplierName, asOf }: { groupId: string; warehouseName: string; supplierName: string; asOf: string }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({ from: reserveHistoryWeek(reserveHistoryDay(asOf)), to: reserveHistoryDay(asOf) });
  const [preset, setPreset] = useState("week");
  const [datesOpen, setDatesOpen] = useState(false);
  const [page, setPage] = useState<WarehouseHistoryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const today = reserveHistoryDay(page?.asOf ?? asOf);
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
    <button type="button" onClick={() => { setOpen(true); void load(range); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#D7C8F2] px-3 text-base font-bold text-[#6D28D9]"><History className="h-5 w-5" />ประวัติรวม</button>
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
        <table className={styles.table} aria-busy={loading}><colgroup><col style={{ width: "55%" }} /><col style={{ width: "15%" }} /><col style={{ width: "15%" }} /><col style={{ width: "15%" }} /></colgroup>
          <thead><tr>{["สินค้า", "รับ", "จ่าย", "เหลือ"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{page?.items.map((item, index) => {
            const day = reserveHistoryDay(item.created_at);
            const waiting = Date.parse(item.effective_at) > Date.parse(page.asOf);
            const label = waiting ? "รอรับเข้า" : item.reason === "adjustment" ? "ปรับคงเหลือ" : item.reason === "remaining" ? "ของเหลือ" : item.reason === "order" ? item.quantity_delta > 0 ? "คืนจากออเดอร์" : "จ่ายตามออเดอร์" : "รับเข้าสต็อค";
            return <Fragment key={item.id}>
              {index === 0 || day !== reserveHistoryDay(page.items[index - 1].created_at) ? <tr className={styles.day}><th colSpan={4} scope="rowgroup">{thaiDate(day)}{day === today ? " · วันนี้" : ""}</th></tr> : null}
              <tr><th scope="row"><span className={styles.name}>{item.productName}</span><span className={styles.meta}>{new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(item.created_at))} · {label}</span></th>
                <td>{item.quantity_delta > 0 ? quantity(item.quantity_delta) : "–"}</td><td>{item.quantity_delta < 0 ? quantity(-item.quantity_delta) : "–"}</td><td className={styles.balance}>{waiting || item.quantity_after === null ? "–" : quantity(item.quantity_after)}</td></tr>
            </Fragment>;
          })}</tbody>
        </table>
        {loading ? <p role="status" className={styles.status}>กำลังโหลดประวัติ…</p> : page && !page.items.length ? <p className={styles.status}>ไม่มีรายการในช่วงวันที่นี้</p> : null}
        <div className={styles.footer}><p>เหลือ = คงเหลือของสินค้านั้นหลังรายการ (กก.)<br />– ในช่องเหลือ = ไม่มีข้อมูลยอดคงเหลือ{page?.items.some(item => Date.parse(item.effective_at) > Date.parse(page.asOf)) ? <><br />ยอดรอรับเข้ายังไม่รวมในคงเหลือ</> : null}</p>
          {page?.cursor ? <button type="button" disabled={loading} onClick={() => void load(range, true)}>โหลดรายการเพิ่มเติม</button> : null}
          {page ? <p className={styles.count}>แสดง {page.items.length.toLocaleString("th-TH")} จาก {page.total.toLocaleString("th-TH")} รายการ</p> : null}
        </div>
      </div>
    </ReserveStockDialog> : null}
  </>;
}
