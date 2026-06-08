"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  FileText,
  Search,
  X,
  Loader2,
  ArrowUpRight
} from "lucide-react";
import Image from "next/image";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { fmtDateTH } from "@/lib/utils/date";
import type { StockIssueRow } from "@/lib/stock/issues";
import { loadMoreStockIssuesAction } from "@/app/stock/pagination-actions";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { useMobileSearch } from "@/components/mobile-search/mobile-search-context";
import { StockTabs } from "@/components/settings/stock-tabs";

type Props = {
  issues: StockIssueRow[];
  initialDate: string;
  warehouses: { id: string; name: string; slug: string }[];
  initialWarehouseId: string;
  onChangeTab?: (key: "stock" | "history" | "issues") => void;
};

const LIMIT = 50;

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  });
}

function formatIssueTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function StockIssueDetailModal({
  issue,
  onClose,
}: {
  issue: StockIssueRow;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-200 md:p-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[480px] lg:max-w-[900px] animate-in zoom-in-95 duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Universal Close Button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 flex items-center gap-2.5 text-white hover:opacity-80 transition-opacity z-[510] py-2"
        >
          <X className="h-5 w-5 md:h-6 md:w-6" strokeWidth={3} />
          <span className="text-[14px] md:text-[15px] font-black tracking-tight">ปิดหน้าต่าง</span>
        </button>

        {/* Content Wrapper with Scroll */}
        <div className="max-h-[85vh] overflow-y-auto scrollbar-hide">
          {/* MOBILE VIEW */}
          <div className="block lg:hidden bg-white text-black shadow-2xl">
            <div className="px-6 py-6">
              <div className="flex justify-end mb-2">
                <Image src="/brand/512x512.png" alt="All Noodles" width={48} height={48} className="object-contain" />
              </div>

              <div className="text-center mb-4">
                <div className="text-[11px] leading-relaxed text-slate-500">All Noodles - ใบจัดส่งสินค้า</div>
                <div className="text-[14px] font-black leading-tight mt-0.5">
                  เลขที่เอกสาร: {issue.issueNumber || issue.orderNumber}
                </div>
                <div className="text-[12px] leading-relaxed text-slate-500 mt-1">{fmtDateTH(issue.orderDate)}</div>
              </div>

              <div className="h-[2px] bg-black mb-4" />

              <div className="mb-3">
                <span className="font-bold text-[12px]">ชื่อลูกค้า:</span>
                <span className="text-[12px]"> {issue.customerName}</span>
              </div>

              <div className="grid grid-cols-[1fr_75px_50px_65px] gap-2 py-2 border-b border-[#cccccc]">
                <span className="text-[12px] font-black text-left">สินค้า</span>
                <span className="text-[12px] font-black text-center">จำนวน</span>
                <span className="text-[12px] font-black text-center">หน่วย</span>
                <span className="text-[12px] font-black text-right">รวม</span>
              </div>

              <div className="divide-y divide-[#cccccc]">
                {issue.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_75px_50px_65px] gap-2 py-3 items-center">
                    <div className="text-[11px] leading-[1.4] line-clamp-2">{item.productName}</div>
                    <div className="text-[12px] text-center font-medium">
                      {formatQuantity(item.quantity)} {item.unit}
                    </div>
                    <div className="text-[12px] text-center text-slate-500">
                      {formatCurrency(item.quantity > 0 ? item.lineTotal / item.quantity : 0)}
                    </div>
                    <div className="text-[12px] text-right font-bold">{formatCurrency(item.lineTotal)}</div>
                  </div>
                ))}
              </div>

              <div className="h-[1px] bg-[#cccccc] mt-4 mb-4" />

              <div className="flex items-center justify-between mb-6 px-1">
                 <span className="text-[13px] font-black">ยอดรวมทั้งหมด:</span>
                 <span className="text-[16px] font-black text-[#082A63] underline decoration-double decoration-slate-300 underline-offset-4">
                    {formatCurrency(issue.totalAmount)}
                 </span>
              </div>
            </div>
          </div>

          {/* DESKTOP VIEW */}
          <div className="hidden lg:flex relative flex-col bg-white p-8 shadow-[0_10px_25px_rgba(0,0,0,0.1)] overflow-hidden min-h-[600px]">
            <div className="relative z-10 mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="flex gap-4">
                <div className="relative h-16 w-16 shrink-0">
                  <Image src="/brand/512x512.png" alt="All Noodles Logo" fill className="object-contain" />
                </div>
                <div>
                  <h1 className="text-[20px] font-black leading-tight text-black">All Noodles</h1>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <h2 className="text-[18px] font-black text-[#082A63] md:text-[20px]">ใบจัดส่งสินค้า</h2>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#45464d]">Goods Issue Voucher</p>
              </div>
            </div>

            <div className="relative z-10 mb-4 grid grid-cols-1 gap-3 border-y border-[#c6c6cd] py-3 sm:grid-cols-2 sm:gap-6">
              <div className="space-y-1">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-[#45464d]">ชื่อลูกค้า / Customer:</span>
                  <span className="text-[13px] font-black text-black text-right">{issue.customerName}</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-[#45464d]">เลขที่เอกสาร / No:</span>
                  <span className="font-mono text-[13px] font-black text-black">
                    {issue.issueNumber || issue.orderNumber}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-2 border-t border-dashed border-[#c6c6cd] pt-1">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-[#45464d]">วันที่ / Date:</span>
                  <span className="text-[13px] font-medium text-black">{fmtDateTH(issue.orderDate)}</span>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-[#e6e8ea]">
                    <th className="w-10 px-2 py-1.5 text-[10px] font-black">ลำดับ</th>
                    <th className="px-2 py-1.5 text-[10px] font-black">รหัสสินค้า / SKU</th>
                    <th className="px-2 py-1.5 text-[10px] font-black">รายการ / Description</th>
                    <th className="w-16 px-2 py-1.5 text-right text-[10px] font-black">จำนวน</th>
                    <th className="w-12 px-2 py-1.5 text-center text-[10px] font-black">หน่วย</th>
                    <th className="px-2 py-1.5 text-right text-[10px] font-black">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody className="text-[13px] divide-y divide-[#c6c6cd]/50">
                  {issue.items.map((item, index) => (
                    <tr key={item.id}>
                      <td className="px-2 py-2 text-center">{index + 1}</td>
                      <td className="px-2 py-2 font-mono text-[11px]">{item.sku}</td>
                      <td className="px-2 py-2 font-bold">{item.productName}</td>
                      <td className="px-2 py-2 text-right">{formatQuantity(item.quantity)}</td>
                      <td className="px-2 py-2 text-center">{item.unit}</td>
                      <td className="px-2 py-2 text-right font-black">{formatCurrency(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="relative z-10 mt-6 flex justify-end items-baseline pr-4">
              <div className="flex items-baseline gap-6">
                <span className="text-[16px] font-black text-black">รวมทั้งสิ้น / Total:</span>
                <p className="text-[32px] font-black text-[#082A63] leading-none mb-1">
                  {formatCurrency(issue.totalAmount)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StockIssuesClient({
  issues: initialIssues,
  initialDate,
  warehouses,
  initialWarehouseId,
  onChangeTab,
}: Props) {
  const [allIssues, setAllIssues] = useState<StockIssueRow[]>(initialIssues);
  const [hasMore, setHasMore] = useState(initialIssues.length === LIMIT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState(initialDate);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(initialWarehouseId);
  const [selectedIssue, setSelectedIssue] = useState<StockIssueRow | null>(null);
  const { close: closeSearch } = useMobileSearch();

  const [prevInitialWarehouseId, setPrevInitialWarehouseId] = useState(initialWarehouseId);
  if (initialWarehouseId !== prevInitialWarehouseId) {
    setPrevInitialWarehouseId(initialWarehouseId);
    setSelectedWarehouseId(initialWarehouseId);
    setAllIssues(initialIssues);
    setHasMore(initialIssues.length === LIMIT);
  }

  useEffect(() => {
    setAllIssues(initialIssues);
    setHasMore(initialIssues.length === LIMIT);
  }, [initialIssues]);

  const warehouseOptions = [
    { id: "all", name: "ทุกคลังสินค้า" },
    ...warehouses.map((w) => ({ id: w.id, name: w.name })),
  ];

  const handleWarehouseChange = async (warehouseId: string) => {
    setSelectedWarehouseId(warehouseId);
    const params = new URLSearchParams(window.location.search);
    if (warehouseId !== "all") {
      params.set("warehouse", warehouseId);
    } else {
      params.delete("warehouse");
    }
    window.history.pushState({}, "", `/stock?tab=issues&${params.toString()}`);
    
    setIsLoadingMore(true);
    try {
      const nextBatch = await loadMoreStockIssuesAction(0, LIMIT, warehouseId, filterDate);
      setAllIssues(nextBatch);
      setHasMore(nextBatch.length === LIMIT);
    } catch (e) {
      console.error("Failed to fetch issues for warehouse", e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const filteredIssues = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return allIssues.filter((issue) => {
      const matchesDate = filterDate ? issue.orderDate === filterDate : true;
      const matchesSearch = query
        ? [
          issue.customerName,
          issue.customerCode,
          issue.issueNumber,
          issue.orderNumber,
          ...issue.items.map((item) => `${item.sku} ${item.productName}`),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
        : true;
      return matchesDate && matchesSearch;
    });
  }, [filterDate, allIssues, searchTerm]);

  async function handleLoadMore() {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextBatch = await loadMoreStockIssuesAction(allIssues.length, LIMIT, selectedWarehouseId);
      if (nextBatch.length > 0) {
        setAllIssues((prev) => [...prev, ...nextBatch]);
        if (nextBatch.length < LIMIT) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error("Failed to load more issues", e);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, StockIssueRow[]>();
    for (const issue of filteredIssues) {
      const current = map.get(issue.orderDate) ?? [];
      current.push(issue);
      map.set(issue.orderDate, current);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredIssues]);

  const totalAmount = filteredIssues.reduce((total, issue) => total + issue.totalAmount, 0);
  const totalItems = filteredIssues.reduce((total, issue) => total + issue.itemCount, 0);

  return (
    <>
      <MobileSearchDrawer title="ค้นหาประวัติการเบิกออก">
        <div className="space-y-6 pb-80 p-6">
          <div className="space-y-1.5">
            <label className="text-[12px] font-black uppercase tracking-widest text-slate-500 ml-1">เลือกคลัง</label>
            <select
              value={selectedWarehouseId}
              onChange={(event) => handleWarehouseChange(event.target.value)}
              className="w-full h-14 rounded-2xl bg-slate-100 border-none px-4 text-base font-bold text-black outline-none focus:ring-2 focus:ring-[#082A63]"
            >
              {warehouseOptions.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-black uppercase tracking-widest text-slate-500 ml-1">คำค้นหา</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ชื่อลูกค้า หรือหมายเหตุ..."
                className="w-full h-14 rounded-2xl bg-slate-100 border-none pl-12 pr-4 text-base font-bold text-black outline-none focus:ring-2 focus:ring-[#082A63] transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-black uppercase tracking-widest text-slate-500 ml-1">เลือกวันที่</label>
            <div className="relative">
              <ThaiDatePicker
                id="m-filter-date"
                name="m-filter-date"
                defaultValue={filterDate}
                onChange={async (newDate) => {
                  setFilterDate(newDate);
                  const params = new URLSearchParams(window.location.search);
                  if (newDate) {
                    params.set("date", newDate);
                  } else {
                    params.delete("date");
                  }
                  window.history.pushState({}, "", `/stock?tab=issues&${params.toString()}`);
                  
                  setIsLoadingMore(true);
                  try {
                    const nextBatch = await loadMoreStockIssuesAction(0, LIMIT, selectedWarehouseId, newDate);
                    setAllIssues(nextBatch);
                    setHasMore(nextBatch.length === LIMIT);
                  } catch (e) {
                    console.error("Failed to filter by date", e);
                  } finally {
                    setIsLoadingMore(false);
                  }
                }}
                placeholder="ทุกวันที่"
              />
              {filterDate && (
                <button 
                  onClick={async () => {
                    setFilterDate("");
                    const params = new URLSearchParams(window.location.search);
                    params.delete("date");
                    window.history.pushState({}, "", `/stock?tab=issues&${params.toString()}`);
                    
                    setIsLoadingMore(true);
                    try {
                      const nextBatch = await loadMoreStockIssuesAction(0, LIMIT, selectedWarehouseId, "");
                      setAllIssues(nextBatch);
                      setHasMore(nextBatch.length === LIMIT);
                    } catch (e) {
                      console.error("Failed to clear date", e);
                    } finally {
                      setIsLoadingMore(false);
                    }
                  }}
                  className="absolute -right-1.5 -top-1.5 z-10 bg-slate-200 text-slate-600 rounded-full p-1 hover:bg-slate-300 shadow-sm transition-all"
                >
                  <X className="h-3 w-3" strokeWidth={3} />
                </button>
              )}
            </div>
          </div>
          <button
            onClick={closeSearch}
            className="mt-4 w-full h-14 rounded-2xl bg-[#082A63] text-[#1F2A44] font-black text-lg shadow-lg active:scale-95 transition-all"
          >
            แสดง {filteredIssues.length} รายการ
          </button>
        </div>
      </MobileSearchDrawer>

      <div className="sticky top-0 z-40 -mx-3 mb-4 hidden border-b border-[#E8DCC7] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(31,42,68,0.08)] backdrop-blur lg:block">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-lg font-black text-[#082A63]">ประวัติการเบิกออกสินค้า</p>
              <p className="text-xs font-semibold text-[#667085]">
                แสดง {filteredIssues.length.toLocaleString("th-TH")} รายการ
              </p>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(18rem,1fr)_18rem_170px] xl:items-center">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาชื่อลูกค้า หรือหมายเหตุ..."
                className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-semibold text-[#1F2A44] outline-none transition placeholder:text-[#667085] focus:border-[#082A63] focus:ring-2 focus:ring-[#082A63]/15"
              />
            </label>

            <label className="block">
              <span className="sr-only">เลือกคลัง</span>
              <select
                value={selectedWarehouseId}
                onChange={(event) => handleWarehouseChange(event.target.value)}
                className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white px-4 text-sm font-bold text-[#1F2A44] outline-none focus:border-[#082A63] focus:ring-2 focus:ring-[#082A63]/15"
              >
                {warehouseOptions.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="relative w-[170px]">
              <ThaiDatePicker
                id="filter-date"
                name="filter-date"
                defaultValue={filterDate}
                onChange={async (newDate) => {
                  setFilterDate(newDate);
                  const params = new URLSearchParams(window.location.search);
                  if (newDate) {
                    params.set("date", newDate);
                  } else {
                    params.delete("date");
                  }
                  window.history.pushState({}, "", `/stock?tab=issues&${params.toString()}`);
                  
                  setIsLoadingMore(true);
                  try {
                    const nextBatch = await loadMoreStockIssuesAction(0, LIMIT, selectedWarehouseId, newDate);
                    setAllIssues(nextBatch);
                    setHasMore(nextBatch.length === LIMIT);
                  } catch (e) {
                    console.error("Failed to filter by date", e);
                  } finally {
                    setIsLoadingMore(false);
                  }
                }}
                placeholder="เลือกวันที่"
              />
              {filterDate && (
                <button 
                  onClick={async () => {
                    setFilterDate("");
                    const params = new URLSearchParams(window.location.search);
                    params.delete("date");
                    window.history.pushState({}, "", `/stock?tab=issues&${params.toString()}`);
                    
                    setIsLoadingMore(true);
                    try {
                      const nextBatch = await loadMoreStockIssuesAction(0, LIMIT, selectedWarehouseId, "");
                      setAllIssues(nextBatch);
                      setHasMore(nextBatch.length === LIMIT);
                    } catch (e) {
                      console.error("Failed to clear date", e);
                    } finally {
                      setIsLoadingMore(false);
                    }
                  }}
                  className="absolute -right-1.5 -top-1.5 z-10 bg-slate-200 text-slate-600 rounded-full p-1 hover:bg-slate-300 shadow-sm transition-all"
                >
                  <X className="h-3 w-3" strokeWidth={3} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <StockTabs current="issues" onChangeTab={onChangeTab} />

      <div className="max-w-4xl mx-auto w-full px-3 md:px-0">
        <div className="mb-6 flex justify-end hidden sm:flex">
           <div className="text-right">
              <p className="text-[11px] font-black uppercase tracking-[0.05em] text-[#45464d] mb-1">ยอดรวมทั้งหมด (หน้าปัจจุบัน)</p>
              <p className="text-[20px] font-black text-[#082A63]">
                 {totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[12px]">THB</span>
              </p>
           </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#c6c6cd] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.05)] mb-10">
          {groups.length > 0 ? (
            groups.map(([date, rows]) => (
              <section key={date}>
                <div className="border-b border-[#c6c6cd] bg-[#eceef0] px-5 py-1.5 md:px-10">
                  <span className="text-[11px] font-black uppercase tracking-[0.05em] text-[#45464d]">
                    {fmtDateTH(date)}
                  </span>
                </div>
                {rows.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => setSelectedIssue(issue)}
                    className="group flex w-full cursor-pointer items-center justify-between gap-4 border-b border-[#c6c6cd] px-5 py-3.5 text-left transition hover:bg-[#f2f4f6] md:px-10 md:py-6 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="w-10 h-10 bg-rose-500/10 rounded-full flex items-center justify-center shrink-0">
                        <ArrowUpRight className="h-5 w-5 text-rose-500" strokeWidth={3} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-[18px] font-bold text-black group-hover:text-[#082A63] transition-colors">
                          {issue.customerName}
                        </h3>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-medium text-[#45464d]">
                          <span className="font-mono">{issue.orderNumber}</span>
                          <span className="h-1 w-1 bg-[#c6c6cd] rounded-full"></span>
                          <span>{formatIssueTime(issue.createdAt)} น.</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-5 md:gap-8">
                       <div className="text-right">
                          <p className="text-[12px] font-medium text-[#45464d]">{issue.itemCount} รายการ</p>
                          <p className="mt-0.5 text-[18px] font-black text-black">
                             {formatCurrency(issue.totalAmount)} THB
                          </p>
                       </div>
                       <ChevronRight className="hidden h-6 w-6 text-[#76777d] sm:block" strokeWidth={3} />
                    </div>
                  </button>
                ))}
              </section>
            ))
          ) : (
             <div className="py-20 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f2f4f6] text-[#76777d]">
                   <FileText className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-black text-black">ไม่พบประวัติการเบิกออก</h3>
             </div>
          )}

          <div className="border-t border-[#c6c6cd] bg-[#f2f4f6] p-5 md:p-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-12">
              <div>
                <p className="mb-1 text-[11px] font-black text-[#45464d]">จำนวนรายการสะสม</p>
                <p className="text-[24px] font-semibold text-black">{totalItems.toLocaleString()} รายการ</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-black text-[#45464d]">มูลค่ารวมสะสม</p>
                <p className="text-[24px] font-semibold text-rose-600">{formatCurrency(totalAmount)} THB</p>
              </div>
            </div>
          </div>
        </div>

        {hasMore && groups.length > 0 && (
          <div className="mt-12 text-center pb-20">
            <button 
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="text-[#082A63] font-bold hover:underline flex items-center gap-2 mx-auto disabled:opacity-50"
            >
              {isLoadingMore ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronRight className="h-5 w-5 rotate-90" />}
              {isLoadingMore ? "กำลังโหลด..." : "ดูเพิ่มเติม"}
            </button>
          </div>
        )}
      </div>

      {selectedIssue && (
        <StockIssueDetailModal issue={selectedIssue} onClose={() => setSelectedIssue(null)} />
      )}
    </>
  );
}
