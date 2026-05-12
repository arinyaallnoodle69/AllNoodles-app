"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { 
  Search, 
  ChevronRight, 
  CheckCircle2,
  FileText,
  X,
  Loader2,
  Edit
} from "lucide-react";
import type { StockHistoryRow, StockReceiptDetail, StockSupplierOption } from "@/lib/stock/admin";
import { fmtDateTH } from "@/lib/utils/date";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { StockReceiptDetailModal } from "@/components/settings/stock-receipt-detail-modal";
import { StockReceiptEditModal } from "@/components/settings/stock-receipt-edit-modal";
import { getStockReceiptDetailAction } from "@/app/settings/stock/actions";
import { loadMoreStockHistoryAction } from "@/app/stock/pagination-actions";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { useMobileSearch } from "@/components/mobile-search/mobile-search-context";

type Props = {
  history: StockHistoryRow[];
  suppliers: StockSupplierOption[];
};

const LIMIT = 50;

export function StockHistoryClient({ history: initialHistory, suppliers }: Props) {
  const [allHistory, setAllHistory] = useState<StockHistoryRow[]>(initialHistory);
  const [hasMore, setHasMore] = useState(initialHistory.length === LIMIT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  
  // Detail Modal State
  const [selectedReceiptDetail, setSelectedReceiptDetail] = useState<StockReceiptDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  
  // Edit Modal State
  const [editingReceipt, setEditingReceipt] = useState<StockReceiptDetail | null>(null);
  
  const { close: closeSearch } = useMobileSearch();

  async function refreshHistory() {
    window.location.reload();
  }

  async function handleOpenDetail(id: string) {
    setIsDetailLoading(true);
    try {
      const detail = await getStockReceiptDetailAction(id);
      if (detail) {
        setSelectedReceiptDetail(detail);
      }
    } catch (e) {
      console.error("Failed to fetch receipt detail", e);
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function handleOpenEdit(id: string) {
    setIsDetailLoading(true);
    try {
      const detail = await getStockReceiptDetailAction(id);
      if (detail) {
        setEditingReceipt(detail);
      }
    } catch (e) {
      console.error("Failed to fetch receipt detail for edit", e);
    } finally {
      setIsDetailLoading(false);
    }
  }

  const filteredHistory = useMemo(() => {
    let result = allHistory;
    const q = searchTerm.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (r) =>
          r.receiptNumber.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q) ||
          (r.notes && r.notes.toLowerCase().includes(q))
      );
    }
    if (filterDate) {
      result = result.filter(r => r.receivedAt.split("T")[0] === filterDate);
    }
    return result;
  }, [searchTerm, filterDate, allHistory]);

  async function handleLoadMore() {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextBatch = await loadMoreStockHistoryAction(allHistory.length, LIMIT);
      if (nextBatch.length > 0) {
        setAllHistory((prev) => [...prev, ...nextBatch]);
        if (nextBatch.length < LIMIT) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error("Failed to load more history", e);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, StockHistoryRow[]>();
    filteredHistory.forEach((r) => {
      const date = r.receivedAt.split("T")[0];
      const current = map.get(date) ?? [];
      current.push(r);
      map.set(date, current);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredHistory]);

  const { today, yesterday } = useMemo(() => {
    const t = new Date();
    const y = new Date(t.getTime() - 86400000);
    return {
      today: t.toISOString().split("T")[0],
      yesterday: y.toISOString().split("T")[0]
    };
  }, []);

  function getDateLabel(dateStr: string) {
    if (dateStr === today) return "วันนี้ (Today)";
    if (dateStr === yesterday) return "เมื่อวานนี้ (Yesterday)";
    return fmtDateTH(dateStr);
  }

  const totalAmount = useMemo(() => 
    filteredHistory.reduce((sum, r) => sum + (r.totalAmount || 0), 0)
  , [filteredHistory]);

  return (
    <div className="mx-auto w-full max-w-4xl px-0 py-2 md:px-6">
      <MobileSearchDrawer title="ค้นหาประวัติการรับเข้า">
        <div className="space-y-6 pb-80 p-6">
          <div className="space-y-1.5">
            <label className="text-[12px] font-black uppercase tracking-widest text-slate-500 ml-1">คำค้นหา</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="เลขที่รายการ หรือผู้ขาย..."
                className="w-full h-14 rounded-2xl bg-slate-100 border-none pl-12 pr-4 text-base font-bold text-black outline-none focus:ring-2 focus:ring-[#0051d5] transition-all"
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
                onChange={setFilterDate}
                placeholder="ทุกวันที่"
              />
              {filterDate && (
                <button 
                  onClick={() => setFilterDate("")}
                  className="absolute -right-1.5 -top-1.5 z-10 bg-slate-200 text-slate-600 rounded-full p-1 hover:bg-slate-300 shadow-sm transition-all"
                >
                  <X className="h-3 w-3" strokeWidth={3} />
                </button>
              )}
            </div>
          </div>

          <button
            onClick={closeSearch}
            className="mt-4 w-full h-14 rounded-2xl bg-[#0051d5] text-white font-black text-lg shadow-lg active:scale-95 transition-all"
          >
            แสดง {filteredHistory.length} รายการ
          </button>
        </div>
      </MobileSearchDrawer>

      <div className="mb-8 mt-4 hidden sm:flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1 max-w-md">
           <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-[20px] w-[20px] -translate-y-1/2 text-[#45464d]" strokeWidth={2.5} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาเลขที่รายการ หรือผู้ขาย..."
                className="w-full h-[44px] rounded-xl bg-[#f2f4f6] border-none pl-11 pr-4 text-[14px] font-medium outline-none transition-all focus:ring-1 focus:ring-[#0051d5]"
              />
            </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative w-[170px]">
            <ThaiDatePicker
              id="filter-date"
              name="filter-date"
              defaultValue={filterDate}
              onChange={setFilterDate}
              placeholder="เลือกวันที่"
            />
            {filterDate && (
              <button 
                onClick={() => setFilterDate("")}
                className="absolute -right-1.5 -top-1.5 z-10 bg-slate-200 text-slate-600 rounded-full p-1 hover:bg-slate-300 shadow-sm transition-all"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 flex justify-end hidden sm:flex">
         <div className="text-right">
            <p className="text-[11px] font-black uppercase tracking-[0.05em] text-[#45464d] mb-1">ยอดรวมทั้งหมด (หน้าปัจจุบัน)</p>
            <p className="text-[20px] font-black text-[#0051d5]">
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
                  {getDateLabel(date)}
                </span>
              </div>

              {rows.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenDetail(r.id)}
                  onKeyDown={(e) => e.key === "Enter" && handleOpenDetail(r.id)}
                  className="group relative w-full cursor-pointer border-b border-[#c6c6cd] px-5 py-5 text-left transition hover:bg-[#f2f4f6] md:px-10 md:py-6 last:border-b-0"
                >
                  <div className="flex items-start gap-4">
                    {/* Icon Column */}
                    <div className="w-10 h-10 bg-[#22c55e]/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="h-6 w-6 text-[#22c55e]" fill="currentColor" stroke="#ffffff" strokeWidth={1.5} />
                    </div>
                    
                    {/* Content Column */}
                    <div className="flex-1 min-w-0">
                      {/* Line 1: Supplier Name & Desktop Edit */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-[19px] font-black leading-tight text-black group-hover:text-[#0051d5] transition-colors break-words">
                          {r.supplierName}
                        </h3>
                        {/* Desktop Edit */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(r.id); }}
                          className="hidden sm:flex w-9 h-9 rounded-xl border border-[#c6c6cd] bg-white items-center justify-center transition-all hover:bg-slate-50 active:scale-90 md:opacity-0 md:group-hover:opacity-100 shadow-sm shrink-0"
                        >
                          <Edit className="w-4 h-4 text-slate-600" />
                        </button>
                      </div>

                      {/* Line 2: Amount & Receipt Number */}
                      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                          <p className="text-[20px] font-black text-[#0051d5] whitespace-nowrap">
                            {r.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                            <span className="text-[12px] font-bold ml-1">THB</span>
                          </p>
                          <p className="font-mono text-[14px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md whitespace-nowrap">
                            {r.receiptNumber}
                          </p>
                        </div>

                        {/* Extra Info & Mobile Edit */}
                        <div className="flex items-center justify-between sm:justify-end gap-4">
                          <div className="flex items-center gap-3 text-[12px] font-bold text-[#76777d]">
                             <span>{r.itemCount} รายการ</span>
                             <span className="h-1 w-1 bg-[#c6c6cd] rounded-full"></span>
                             <span>{new Date(r.receivedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</span>
                          </div>
                          
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEdit(r.id); }}
                            className="sm:hidden w-10 h-10 rounded-2xl border border-[#c6c6cd] bg-white flex items-center justify-center active:scale-90 shadow-sm shrink-0"
                          >
                            <Edit className="w-4.5 h-4.5 text-slate-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Desktop Chevron */}
                    <ChevronRight className="hidden h-6 w-6 text-[#76777d] transition group-hover:text-[#0051d5] sm:block self-center" strokeWidth={3} />
                  </div>
                </div>
              ))}
            </section>
          ))
        ) : (
           <div className="py-20 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f2f4f6] text-[#76777d]">
                 <FileText className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-black text-black">ไม่พบประวัติการรับเข้า</h3>
              <p className="mt-1 text-sm font-medium text-[#45464d]">เริ่มบันทึกรายการสินค้าเข้าคลังครั้งแรกได้ที่ปุ่มด้านบน</p>
           </div>
        )}
      </div>

      {hasMore && groups.length > 0 && (
        <div className="mt-12 text-center pb-20">
          <button onClick={handleLoadMore} disabled={isLoadingMore} className="text-[#0051d5] font-bold hover:underline flex items-center gap-2 mx-auto disabled:opacity-50">
            {isLoadingMore ? <Loader2 className="h-5 w-5 animate-spin" /> : "ดูรายการย้อนหลังเพิ่มเติม"}
          </button>
        </div>
      )}

      {selectedReceiptDetail && (
        <StockReceiptDetailModal 
          detail={selectedReceiptDetail} 
          onClose={() => setSelectedReceiptDetail(null)} 
          onEdit={() => {
            const id = selectedReceiptDetail.id;
            setSelectedReceiptDetail(null);
            handleOpenEdit(id);
          }}
        />
      )}

      {isDetailLoading && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
          <div className="flex flex-col items-center">
            <Loader2 className="h-10 w-10 animate-spin text-[#0051d5]" strokeWidth={2.5} />
            <p className="mt-4 text-[12px] font-black text-[#0051d5] uppercase tracking-widest animate-pulse">กำลังดึงข้อมูล...</p>
          </div>
        </div>
      )}

      {previewImageUrl && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-4" onClick={() => { setPreviewImageUrl(null); setIsImageLoading(false); }}>
          <div className="relative max-h-[94dvh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setPreviewImageUrl(null); setIsImageLoading(false); }} className="absolute right-4 top-4 z-20 h-10 w-10 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg"><X /></button>
            <div className="relative aspect-[3/4] w-full">
              {isImageLoading && <Loader2 className="absolute inset-0 m-auto h-10 w-10 animate-spin text-[#0051d5]" />}
              <Image src={previewImageUrl} alt="Preview" fill className="object-contain" onLoad={() => setIsImageLoading(false)} unoptimized />
            </div>
          </div>
        </div>
      )}

      {editingReceipt && (
        <StockReceiptEditModal
          receipt={editingReceipt}
          suppliers={suppliers}
          isOpen={!!editingReceipt}
          onClose={() => setEditingReceipt(null)}
          onSuccess={refreshHistory}
        />
      )}
    </div>
  );
}
