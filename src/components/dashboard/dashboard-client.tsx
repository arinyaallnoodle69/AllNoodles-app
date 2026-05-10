"use client";

import React, { useState, useMemo, useTransition } from "react";
import Image from "next/image";
import {
  TrendingUp,
  Bell,
  ChevronRight,
  Phone,
  Truck,
  ClipboardList,
  ShoppingBag,
  Store,
  X,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid
} from "recharts";
import { useCreateOrder } from "@/components/orders/create-order-context";
import { StockReceiveForm } from "@/components/settings/stock-receive-form";
import { IncomingOrderModal } from "@/components/orders/incoming-order-modal";
import type { DashboardOverview } from "@/lib/dashboard/overview";
import type { OrderStoreStatusSummary } from "@/lib/orders/store-status";
import type { StockProductOption, StockSupplierOption } from "@/lib/stock/admin";
import type { OrderDetailData, IncomingOrderListItem } from "@/lib/orders/detail";
import type { OrderProductOption } from "@/lib/orders/manage";
import { LineAppIcon } from "@/components/icons/line-app-icon";
import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  overview: DashboardOverview;
  storeStatusSummary: OrderStoreStatusSummary;
  stockProducts: StockProductOption[];
  stockSuppliers: StockSupplierOption[];
  displayName: string;
  today: string;
  orderDate: string;
  expandedDetail: OrderDetailData | null;
  expandedOrderId: string;
  allOrders: IncomingOrderListItem[];
  products: OrderProductOption[];
};

export function DashboardClient({
  overview,
  storeStatusSummary,
  stockProducts,
  stockSuppliers,
  displayName,
  today,
  orderDate,
  expandedDetail,
  expandedOrderId,
  allOrders,
  products
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNavigating, startTransition] = useTransition();
  const { open: openCreateOrder } = useCreateOrder();
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [viewingStores, setViewingStores] = useState<{ title: string; stores: Array<{ id: string; name: string; code?: string; latestOrderId?: string | null }> } | null>(null);

  const orderedStoreIds = useMemo(() => new Set(storeStatusSummary.orderedStores.map(s => s.id)), [storeStatusSummary.orderedStores]);

  const { kpi, weeklyTrend, topCustomers, topProducts } = overview;

  // Formatters
  const fmtNumber = (n: number) => (n ?? 0).toLocaleString("th-TH");
  const fmtMoney = (n: number) => (n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  function fmtThaiDateLong(iso: string) {
    if (!iso) return "";
    return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(new Date(`${iso}T00:00:00+07:00`));
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 pb-24 font-apple-ui">

      {/* ── Header Section (Responsive) ── */}
      <header className="px-5 pt-8 mb-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-[#002581] leading-tight tracking-tight">ภาพรวมวันนี้</h1>
            <p className="text-[14px] md:text-base font-bold text-slate-400 mt-1">สวัสดี {displayName} • {fmtThaiDateLong(today)}</p>
          </div>
          <div className="hidden md:flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-sm font-bold text-slate-600">ระบบทำงานปกติ</span>
          </div>
        </div>
      </header>

      <main className="px-5 mt-4 space-y-8 max-w-7xl mx-auto">

        {/* ── Top Row: Status + Actions ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

          {/* Store Status Summary (8 units on XL) */}
          <section className="xl:col-span-8 flex flex-col gap-4 md:gap-6">
            {/* Top Row: ร้านค้าทั้งหมด */}
            <button
              onClick={() => setViewingStores({ title: "ร้านค้าทั้งหมด", stores: storeStatusSummary.allStores })}
              className="group flex items-center gap-5 bg-white p-5 md:p-7 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md hover:border-[#002581]/30 transition-all active:scale-[0.99] text-left w-full"
            >
              <div className="flex h-14 w-14 md:h-20 md:w-20 shrink-0 items-center justify-center rounded-3xl bg-[#002581]/5 text-[#002581] group-hover:bg-[#002581] group-hover:text-white transition-colors">
                <Store className="h-7 w-7 md:h-10 md:w-10" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">ร้านค้าทั้งหมดในระบบ</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl md:text-5xl font-black text-slate-900 tabular-nums leading-none tracking-tight">
                    {fmtNumber(storeStatusSummary.allStores.length)}
                  </p>
                  <span className="text-sm md:text-lg font-bold text-slate-400">ร้านค้า</span>
                </div>
              </div>
              <ChevronRight className="h-8 w-8 text-slate-200 group-hover:text-[#002581] transition-colors" strokeWidth={3} />
            </button>

            {/* Bottom Row: ยังไม่สั่ง + สั่งแล้ว */}
            <div className="grid grid-cols-2 gap-4 md:gap-6">
              {/* ยังไม่สั่ง */}
              <button
                onClick={() => setViewingStores({ title: "ร้านที่ยังไม่สั่ง", stores: storeStatusSummary.unorderedStores })}
                className="group flex items-center gap-4 bg-white p-4 md:p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md hover:border-rose-200 transition-all active:scale-[0.98] text-left"
              >
                <div className="flex h-12 w-12 md:h-16 md:w-16 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <ShoppingBag className="h-6 w-6 md:h-8 md:w-8" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">ยังไม่สั่ง</p>
                  <p className="text-2xl md:text-4xl font-black text-rose-600 tabular-nums leading-none">
                    {fmtNumber(storeStatusSummary.unorderedStores.length)}
                  </p>
                </div>
              </button>

              {/* สั่งแล้ว */}
              <button
                onClick={() => setViewingStores({ title: "ร้านที่สั่งแล้ว", stores: storeStatusSummary.orderedStores })}
                className="group flex items-center gap-4 bg-white p-4 md:p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all active:scale-[0.98] text-left"
              >
                <div className="flex h-12 w-12 md:h-16 md:w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <ClipboardList className="h-6 w-6 md:h-8 md:w-8" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">สั่งแล้ววันนี้</p>
                  <p className="text-2xl md:text-4xl font-black text-emerald-600 tabular-nums leading-none">
                    {fmtNumber(storeStatusSummary.orderedStores.length)}
                  </p>
                </div>
              </button>
            </div>
          </section>

          {/* Quick Actions (4 units on XL) */}
          <div className="xl:col-span-4 grid grid-cols-2 xl:grid-cols-1 gap-4">
            <button
              onClick={() => openCreateOrder()}
              className="bg-[#002581] text-white rounded-[2rem] py-6 flex flex-row items-center justify-center space-x-3 shadow-xl shadow-blue-900/10 active:scale-95 transition-transform px-4"
            >
              <Phone className="h-6 w-6 rotate-90 shrink-0" fill="white" strokeWidth={0} />
              <span className="text-lg md:text-xl font-black whitespace-nowrap">รับออเดอร์</span>
            </button>

            <button
              onClick={() => setIsStockModalOpen(true)}
              className="bg-[#E6F4EA] text-[#28A745] rounded-[2rem] py-6 flex flex-row items-center justify-center space-x-3 active:scale-95 transition-transform border border-[#D1EAD8] px-4"
            >
              <Truck className="h-6 w-6 shrink-0" strokeWidth={2.5} />
              <span className="text-lg md:text-xl font-black whitespace-nowrap">รับสินค้า</span>
            </button>
          </div>
        </div>

        {/* ── Statistics Grid (2 cols on mobile, 4 on desktop) ── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-50 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col relative overflow-hidden group">
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-blue-50 p-2 rounded-xl group-hover:bg-[#002581] group-hover:text-white transition-colors">
                <ClipboardList className="h-5 w-5" strokeWidth={2.5} />
              </div>
              <div className="h-10 flex items-center">
                <span className="text-[13px] md:text-sm font-bold text-slate-700 leading-tight">ออเดอร์วันนี้</span>
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-5xl md:text-6xl font-black text-slate-800 tabular-nums">{fmtNumber(kpi.todayOrderCount)}</span>
              <span className="text-sm font-bold text-slate-400">รายการ</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-50 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col relative overflow-hidden group">
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-green-50 p-2 rounded-xl group-hover:bg-[#28A745] group-hover:text-white transition-colors">
                <TrendingUp className="h-5 w-5" strokeWidth={2.5} />
              </div>
              <div className="h-10 flex items-center">
                <span className="text-[13px] md:text-sm font-bold text-slate-700 leading-tight">ยอดขายวันนี้</span>
              </div>
            </div>
            <div className="flex items-baseline space-x-1">
              <span className="text-[28px] md:text-3xl font-black text-[#28A745] tabular-nums">฿{fmtMoney(kpi.todayOrderAmount)}</span>
              <span className="text-sm font-bold text-slate-400"></span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-50 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col relative overflow-hidden group">
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-[#06C755]/10 p-2 rounded-xl text-[#06C755] group-hover:bg-[#06C755] group-hover:text-white transition-colors">
                <LineAppIcon className="h-6 w-6" />
              </div>
              <div className="h-10 flex items-center">
                <span className="text-[13px] md:text-sm font-bold text-slate-700 leading-tight">ออเดอร์จาก LINE</span>
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-5xl md:text-6xl font-black text-[#28A745] tabular-nums">{fmtNumber(kpi.submittedOrderCount)}</span>
              <span className="text-sm font-bold text-slate-400">รายการ</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-50 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col relative overflow-hidden group">
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-orange-50 p-2 rounded-xl group-hover:bg-[#FF6B00] group-hover:text-white transition-colors">
                <Bell className="h-5 w-5 text-[#FF6B00] group-hover:text-white" strokeWidth={2.5} />
              </div>
              <div className="h-10 flex items-center">
                <span className="text-[13px] md:text-sm font-bold text-slate-700 leading-tight">แจ้งสต็อกขาด</span>
              </div>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-5xl md:text-6xl font-black text-[#FF6B00] tabular-nums">{fmtNumber(kpi.lowStockCount)}</span>
              <span className="text-sm font-bold text-slate-400">รายการ</span>
            </div>
          </div>
        </section>

        {/* ── Mid Row: Trend (Full Width when Tasks are hidden) ── */}
        <div className="grid grid-cols-1 gap-8">

          {/* Functional Task List - Hidden per user request */}
          {/* 
          <section className="space-y-6">
            ...
          </section> 
          */}

          {/* Sales Trend Chart */}
          <section className="bg-white p-8 rounded-[2.5rem] border border-slate-50 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex flex-col">
            <div className="mb-8 flex items-center justify-between">
              <h3 className="text-xl font-black text-[#002581]">แนวโน้มยอดขาย 7 วัน</h3>
              <div className="bg-slate-50 px-3 py-1 rounded-full text-[11px] font-black text-slate-400 uppercase tracking-widest">Revenue Tracking</div>
            </div>
            <div className="flex-1 h-[350px] min-h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: "#94a3b8" }} dy={12} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }} />
                  <Tooltip
                    cursor={{ fill: "#F8FAFC", radius: 12 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-50 animate-in fade-in zoom-in-95 duration-200">
                            <p className="text-sm font-bold text-slate-400 mb-1">{payload[0].payload.date}</p>
                            <p className="text-xl font-black text-[#002581]">฿{fmtMoney(Number(payload[0].value))}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="amount" radius={[8, 8, 8, 8]} barSize={32}>
                    {weeklyTrend.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === weeklyTrend.length - 1 ? "#002581" : "#E2E8F0"} className="hover:fill-[#002581] transition-colors duration-300" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* ── Bottom Row: Rankings (Side by Side on Desktop) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">

          <section>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-6 px-2">สินค้าขายดี เดือนนี้</h2>
            <div className="flex flex-col gap-4">
              {topProducts.map((product, idx) => (
                <div key={product.productId} className="flex items-center gap-5 bg-white p-5 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-50 hover:shadow-md transition-shadow group">
                  <div className="relative h-16 w-16 md:h-20 md:w-20 rounded-3xl bg-slate-50 flex items-center justify-center font-black text-2xl text-[#002581] overflow-hidden group-hover:scale-105 transition-transform">
                    {product.imageUrl ? (
                      <Image src={product.imageUrl} alt={product.productName} fill className="object-cover" />
                    ) : (
                      <ShoppingBag className="h-10 w-10 text-slate-200" />
                    )}
                    <div className="absolute left-0 top-0 bg-[#002581] text-white w-6 h-6 flex items-center justify-center text-xs font-black rounded-br-xl shadow-md">{idx + 1}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg md:text-xl font-black text-slate-800 truncate">{product.productName}</p>
                    <p className="text-base font-black text-[#28A745] mt-1">฿{fmtMoney(product.totalAmount)}</p>
                  </div>
                  <div className="hidden md:block pr-4">
                    <ChevronRight className="h-6 w-6 text-slate-100 group-hover:text-slate-300 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-6 px-2">ลูกค้าชั้นนำ เดือนนี้</h2>
            <div className="flex flex-col gap-4">
              {topCustomers.map((customer, idx) => (
                <div key={customer.customerId} className="flex items-center gap-5 bg-white p-5 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-slate-50 hover:shadow-md transition-shadow group">
                  <div className="h-14 w-14 md:h-16 md:w-16 rounded-[1.5rem] bg-blue-50 flex items-center justify-center text-2xl font-black text-[#002581] group-hover:bg-[#002581] group-hover:text-white transition-all">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg md:text-xl font-black text-slate-800 truncate">{customer.customerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl md:text-2xl font-black text-[#002581]">฿{fmtMoney(customer.totalAmount)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

      </main>

      {/* ── Modals ── */}
      {viewingStores && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[6px] sm:items-center sm:p-4">
          <div className="w-full max-w-xl animate-in slide-in-from-bottom duration-300 rounded-t-[3rem] bg-white pb-12 pt-4 sm:rounded-[3rem] shadow-2xl overflow-hidden">
            <div className="mb-6 flex justify-center">
              <div className="h-1.5 w-16 rounded-full bg-slate-200" />
            </div>
            <div className="px-8 mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-[#001E5D] tracking-tight">{viewingStores.title}</h3>
                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Store Registry</p>
              </div>
              <button
                onClick={() => setViewingStores(null)}
                className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 active:scale-90 transition-transform"
              >
                <X className="h-6 w-6" strokeWidth={3} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto space-y-px no-scrollbar pb-10">
              {viewingStores.stores.length === 0 ? (
                <div className="py-24 text-center flex flex-col items-center">
                  <div className="bg-slate-50 p-7 rounded-full mb-5">
                    <Store className="h-14 w-14 text-slate-200" />
                  </div>
                  <p className="text-xl font-black text-slate-300">ไม่มีข้อมูลร้านค้าในขณะนี้</p>
                </div>
              ) : (
                <div className="relative">
                  {isNavigating && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                      <Loader2 className="h-10 w-10 animate-spin text-[#001E5D]" strokeWidth={3} />
                    </div>
                  )}
                  {viewingStores.stores.map((store) => {
                    const isOrdered = orderedStoreIds.has(store.id);
                    return (
                      <button
                        key={store.id}
                        onClick={() => {
                          if (isOrdered && store.latestOrderId) {
                            startTransition(() => {
                              const p = new URLSearchParams(searchParams.toString());
                              p.set("expanded", store.latestOrderId!);
                              router.push("/dashboard?" + p.toString(), { scroll: false });
                              setViewingStores(null);
                            });
                          } else {
                            openCreateOrder(store.id);
                          }
                        }}
                        className="flex w-full items-center gap-5 bg-white px-6 py-6 border-b border-slate-100 hover:bg-slate-50 transition-colors group text-left disabled:opacity-50"
                        disabled={isNavigating}
                      >
                        <div className="h-14 w-14 shrink-0 rounded-2xl bg-slate-50 flex items-center justify-center text-[#001E5D] shadow-sm group-hover:bg-[#001E5D] group-hover:text-white transition-all">
                          <Store className="h-7 w-7" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-800 text-lg leading-tight truncate">{store.name}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">รหัส: {store.code || store.id.slice(0, 8)}</p>
                            {isOrdered ? (
                              <span className="bg-emerald-50 text-emerald-600 text-[10px] font-black px-2 py-0.5 rounded-md border border-emerald-100 uppercase tracking-tight">สั่งแล้ววันนี้</span>
                            ) : (
                              <span className="bg-rose-50 text-rose-600 text-[10px] font-black px-2 py-0.5 rounded-md border border-rose-100 uppercase tracking-tight">ยังไม่สั่ง</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-6 w-6 text-slate-200 group-hover:text-[#001E5D] group-hover:translate-x-1 transition-all" strokeWidth={3} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isStockModalOpen && (
        <div className="fixed inset-0 z-[200] animate-in fade-in duration-300">
          <StockReceiveForm
            products={stockProducts}
            suppliers={stockSuppliers}
            returnHref="/dashboard"
            onClose={() => setIsStockModalOpen(false)}
          />
        </div>
      )}

      {expandedOrderId && (
        <IncomingOrderModal
          allOrders={allOrders}
          date={orderDate}
          detail={expandedDetail}
          expandedId={expandedOrderId}
          products={products}
          searchTerm=""
        />
      )}
    </div>
  );
}
