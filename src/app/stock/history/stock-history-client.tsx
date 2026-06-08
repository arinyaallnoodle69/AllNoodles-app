"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Search,
  ChevronRight,
  CheckCircle2,
  FileText,
  X,
  Loader2,
  Edit,
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
import { StockTabs } from "@/components/settings/stock-tabs";

type Props = {
  history: StockHistoryRow[];
  suppliers: StockSupplierOption[];
  warehouses: { id: string; name: string; slug: string }[];
  initialWarehouseId: string;
  onChangeTab?: (key: "stock" | "history" | "issues") => void;
};

const LIMIT = 50;

export function StockHistoryClient({
  history: initialHistory,
  suppliers,
  warehouses,
  initialWarehouseId,
  onChangeTab,
}: Props) {
  const router = useRouter();
  const [allHistory, setAllHistory] = useState<StockHistoryRow[]>(initialHistory);
  const [hasMore, setHasMore] = useState(initialHistory.length === LIMIT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(initialWarehouseId);

  const [selectedReceiptDetail, setSelectedReceiptDetail] = useState<StockReceiptDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<StockReceiptDetail | null>(null);

  const { close: closeSearch } = useMobileSearch();

  const [prevInitialWarehouseId, setPrevInitialWarehouseId] = useState(initialWarehouseId);
  if (initialWarehouseId !== prevInitialWarehouseId) {
    setPrevInitialWarehouseId(initialWarehouseId);
    setSelectedWarehouseId(initialWarehouseId);
    setAllHistory(initialHistory);
    setHasMore(initialHistory.length === LIMIT);
  }

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
    window.history.pushState({}, "", `/stock?tab=history&${params.toString()}`);
    
    setIsLoadingMore(true);
    try {
      const nextBatch = await loadMoreStockHistoryAction(0, LIMIT, warehouseId);
      setAllHistory(nextBatch);
      setHasMore(nextBatch.length === LIMIT);
    } catch (error) {
      console.error("Failed to fetch history for warehouse", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  async function refreshHistory() {
    const nextBatch = await loadMoreStockHistoryAction(0, Math.max(allHistory.length, LIMIT), selectedWarehouseId);
    setAllHistory(nextBatch);
    setHasMore(nextBatch.length >= LIMIT);
    router.refresh();
  }

  async function handleOpenDetail(id: string) {
    setIsDetailLoading(true);
    try {
      const detail = await getStockReceiptDetailAction(id);
      if (detail) {
        setSelectedReceiptDetail(detail);
      }
    } catch (error) {
      console.error("Failed to fetch receipt detail", error);
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
    } catch (error) {
      console.error("Failed to fetch receipt detail for edit", error);
    } finally {
      setIsDetailLoading(false);
    }
  }

  const filteredHistory = useMemo(() => {
    let result = allHistory;
    const q = searchTerm.toLowerCase().trim();

    if (q) {
      result = result.filter(
        (row) =>
          row.receiptNumber.toLowerCase().includes(q) ||
          row.supplierName.toLowerCase().includes(q) ||
          (row.notes && row.notes.toLowerCase().includes(q)),
      );
    }

    if (filterDate) {
      result = result.filter((row) => row.receivedAt.split("T")[0] === filterDate);
    }

    return result;
  }, [allHistory, filterDate, searchTerm]);

  async function handleLoadMore() {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const nextBatch = await loadMoreStockHistoryAction(allHistory.length, LIMIT, selectedWarehouseId);
      if (nextBatch.length > 0) {
        setAllHistory((prev) => [...prev, ...nextBatch]);
        if (nextBatch.length < LIMIT) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Failed to load more history", error);
    } finally {
      setIsLoadingMore(false);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, StockHistoryRow[]>();
    filteredHistory.forEach((row) => {
      const date = row.receivedAt.split("T")[0];
      const current = map.get(date) ?? [];
      current.push(row);
      map.set(date, current);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredHistory]);

  const { today, yesterday } = useMemo(() => {
    const now = new Date();
    const previous = new Date(now.getTime() - 86400000);
    return {
      today: now.toISOString().split("T")[0],
      yesterday: previous.toISOString().split("T")[0],
    };
  }, []);

  function getDateLabel(dateStr: string) {
    if (dateStr === today) return "วันนี้";
    if (dateStr === yesterday) return "เมื่อวานนี้";
    return fmtDateTH(dateStr);
  }

  const totalAmount = useMemo(
    () => filteredHistory.reduce((sum, row) => sum + (row.totalAmount || 0), 0),
    [filteredHistory],
  );

  return (
    <>
      <MobileSearchDrawer title="ค้นหาประวัติการรับเข้า">
        <div className="space-y-6 p-6 pb-80">
          <div className="space-y-1.5">
            <label className="ml-1 text-[12px] font-black uppercase tracking-widest text-slate-500">เลือกคลัง</label>
            <select
              value={selectedWarehouseId}
              onChange={(event) => handleWarehouseChange(event.target.value)}
              className="h-14 w-full rounded-2xl border-none bg-slate-100 px-4 text-base font-bold text-black outline-none focus:ring-2 focus:ring-[#082A63]"
            >
              {warehouseOptions.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="ml-1 text-[12px] font-black uppercase tracking-widest text-slate-500">คำค้นหา</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="เลขที่รายการ หรือผู้ขาย..."
                className="h-14 w-full rounded-2xl border-none bg-slate-100 pl-12 pr-4 text-base font-bold text-black outline-none transition-all focus:ring-2 focus:ring-[#082A63]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="ml-1 text-[12px] font-black uppercase tracking-widest text-slate-500">เลือกวันที่</label>
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
                  className="absolute -right-1.5 -top-1.5 z-10 rounded-full bg-slate-200 p-1 text-slate-600 shadow-sm transition-all hover:bg-slate-300"
                >
                  <X className="h-3 w-3" strokeWidth={3} />
                </button>
              )}
            </div>
          </div>

          <button
            onClick={closeSearch}
            className="mt-4 h-14 w-full rounded-2xl bg-[#082A63] text-lg font-black text-[#1F2A44] shadow-lg transition-all active:scale-95"
          >
            แสดง {filteredHistory.length} รายการ
          </button>
        </div>
      </MobileSearchDrawer>

      <div className="sticky top-0 z-40 -mx-3 mb-4 hidden border-b border-[#E8DCC7] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(31,42,68,0.08)] backdrop-blur lg:block">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-lg font-black text-[#082A63]">ประวัติการรับเข้าสินค้า</p>
              <p className="text-xs font-semibold text-[#667085]">
                แสดง {filteredHistory.length.toLocaleString("th-TH")} รายการ
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
                placeholder="ค้นหาเลขที่รายการ หรือผู้ขาย..."
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
                onChange={setFilterDate}
                placeholder="เลือกวันที่"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate("")}
                  className="absolute -right-1.5 -top-1.5 z-10 rounded-full bg-slate-200 p-1 text-slate-600 shadow-sm transition-all hover:bg-slate-300"
                >
                  <X className="h-3 w-3" strokeWidth={3} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <StockTabs current="history" onChangeTab={onChangeTab} />

      <div className="max-w-4xl mx-auto w-full px-3 md:px-0">
        <div className="mb-6 hidden justify-end sm:flex">
          <div className="text-right">
            <p className="mb-1 text-[11px] font-black uppercase tracking-[0.05em] text-[#45464d]">ยอดรวมทั้งหมด (หน้าปัจจุบัน)</p>
            <p className="text-[20px] font-black text-[#082A63]">
              {totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[12px]">THB</span>
            </p>
          </div>
        </div>

        <div className="mb-10 overflow-hidden rounded-lg border border-[#c6c6cd] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
          {groups.length > 0 ? (
            groups.map(([date, rows]) => (
              <section key={date}>
                <div className="border-b border-[#c6c6cd] bg-[#eceef0] px-5 py-1.5 md:px-10">
                  <span className="text-[11px] font-black uppercase tracking-[0.05em] text-[#45464d]">{getDateLabel(date)}</span>
                </div>

                {rows.map((row) => (
                  <div
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenDetail(row.id)}
                    onKeyDown={(e) => e.key === "Enter" && handleOpenDetail(row.id)}
                    className="group relative w-full cursor-pointer border-b border-[#c6c6cd] px-5 py-5 text-left transition hover:bg-[#f2f4f6] last:border-b-0 md:px-10 md:py-6"
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#22c55e]/10">
                        <CheckCircle2 className="h-6 w-6 text-[#22c55e]" fill="currentColor" stroke="#ffffff" strokeWidth={1.5} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="break-words text-[19px] font-black leading-tight text-black transition-colors group-hover:text-[#082A63]">
                            {row.supplierName}
                          </h3>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(row.id);
                            }}
                            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#c6c6cd] bg-white shadow-sm transition-all hover:bg-slate-50 active:scale-90 md:flex md:opacity-0 md:group-hover:opacity-100"
                          >
                            <Edit className="h-4 w-4 text-slate-600" />
                          </button>
                        </div>

                        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                            <p className="whitespace-nowrap text-[20px] font-black text-[#082A63]">
                              {row.totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <span className="ml-1 text-[12px] font-bold">THB</span>
                            </p>
                            <p className="whitespace-nowrap rounded-md bg-slate-50 px-2 py-0.5 font-mono text-[14px] font-bold text-slate-500">
                              {row.receiptNumber}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-4 sm:justify-end">
                            <div className="flex items-center text-[12px] font-bold text-[#76777d]">
                              <span>{row.itemCount} รายการ</span>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(row.id);
                              }}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#c6c6cd] bg-white shadow-sm active:scale-90 sm:hidden"
                            >
                              <Edit className="h-4.5 w-4.5 text-slate-600" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <ChevronRight className="hidden h-6 w-6 self-center text-[#76777d] transition group-hover:text-[#082A63] sm:block" strokeWidth={3} />
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
              <p className="mt-1 text-sm font-medium text-[#45464d]">เริ่มบันทึกรายการสินค้าที่เข้าคลังครั้งแรกได้ที่ปุ่มด้านบน</p>
            </div>
          )}
        </div>

        {hasMore && groups.length > 0 && (
          <div className="mt-12 pb-20 text-center">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="mx-auto flex items-center gap-2 font-bold text-[#082A63] hover:underline disabled:opacity-50"
            >
              {isLoadingMore ? <Loader2 className="h-5 w-5 animate-spin" /> : "ดูรายการย้อนหลังเพิ่มเติม"}
            </button>
          </div>
        )}
      </div>

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
            <Loader2 className="h-10 w-10 animate-spin text-[#082A63]" strokeWidth={2.5} />
            <p className="mt-4 animate-pulse text-[12px] font-black uppercase tracking-widest text-[#082A63]">กำลังดึงข้อมูล...</p>
          </div>
        </div>
      )}

      {previewImageUrl && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 p-4"
          onClick={() => {
            setPreviewImageUrl(null);
            setIsImageLoading(false);
          }}
        >
          <div
            className="relative max-h-[94dvh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setPreviewImageUrl(null);
                setIsImageLoading(false);
              }}
              className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg"
            >
              <X />
            </button>
            <div className="relative aspect-[3/4] w-full">
              {isImageLoading && <Loader2 className="absolute inset-0 m-auto h-10 w-10 animate-spin text-[#082A63]" />}
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
    </>
  );
}
