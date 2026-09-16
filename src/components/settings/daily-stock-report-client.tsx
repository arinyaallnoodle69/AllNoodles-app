"use client";

import { Fragment, useMemo, useState } from "react";
import { ChartNoAxesColumn, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, List, PackageOpen, Search } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { useMobileSearch } from "@/components/mobile-search/mobile-search-context";
import type { getDailyMovementReport } from "@/lib/stock/daily-movement-data";

type Row = Awaited<ReturnType<typeof getDailyMovementReport>>["rows"][number];

function quantity(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok",
  }).format(new Date(`${date}T12:00:00+07:00`));
}

function rowKey(row: Row) {
  return `${row.warehouseId}:${row.productId}:${row.date}`;
}

function timeLabel(timestamp: string) {
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(timestamp));
}

function movementLabel(type: string) {
  if (type === "receipt") return "รับเข้า";
  if (type === "issue") return "ขาย/เบิก";
  if (type === "return") return "คืนจากออเดอร์";
  if (type === "adjustment") return "ปรับสต็อก";
  return type;
}

function mobileMovementLabel(type: string) {
  if (type === "receipt") return "รับเข้า";
  if (type === "issue") return "ขาย";
  if (type === "return") return "คืน";
  if (type === "adjustment") return "ปรับ";
  return type;
}

function isRepairMovement(movement: Row["movements"][number]) {
  return movement.document?.startsWith("REPAIR-")
    || movement.reason?.includes("เติมประวัติ Movement");
}

function mobileMovementDescription(movement: Row["movements"][number]) {
  if (isRepairMovement(movement)) {
    return {
      document: "ปรับประวัติย้อนหลัง",
      detail: "เติมรายการที่ขาดให้ยอดต่อเนื่อง · ไม่เปลี่ยนสต็อกปัจจุบัน",
    };
  }
  return {
    document: movement.document ?? "ไม่มีเลขเอกสาร",
    detail: movement.store ?? movement.reason ?? "ไม่มีรายละเอียด",
  };
}

function MovementDetails({ row }: { row: Row }) {
  return (
    <div className="bg-[#f7f5ff] px-4 py-2">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h3 className="truncate text-sm font-bold text-[#402273]">รายการเคลื่อนไหว วันที่ {dayLabel(row.date)}</h3>
        <span className="shrink-0 text-xs font-semibold text-slate-600">สุทธิ {row.net > 0 ? "+" : ""}{quantity(row.net)} {row.unit}</span>
      </div>
      <div className="overflow-x-auto rounded-md border border-[#ddd8ed] bg-white">
        <table className="w-full min-w-[780px] table-fixed text-xs">
          <thead className="bg-[#eef0f7] text-slate-700">
            <tr><th className="w-16 px-3 py-1.5 text-left">เวลา</th><th className="w-28 border-l border-[#ddd8ed] px-3 py-1.5 text-left">ประเภท</th><th className="w-36 border-l border-[#ddd8ed] px-3 py-1.5 text-left">เอกสาร</th><th className="border-l border-[#ddd8ed] px-3 py-1.5 text-left">ร้านค้า / เหตุผล</th><th className="w-24 border-l border-[#ddd8ed] px-3 py-1.5 text-right">ก่อน</th><th className="w-24 border-l border-[#ddd8ed] px-3 py-1.5 text-right">เปลี่ยน</th><th className="w-24 border-l border-[#ddd8ed] px-3 py-1.5 text-right">หลัง</th></tr>
          </thead>
          <tbody>
            {row.movements.map((movement) => (
              <tr key={movement.id} className="border-t border-[#e7e4ef] text-slate-800">
                <td className="px-3 py-1.5 tabular-nums">{timeLabel(movement.occurredAt)}</td>
                <td className="border-l border-[#e7e4ef] px-3 py-1.5 font-semibold">{movementLabel(movement.type)}</td>
                <td className="truncate border-l border-[#e7e4ef] px-3 py-1.5" title={movement.document ?? undefined}>{movement.document ?? "—"}</td>
                <td className="truncate border-l border-[#e7e4ef] px-3 py-1.5" title={movement.store ?? movement.reason ?? undefined}>{movement.store ?? movement.reason ?? "—"}</td>
                <td className="border-l border-[#e7e4ef] px-3 py-1.5 text-right tabular-nums">{quantity(movement.before)}</td>
                <td className={`border-l border-[#e7e4ef] px-3 py-1.5 text-right font-bold tabular-nums ${movement.delta < 0 ? "text-rose-700" : "text-emerald-700"}`}>{movement.delta > 0 ? "+" : ""}{quantity(movement.delta)}</td>
                <td className="border-l border-[#e7e4ef] px-3 py-1.5 text-right font-semibold tabular-nums">{quantity(movement.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MobileMovementDetails({ row }: { row: Row }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm">
      <header className="bg-[#f4eaff] px-4 py-3">
        <h3 className="text-sm font-black leading-5 text-[#4A148C]">รายการเคลื่อนไหวสินค้า {row.sku}</h3>
        <span className="mt-0.5 block text-xs font-semibold text-slate-600">วันที่ {dayLabel(row.date)} · {row.movements.length.toLocaleString("th-TH")} รายการ</span>
      </header>
      <div className="divide-y divide-slate-100 px-3 pb-1">
        {row.movements.map((movement) => (
          <article key={movement.id} className="py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <time className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-slate-600">{timeLabel(movement.occurredAt)}</time>
              <span className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-black ${movement.delta < 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{mobileMovementLabel(movement.type)}</span>
              <span className="ml-auto text-right">
                <strong className={`block shrink-0 whitespace-nowrap text-sm font-black tabular-nums ${movement.delta < 0 ? "text-rose-600" : "text-emerald-700"}`}>{movement.delta > 0 ? "+" : ""}{quantity(movement.delta)} {row.unit}</strong>
                <small className="block whitespace-nowrap text-[10px] font-semibold tabular-nums text-slate-500">เหลือ {quantity(movement.after)} {row.unit}</small>
              </span>
            </div>
            {(() => {
              const description = mobileMovementDescription(movement);
              const repaired = isRepairMovement(movement);
              return <p className={`mt-1.5 break-words rounded-md px-2 py-1.5 text-[11px] leading-4 ${repaired ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>
                <strong className="font-black">{description.document}</strong><span className="px-1">·</span>{description.detail}
              </p>;
            })()}
          </article>
        ))}
      </div>
    </section>
  );
}

type WarehouseFilter = { id: string; name: string };

export function DailyStockReportClient({
  rows,
  from,
  to,
  warehouseId,
  productId,
  warehouses,
}: {
  rows: Row[];
  from: string;
  to: string;
  warehouseId: string;
  productId: string;
  warehouses: WarehouseFilter[];
}) {
  const { close: closeMobileSearch } = useMobileSearch();
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState(productId);
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const products = useMemo(() => Array.from(new Map(rows.map((row) => [row.productId, { id: row.productId, sku: row.sku, name: row.name }])).values()), [rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th-TH");
    return rows.filter((row) => (!product || row.productId === product) && (!query || row.sku.toLocaleLowerCase("th-TH").includes(query) || row.name.toLocaleLowerCase("th-TH").includes(query)));
  }, [rows, search, product]);
  const groups = Array.from(new Set(filtered.map((row) => `${row.warehouseId}:${row.productId}`)));
  const groupsPerPage = 10;
  const pageCount = Math.max(1, Math.ceil(groups.length / groupsPerPage));
  const visibleGroups = new Set(groups.slice((page - 1) * groupsPerPage, page * groupsPerPage));
  const pageRows = filtered.filter((row) => visibleGroups.has(`${row.warehouseId}:${row.productId}`));

  return (
    <section aria-label="รายงานความเคลื่อนไหวสต็อกรายวัน">
      <MobileSearchDrawer title="กรองความเคลื่อนไหวสต็อก">
        <form method="get" onSubmit={closeMobileSearch} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0 text-xs font-black text-slate-600">จากวันที่
              <input name="from" type="date" defaultValue={from} className="mt-1 h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm font-bold text-slate-900 outline-none focus:border-[#633ab1]" />
            </label>
            <label className="min-w-0 text-xs font-black text-slate-600">ถึงวันที่
              <input name="to" type="date" defaultValue={to} className="mt-1 h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm font-bold text-slate-900 outline-none focus:border-[#633ab1]" />
            </label>
          </div>
          <label className="block text-xs font-black text-slate-600">คลังสินค้า
            <select name="warehouse" defaultValue={warehouseId} className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#633ab1]">
              <option value="">ทุกคลัง</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-black text-slate-600">สินค้า
            <select name="product" value={product} onChange={(event) => setProduct(event.target.value)} className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#633ab1]">
              <option value="">สินค้าทั้งหมด</option>
              {products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
            </select>
          </label>
          <button type="submit" className="h-12 w-full rounded-xl bg-[#4A148C] text-sm font-black text-white shadow-lg active:scale-[0.99]">แสดงผล</button>
        </form>
      </MobileSearchDrawer>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 lg:px-1">
        <div className="flex items-center gap-2 text-slate-900">
          <ChartNoAxesColumn className="h-8 w-8 text-[#633ab1]" aria-hidden="true" />
          <h2 className="text-xl font-bold sm:text-2xl">สรุปสต็อกสินค้ารายวัน</h2>
        </div>
        <div className="hidden w-full gap-2 lg:flex lg:w-auto">
          <label className="relative block min-w-0 flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <span className="sr-only">ค้นหารหัสหรือชื่อสินค้า</span>
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setOpen(null); }} placeholder="ค้นหาสินค้า, รหัสสินค้า..." className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-[#633ab1]" />
          </label>
          <label className="min-w-0 flex-1 sm:w-60"><span className="sr-only">เลือกสินค้า</span>
            <select value={product} onChange={(event) => { setProduct(event.target.value); setPage(1); setOpen(null); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#633ab1]">
              <option value="">สินค้าทั้งหมด</option>
              {products.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="hidden overflow-x-auto rounded-md border border-slate-200 md:block">
        <table className="w-full min-w-[1120px] border-collapse text-[13px] xl:min-w-0 xl:table-fixed 2xl:text-sm">
          <colgroup>
            <col className="xl:w-[13%]" />
            <col className="xl:w-[8%]" />
            <col className="xl:w-[20%]" />
            <col className="xl:w-[7%]" />
            <col className="xl:w-[7%]" />
            <col className="xl:w-[8%]" />
            <col className="xl:w-[11%]" />
            <col className="xl:w-[9%]" />
            <col className="xl:w-[7%]" />
            <col className="xl:w-[10%]" />
          </colgroup>
          <thead className="bg-[#f3f5f9] text-[#26324a]">
            <tr>{["วันที่", "รหัสสินค้า", "ชื่อสินค้า", "ยกยอด", "รับเข้า", "ขาย/เบิก", "คืนจากออเดอร์", "ปรับสต็อก", "สุทธิ", "คงเหลือ"].map((label) => <th key={label} scope="col" className="h-[48px] whitespace-nowrap border-b border-r border-slate-200 px-2 text-left font-bold last:border-r-0 2xl:px-3">{label}</th>)}</tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const key = rowKey(row);
              const expanded = open === key;
              return <Fragment key={key}>
                <tr className={expanded ? "bg-[#f2edff] font-semibold text-[#402273] outline outline-1 -outline-offset-1 outline-[#8b5cf6]" : "bg-white text-slate-800 hover:bg-slate-50"}>
                  <td className="h-[48px] whitespace-nowrap border-b border-r border-slate-200 px-2">
                    <button type="button" disabled={!row.movements.length} aria-expanded={expanded} aria-label={`${expanded ? "ยุบ" : "ขยาย"}รายการเคลื่อนไหว ${row.sku} วันที่ ${dayLabel(row.date)}`} onClick={() => setOpen(expanded ? null : key)} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left font-semibold hover:bg-purple-50 disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-[#633ab1]">
                      <ChevronDown className={`h-4 w-4 shrink-0 text-[#633ab1] transition-transform ${expanded ? "rotate-180" : ""} ${row.movements.length ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
                      {dayLabel(row.date)}
                    </button>
                  </td>
                  <td className="whitespace-nowrap border-b border-r border-slate-200 px-2 2xl:px-3">{row.sku}</td>
                  <td className="border-b border-r border-slate-200 px-2 font-semibold 2xl:px-3">
                    <span className="block">{row.name}</span>
                    <span className="block text-xs font-normal text-slate-500">{row.warehouseName}</span>
                  </td>
                  <td className="whitespace-nowrap border-b border-r border-slate-200 px-2 text-right tabular-nums 2xl:px-3">{quantity(row.opening)}</td>
                  <td className="whitespace-nowrap border-b border-r border-slate-200 px-2 text-right tabular-nums text-emerald-700 2xl:px-3">{row.received ? `+${quantity(row.received)}` : "0"}</td>
                  <td className="whitespace-nowrap border-b border-r border-slate-200 px-2 text-right font-bold tabular-nums text-rose-700 2xl:px-3">{row.sold ? `-${quantity(row.sold)}` : "0"}</td>
                  <td className="whitespace-nowrap border-b border-r border-slate-200 px-2 text-right tabular-nums 2xl:px-3">{row.returned ? `+${quantity(row.returned)}` : "0"}</td>
                  <td className="whitespace-nowrap border-b border-r border-slate-200 px-2 text-right tabular-nums 2xl:px-3">{row.adjusted > 0 ? "+" : ""}{quantity(row.adjusted)}</td>
                  <td className="whitespace-nowrap border-b border-r border-slate-200 px-2 text-right font-semibold tabular-nums 2xl:px-3">{row.net > 0 ? "+" : ""}{quantity(row.net)}</td>
                  <td className="whitespace-nowrap border-b border-slate-200 px-2 text-right font-bold tabular-nums 2xl:px-3">{quantity(row.closing)}{row.other !== 0 || row.mismatch ? <span title={row.mismatch ? "ยอดก่อนและหลังของ Movement บางรายการไม่ต่อกัน" : "มีรายการเคลื่อนไหวประเภทอื่น"} className="ml-1 text-xs text-amber-700">⚠</span> : null}</td>
                </tr>
                {expanded ? <tr><td colSpan={10} className="border-b border-[#d8cff0] p-0"><MovementDetails row={row} /></td></tr> : null}
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {pageRows.map((row) => {
          const key = rowKey(row);
          const expanded = open === key;
          return <Fragment key={key}>
            <article className={`overflow-hidden rounded-2xl border bg-white p-3 shadow-sm ${expanded ? "border-[#8b5cf6]" : "border-slate-200"}`}>
              <div className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-3">
                <span className="grid h-[52px] w-[52px] place-items-center rounded-xl bg-[#f4eaff] text-[#5B21B6]"><PackageOpen className="h-7 w-7" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <strong className="block whitespace-nowrap text-xl font-black leading-6 text-slate-950">{row.sku}</strong>
                    <span className={`inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[10px] font-bold ${row.other !== 0 || row.mismatch ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}><CircleCheck className="h-3 w-3" />{row.other !== 0 || row.mismatch ? "ตรวจสอบ" : "สินค้าปกติ"}</span>
                  </div>
                  <span className="mt-0.5 block break-words text-sm font-black leading-5 text-slate-950">{row.name}</span>
                  <span className="mt-1 block text-xs font-medium text-slate-500">{row.warehouseName} <span className="px-1">•</span> {dayLabel(row.date)}</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center rounded-xl bg-[#f5ecff] px-3 py-2.5 text-center">
                <div><span className="block whitespace-nowrap text-xs text-slate-600">ยกมา</span><strong className="block whitespace-nowrap text-xl font-black tabular-nums">{quantity(row.opening)} {row.unit}</strong></div>
                <ChevronRight className="h-6 w-6 text-slate-500" aria-hidden="true" />
                <div className="border-l border-purple-200"><span className="block whitespace-nowrap text-xs text-slate-600">คงเหลือ</span><strong className="block whitespace-nowrap text-xl font-black tabular-nums text-emerald-700">{quantity(row.closing)} {row.unit}</strong></div>
              </div>

              <div className="mt-2 grid grid-cols-4 divide-x divide-slate-200 text-center">
                <div className="min-w-0 px-1"><span className="block whitespace-nowrap text-[11px] text-slate-600">รับเข้า</span><strong className="block whitespace-nowrap text-base font-black tabular-nums text-emerald-700">+{quantity(row.received)}</strong><small className="block text-[10px] text-slate-500">{row.unit}</small></div>
                <div className="min-w-0 px-1"><span className="block whitespace-nowrap text-[11px] text-slate-600">ขาย</span><strong className="block whitespace-nowrap text-base font-black tabular-nums text-rose-600">-{quantity(row.sold)}</strong><small className="block text-[10px] text-slate-500">{row.unit}</small></div>
                <div className="min-w-0 px-1"><span className="block whitespace-nowrap text-[11px] text-slate-600">คืน</span><strong className="block whitespace-nowrap text-base font-black tabular-nums text-emerald-700">+{quantity(row.returned)}</strong><small className="block text-[10px] text-slate-500">{row.unit}</small></div>
                <div className="min-w-0 px-1"><span className="block whitespace-nowrap text-[11px] text-slate-600">ปรับ</span><strong className="block whitespace-nowrap text-base font-black tabular-nums">{row.adjusted > 0 ? "+" : ""}{quantity(row.adjusted)}</strong><small className="block text-[10px] text-slate-500">{row.unit}</small></div>
              </div>

              <button type="button" disabled={!row.movements.length} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : key)} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl bg-[#5B12A9] px-4 text-left text-sm font-black text-white disabled:cursor-default disabled:bg-slate-300">
                <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] min-[360px]:text-xs"><List className="h-4 w-4 shrink-0 min-[360px]:h-5 min-[360px]:w-5" />ดู {row.movements.length.toLocaleString("th-TH")} รายการเคลื่อนไหว</span>
                <ChevronRight className={`h-5 w-5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
              </button>
              {row.other !== 0 || row.mismatch ? <p className="mt-2 text-xs text-amber-800">⚠ {row.mismatch ? "ยอดก่อนและหลังของ Movement บางรายการไม่ต่อกัน" : "มีรายการเคลื่อนไหวประเภทอื่น"}</p> : null}
            </article>
            {expanded ? <MobileMovementDetails row={row} /> : null}
          </Fragment>;
        })}
      </div>

      {filtered.length === 0 ? <p className="rounded-lg border border-slate-200 p-8 text-center text-slate-600">ไม่พบสินค้าเคลื่อนไหวในช่วงวันที่เลือก</p> : null}
      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-600">
        <span>แสดง {pageRows.length} จาก {filtered.length} รายการ · เฉพาะสินค้าที่มี Movement ในช่วงนี้</span>
        {pageCount > 1 ? <div className="flex items-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => { setPage(page - 1); setOpen(null); }} aria-label="หน้าก่อน" className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2">{page}/{pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => { setPage(page + 1); setOpen(null); }} aria-label="หน้าถัดไป" className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div> : null}
      </div>
    </section>
  );
}
