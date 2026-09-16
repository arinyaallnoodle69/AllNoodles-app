"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, CircleCheck, FileText, PackageOpen, Search } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { useMobileSearch } from "@/components/mobile-search/mobile-search-context";
import type { getDailyMovementReport } from "@/lib/stock/daily-movement-data";
import { aggregateDailyMovementRows } from "@/lib/stock/daily-movement-report";

type Row = Awaited<ReturnType<typeof getDailyMovementReport>>["rows"][number];
type RangeRow = Omit<Row, "date"> & { from: string; to: string };
type WarehouseFilter = { id: string; name: string };

const quantity = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" })
    .format(new Date(`${date}T12:00:00+07:00`));
}

function dateTimeLabel(timestamp: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })
    .format(new Date(timestamp));
}

const rowKey = (row: RangeRow) => `${row.warehouseId}:${row.productId}`;

function movementLabel(type: string) {
  if (type === "receipt") return "รับเข้า";
  if (type === "issue") return "ขาย/เบิก";
  if (type === "return") return "คืนจากออเดอร์";
  if (type === "adjustment") return "ปรับสต็อก";
  return type;
}

function movementDescription(movement: Row["movements"][number]) {
  const repaired = movement.document?.startsWith("REPAIR-") || movement.reason?.includes("เติมประวัติ Movement");
  if (repaired) return "ปรับประวัติย้อนหลัง";
  return [movement.document, movement.store ?? movement.reason].filter(Boolean).join(" · ") || "—";
}

function MovementDetails({ row }: { row: RangeRow }) {
  return (
    <div className="animate-in slide-in-from-top-2 box-border w-0 min-w-full bg-[#f8f5ff] px-4 py-3 duration-200">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-[#4A148C]">Stock Card · {row.sku} {row.name}</h3>
          <p className="text-xs text-slate-500">{dayLabel(row.from)} – {dayLabel(row.to)} · {row.movements.length.toLocaleString("th-TH")} รายการ</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-slate-700">คงเหลือ {quantity(row.closing)} {row.unit}</span>
      </div>
      <div className="max-w-full overflow-x-auto rounded-lg border border-[#ddd4ef] bg-white">
        <table className="w-full table-fixed text-[11px] xl:text-xs [&_th]:whitespace-nowrap [&_td]:break-words [&_td]:[overflow-wrap:anywhere]">
          <colgroup>
            <col className="w-[17%]" /><col className="w-[15%]" /><col className="w-[38%]" />
            <col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" />
          </colgroup>
          <thead className="bg-[#eee8f8] text-slate-700">
            <tr>
              <th className="px-2 py-2 text-left">วันที่–เวลา</th>
              <th className="border-l border-[#ddd4ef] px-2 py-2 text-left">ประเภท</th>
              <th className="border-l border-[#ddd4ef] px-3 py-2 text-left">เอกสาร / ร้านค้า / เหตุผล</th>
              <th className="border-l border-[#ddd4ef] px-2 py-2 text-right">ก่อน</th>
              <th className="border-l border-[#ddd4ef] px-2 py-2 text-right">เปลี่ยนแปลง</th>
              <th className="border-l border-[#ddd4ef] px-2 py-2 text-right">คงเหลือ</th>
            </tr>
          </thead>
          <tbody>{row.movements.map((movement) => (
            <tr key={movement.id} className="border-t border-[#ebe7f2] text-slate-800">
              <td className="px-2 py-2 tabular-nums">{dateTimeLabel(movement.occurredAt)}</td>
              <td className="border-l border-[#ebe7f2] px-2 py-2 font-bold">{movementLabel(movement.type)}</td>
              <td className="border-l border-[#ebe7f2] px-3 py-2">{movementDescription(movement)}</td>
              <td className="border-l border-[#ebe7f2] px-3 py-2 text-right tabular-nums">{quantity(movement.before)}</td>
              <td className={`border-l border-[#ebe7f2] px-3 py-2 text-right font-black tabular-nums ${movement.delta < 0 ? "text-rose-600" : "text-emerald-700"}`}>{movement.delta > 0 ? "+" : ""}{quantity(movement.delta)}</td>
              <td className="border-l border-[#ebe7f2] px-3 py-2 text-right font-bold tabular-nums">{quantity(movement.after)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function MobileMovementDetails({ row }: { row: RangeRow }) {
  return (
    <section className="animate-in slide-in-from-top-2 overflow-hidden rounded-2xl border border-purple-200 bg-white shadow-sm duration-200">
      <header className="flex items-start justify-between gap-3 bg-[#f3e8ff] px-4 py-3">
        <div><h3 className="text-sm font-black text-[#4A148C]">Stock Card · {row.sku}</h3><p className="mt-0.5 text-[11px] font-semibold text-slate-600">{dayLabel(row.from)} – {dayLabel(row.to)}</p></div>
        <span className="whitespace-nowrap text-xs font-black text-[#4A148C]">{row.movements.length.toLocaleString("th-TH")} รายการ</span>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_76px_72px] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-500">
        <span>วันที่–เวลา · รายการ</span><span className="text-right">เปลี่ยนแปลง</span><span className="text-right">คงเหลือ</span>
      </div>
      <div className="divide-y divide-slate-100 px-3">{row.movements.map((movement) => (
        <article key={movement.id} className="grid grid-cols-[minmax(0,1fr)_76px_72px] items-center gap-1 py-2.5">
          <div className="min-w-0 pr-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"><time className="whitespace-nowrap text-[11px] font-bold tabular-nums text-slate-600">{dateTimeLabel(movement.occurredAt)}</time><span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-black ${movement.delta < 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{movementLabel(movement.type)}</span></div>
            <p className="mt-1 break-words text-[11px] leading-4 text-slate-600">{movementDescription(movement)}</p>
          </div>
          <strong className={`text-right text-sm font-black tabular-nums ${movement.delta < 0 ? "text-rose-600" : "text-emerald-700"}`}>{movement.delta > 0 ? "+" : ""}{quantity(movement.delta)}</strong>
          <strong className="text-right text-sm font-black tabular-nums text-slate-900">{quantity(movement.after)}</strong>
        </article>
      ))}</div>
    </section>
  );
}

export function DailyStockReportClient({ rows, from, to, warehouseId, productId, warehouses }: { rows: Row[]; from: string; to: string; warehouseId: string; productId: string; warehouses: WarehouseFilter[] }) {
  const { close: closeMobileSearch } = useMobileSearch();
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState(productId);
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const rangeRows = useMemo(() => aggregateDailyMovementRows(rows) as RangeRow[], [rows]);
  const products = useMemo(() => Array.from(new Map(rangeRows.map((row) => [row.productId, { id: row.productId, sku: row.sku, name: row.name }])).values()), [rangeRows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th-TH");
    return rangeRows.filter((row) => (!product || row.productId === product) && (!query || row.sku.toLocaleLowerCase("th-TH").includes(query) || row.name.toLocaleLowerCase("th-TH").includes(query)));
  }, [rangeRows, search, product]);
  const rowsPerPage = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const pageRows = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  return (
    <section aria-label="รายงานความเคลื่อนไหวสต็อกตามสินค้า">
      <MobileSearchDrawer title="กรองความเคลื่อนไหวสต็อก">
        <form method="get" onSubmit={closeMobileSearch} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0 text-xs font-black text-slate-600">จากวันที่<input name="from" type="date" defaultValue={from} className="mt-1 h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm font-bold text-slate-900 outline-none focus:border-[#633ab1]" /></label>
            <label className="min-w-0 text-xs font-black text-slate-600">ถึงวันที่<input name="to" type="date" defaultValue={to} className="mt-1 h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm font-bold text-slate-900 outline-none focus:border-[#633ab1]" /></label>
          </div>
          <label className="block text-xs font-black text-slate-600">คลังสินค้า<select name="warehouse" defaultValue={warehouseId} className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#633ab1]">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
          <label className="block text-xs font-black text-slate-600">สินค้า<select name="product" value={product} onChange={(event) => setProduct(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#633ab1]"><option value="">สินค้าทั้งหมด</option>{products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></label>
          <button type="submit" className="h-12 w-full rounded-xl bg-[#4A148C] text-sm font-black text-white shadow-lg active:scale-[0.99]">แสดงผล</button>
        </form>
      </MobileSearchDrawer>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-black text-[#30135f] sm:text-2xl">สรุปตามสินค้า</h2><p className="mt-0.5 text-xs font-semibold text-slate-500">{dayLabel(from)} – {dayLabel(to)}</p></div>
        <div className="hidden w-full gap-2 lg:flex lg:w-auto">
          <label className="relative block min-w-0 flex-1 sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><span className="sr-only">ค้นหารหัสหรือชื่อสินค้า</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setOpen(null); }} placeholder="ค้นหารหัสสินค้า หรือชื่อสินค้า..." className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-[#633ab1]" /></label>
          <label className="min-w-0 flex-1 sm:w-64"><span className="sr-only">เลือกสินค้า</span><select value={product} onChange={(event) => { setProduct(event.target.value); setPage(1); setOpen(null); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#633ab1]"><option value="">สินค้าทั้งหมด</option>{products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></label>
        </div>
      </div>

      <div className="hidden w-full min-w-0 max-w-full overflow-x-auto rounded-lg border border-slate-200 md:block">
        <table className="w-full border-collapse text-[11px] xl:text-xs 2xl:text-[13px] [&_td]:[overflow-wrap:anywhere]">
          <thead className="bg-[#eeeaf5] text-[#302344]"><tr>{["รหัสสินค้า", "ชื่อสินค้า", "คลัง", "หน่วย", "ยกยอด", "รับเข้า", "ขาย/เบิก", "คืนจากออเดอร์", "ปรับสต็อก", "คงเหลือ", "Stock Card"].map((label) => <th key={label} className="h-11 whitespace-nowrap border-b border-r border-slate-200 px-2 text-left font-black last:border-r-0">{label}</th>)}</tr></thead>
          <tbody>{pageRows.map((row) => {
            const key = rowKey(row);
            const expanded = open === key;
            return <Fragment key={key}>
              <tr className={expanded ? "bg-[#f2edff] text-[#402273] outline outline-1 -outline-offset-1 outline-[#8b5cf6]" : "bg-white text-slate-800 hover:bg-slate-50"}>
                <td className="whitespace-nowrap border-b border-r border-slate-200 px-2 py-2.5 font-black">{row.sku}</td><td className="border-b border-r border-slate-200 px-2 py-2.5 font-semibold">{row.name}</td><td className="whitespace-nowrap border-b border-r border-slate-200 px-2 py-2.5">{row.warehouseName}</td><td className="whitespace-nowrap border-b border-r border-slate-200 px-2 py-2.5">{row.unit}</td>
                <td className="border-b border-r border-slate-200 px-2 py-2.5 text-right tabular-nums">{quantity(row.opening)}</td><td className="border-b border-r border-slate-200 px-2 py-2.5 text-right font-bold tabular-nums text-emerald-700">{row.received ? `+${quantity(row.received)}` : "0"}</td><td className="border-b border-r border-slate-200 px-2 py-2.5 text-right font-bold tabular-nums text-rose-600">{row.sold ? `-${quantity(row.sold)}` : "0"}</td><td className="border-b border-r border-slate-200 px-2 py-2.5 text-right font-bold tabular-nums text-emerald-700">{row.returned ? `+${quantity(row.returned)}` : "0"}</td><td className="border-b border-r border-slate-200 px-2 py-2.5 text-right tabular-nums">{row.adjusted > 0 ? "+" : ""}{quantity(row.adjusted)}</td><td className="border-b border-r border-slate-200 px-2 py-2.5 text-right font-black tabular-nums">{quantity(row.closing)}</td>
                <td className="border-b border-slate-200 p-1.5 text-center"><button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : key)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-purple-200 bg-white px-2 font-black text-[#5B12A9] hover:bg-purple-50 focus-visible:outline-2 focus-visible:outline-[#633ab1]"><FileText className="h-4 w-4" /><ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} /></button></td>
              </tr>
              {expanded ? <tr><td colSpan={11} className="border-b border-[#d8cff0] p-0"><MovementDetails row={row} /></td></tr> : null}
            </Fragment>;
          })}</tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">{pageRows.map((row) => {
        const key = rowKey(row);
        const expanded = open === key;
        return <Fragment key={key}>
          <article className={`overflow-hidden rounded-2xl border bg-white p-3 shadow-sm ${expanded ? "border-[#8b5cf6]" : "border-slate-200"}`}>
            <div className="grid grid-cols-[48px_minmax(0,1fr)] items-start gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-[#f4eaff] text-[#5B21B6]"><PackageOpen className="h-7 w-7" /></span><div className="min-w-0"><div className="flex items-start justify-between gap-2"><strong className="text-xl font-black leading-6 text-slate-950">{row.sku}</strong><span className={`inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[10px] font-bold ${row.other !== 0 || row.mismatch ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}><CircleCheck className="h-3 w-3" />{row.other !== 0 || row.mismatch ? "ตรวจสอบ" : "สินค้าปกติ"}</span></div><span className="block text-sm font-black leading-5 text-slate-950">{row.name}</span><span className="mt-1 block text-[11px] font-semibold text-slate-500">{row.warehouseName} · {dayLabel(row.from)} – {dayLabel(row.to)}</span></div></div>
            <div className="mt-3 rounded-xl bg-[#f5ecff] px-2 py-2.5"><div className="grid grid-cols-[1fr_auto_1fr] items-center text-center"><div><span className="block text-[11px] text-slate-600">ยกยอด</span><strong className="block whitespace-nowrap text-lg font-black tabular-nums">{quantity(row.opening)}</strong></div><ChevronRight className="h-5 w-5 text-slate-400" /><div className="border-l border-purple-200"><span className="block text-[11px] text-slate-600">คงเหลือ</span><strong className="block whitespace-nowrap text-lg font-black tabular-nums text-emerald-700">{quantity(row.closing)} {row.unit}</strong></div></div><div className="mt-2 grid grid-cols-4 divide-x divide-purple-100 border-t border-purple-100 pt-2 text-center">{[["รับเข้า", row.received, "text-emerald-700", "+"], ["ขาย", row.sold, "text-rose-600", "-"], ["คืน", row.returned, "text-emerald-700", "+"], ["ปรับ", row.adjusted, "text-slate-900", row.adjusted > 0 ? "+" : ""]].map(([label, value, color, sign]) => <div key={String(label)} className="min-w-0 px-0.5"><span className="block text-[9px] font-bold text-slate-500">{label}</span><strong className={`block whitespace-nowrap text-xs font-black tabular-nums ${color}`}>{sign}{quantity(Number(value))}</strong></div>)}</div></div>
            <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : key)} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl bg-[#5B12A9] px-4 text-left text-xs font-black text-white"><span className="flex items-center gap-2"><FileText className="h-4 w-4" />ดู Stock Card · {row.movements.length.toLocaleString("th-TH")} รายการ</span><ChevronDown className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`} /></button>
          </article>
          {expanded ? <MobileMovementDetails row={row} /> : null}
        </Fragment>;
      })}</div>

      {filtered.length === 0 ? <p className="rounded-lg border border-slate-200 p-8 text-center text-slate-600">ไม่พบสินค้าเคลื่อนไหวในช่วงวันที่เลือก</p> : null}
      <div className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold text-slate-600 sm:text-sm"><span>แสดง {pageRows.length} จาก {filtered.length} รายการสินค้า</span>{pageCount > 1 ? <div className="flex items-center gap-1"><button type="button" disabled={page <= 1} onClick={() => { setPage(page - 1); setOpen(null); }} aria-label="หน้าก่อน" className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span className="px-2">{page}/{pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => { setPage(page + 1); setOpen(null); }} aria-label="หน้าถัดไป" className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div> : null}</div>
    </section>
  );
}
