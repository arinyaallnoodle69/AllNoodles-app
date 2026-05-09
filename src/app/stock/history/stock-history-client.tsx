"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { 
  Search, 
  ChevronRight, 
  CheckCircle2,
  FileText,
  Camera,
  X,
  Loader2
} from "lucide-react";
import type { StockHistoryRow, StockReceiptDetail } from "@/lib/stock/admin";
import { fmtDateTH } from "@/lib/utils/date";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { StockReceiptDetailModal } from "@/components/settings/stock-receipt-detail-modal";
import { getStockReceiptDetailAction } from "@/app/settings/stock/actions";
import { loadMoreStockHistoryAction } from "@/app/stock/pagination-actions";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { useMobileSearch } from "@/components/mobile-search/mobile-search-context";

type Props = {
  history: StockHistoryRow[];
};

const LIMIT = 50;

export function StockHistoryClient({ history: initialHistory }: Props) {
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
  
  const { close: closeSearch } = useMobileSearch();

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

  // Group by date
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

  const totalItems = useMemo(() => 
    filteredHistory.reduce((sum, r) => sum + (r.itemCount || 0), 0)
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

      {/* Desktop Search & Filter (Hidden on Mobile) */}
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

      {/* History List */}
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
                <button
                  key={r.id}
                  onClick={() => handleOpenDetail(r.id)}
                  className="group flex w-full cursor-pointer items-center justify-between gap-4 border-b border-[#c6c6cd] px-5 py-3.5 text-left transition hover:bg-[#f2f4f6] md:px-10 md:py-6 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="w-10 h-10 bg-[#22c55e]/10 rounded-full flex items-center justify-center shrink-0">
                      <CheckCircle2 
                        className="h-6 w-6 text-[#22c55e]" 
                        fill="currentColor" 
                        stroke="#ffffff" 
                        strokeWidth={1.5}
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-[18px] font-bold leading-snug text-black group-hover:text-[#0051d5] transition-colors">
                        {r.supplierName}
                      </h3>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-medium text-[#45464d]">
                        <span className="font-mono tracking-tight">{r.receiptNumber}</span>
                        <span className="h-1 w-1 bg-[#c6c6cd] rounded-full"></span>
                        <span>
                          {new Date(r.receivedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
                        </span>
                        {r.receiptUrl && (
                          <>
                            <span className="h-1 w-1 bg-[#c6c6cd] rounded-full"></span>
                            <span className="flex items-center gap-1 text-[#0051d5]">
                              <Camera className="h-3.5 w-3.5" />
                              มีรูปบิล
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-5 md:gap-8">
                     <div className="text-right">
                        <p className="text-[12px] font-medium text-[#45464d]">{r.itemCount} รายการ</p>
                        <p className="mt-0.5 text-[18px] font-black text-black">
                           {r.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB
                        </p>
                     </div>
                     <ChevronRight
                        className="hidden h-6 w-6 text-[#76777d] transition group-hover:text-[#0051d5] sm:block"
                        strokeWidth={3}
                     />
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
              <h3 className="text-lg font-black text-black">ไม่พบประวัติการรับเข้า</h3>
              <p className="mt-1 text-sm font-medium text-[#45464d]">
                 เริ่มบันทึกรายการสินค้าเข้าคลังครั้งแรกได้ที่ปุ่มด้านบน
              </p>
           </div>
        )}

        {/* Summary Footer */}
        <div className="border-t border-[#c6c6cd] bg-[#f2f4f6] p-5 md:p-10">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-12">
              <div>
                <p className="mb-1 text-[11px] font-black uppercase tracking-[0.05em] text-[#45464d]">
                  จำนวนรายการรับเข้าสะสม
                </p>
                <p className="text-[24px] font-semibold text-black">
                  {totalItems.toLocaleString()} รายการ
                </p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-black uppercase tracking-[0.05em] text-[#45464d]">
                  มูลค่ารับเข้าสะสม
                </p>
                <p className="text-[24px] font-semibold text-[#0051d5]">
                  {totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Load More Section */}
      {hasMore && groups.length > 0 && (
        <div className="mt-12 text-center pb-20">
          <button 
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="text-[#0051d5] font-bold hover:underline flex items-center gap-2 mx-auto transition-all active:scale-95 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                กำลังโหลดข้อมูล...
              </>
            ) : (
              <>
                ดูรายการย้อนหลังเพิ่มเติม
                <ChevronRight className="h-5 w-5 rotate-90 group-hover:translate-y-1 transition-transform" strokeWidth={2.5} />
              </>
            )}
          </button>
          <div className="mt-16 text-[#45464d]/60 text-[12px] space-y-1 font-body-sm">
            <p>แสดงรายการล่าสุด {allHistory.length} รายการ</p>
            <p className="font-bold">หากไม่พบข้อมูลที่ต้องการ กรุณาใช้ระบบค้นหาหรือเลือกวันที่</p>
          </div>
        </div>
      )}
      
      {!hasMore && allHistory.length > 0 && (
        <div className="mt-20 text-center pb-20 text-[#45464d]/40 text-[12px] font-bold uppercase tracking-widest">
          — สิ้นสุดรายการ —
        </div>
      )}

      {/* Detail Modal */}
      {selectedReceiptDetail && (
        <StockReceiptDetailModal 
          detail={selectedReceiptDetail} 
          onClose={() => setSelectedReceiptDetail(null)} 
        />
      )}

      {/* Global Loading Overlay for fetching details */}
      {isDetailLoading && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-white/60 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="flex flex-col items-center">
            <Loader2 className="h-10 w-10 animate-spin text-[#0051d5]" strokeWidth={2.5} />
            <p className="mt-4 text-[12px] font-black text-[#0051d5] uppercase tracking-widest animate-pulse">กำลังดึงข้อมูล...</p>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImageUrl && (
        <div 
          className="fixed inset-0 z-[300] flex items-center justify-center bg-[#191c1e]/90 backdrop-blur-sm p-4 animate-in fade-in duration-300"
          onClick={() => { setPreviewImageUrl(null); setIsImageLoading(false); }}
        >
          <div 
            className="relative max-h-[94dvh] w-full max-w-3xl overflow-hidden rounded-2xl bg-[#ffffff] shadow-[0_28px_80px_rgba(15,23,42,0.22)] border border-[#eceef0] animate-in zoom-in-95 duration-400"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => { setPreviewImageUrl(null); setIsImageLoading(false); }}
              className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white transition-all hover:bg-rose-700 active:scale-90 shadow-lg"
            >
              <X className="h-5 w-5" strokeWidth={3} />
            </button>

            <div className="relative aspect-[3/4] w-full bg-[#f7f9fb] flex items-center justify-center">
              {isImageLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/50 backdrop-blur-[1px]">
                  <Loader2 className="h-10 w-10 animate-spin text-[#0051d5]" strokeWidth={2.5} />
                  <p className="mt-4 text-[12px] font-black text-[#0051d5] uppercase tracking-widest animate-pulse">กำลังโหลดรูปภาพ...</p>
                </div>
              )}
              <Image 
                src={previewImageUrl} 
                alt="Receipt Preview" 
                fill 
                className={`object-contain transition-opacity duration-500 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
                onLoad={() => setIsImageLoading(false)}
                unoptimized
                priority
              />
            </div>

            <div className="bg-white px-8 py-5 flex items-center justify-between border-t border-[#eceef0]">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-[#45464d] uppercase tracking-widest leading-none mb-1">เอกสารอ้างอิง</p>
                <p className="text-base font-black text-[#000000] truncate">หลักฐานการรับเข้าสินค้า</p>
              </div>
              <a 
                href={previewImageUrl} 
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center px-6 rounded-xl bg-[#f2f4f6] text-[12px] font-black text-[#0051d5] transition hover:bg-[#eceef0] active:scale-95 border border-[#c6c6cd]/30"
              >
                ดูขนาดจริง
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
