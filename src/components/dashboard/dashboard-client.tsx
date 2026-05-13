"use client";

import React, { useState, useMemo, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  TrendingUp,
  Bell,
  AlertCircle,
  ChevronRight,
  Phone,
  Truck,
  ClipboardList,
  ShoppingBag,
  Store,
  X,
  Loader2,
  BarChart3,
  MessageCircle,
  Package2,
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
  today: string;
  orderDate: string;
  expandedDetail: OrderDetailData | null;
  expandedOrderId: string;
  allOrders: IncomingOrderListItem[];
  products: OrderProductOption[];
};

function DashboardStatCard({
  title,
  value,
  unit,
  accent,
  icon,
  ghost,
}: {
  title: string;
  value: string;
  unit: string;
  accent: "blue" | "green" | "line" | "orange";
  icon: React.ReactNode;
  ghost: React.ReactNode;
}) {
  const tone = {
    blue: {
      value: "text-[#1746a2]",
      badge: "bg-[#eef3ff] text-[#1746a2]",
      ghost: "text-[#d7e0f2]",
    },
    green: {
      value: "text-[#10a760]",
      badge: "bg-[#ecfbf3] text-[#10a760]",
      ghost: "text-[#d8eadf]",
    },
    line: {
      value: "text-[#10a760]",
      badge: "bg-[#ecfbf3] text-[#10a760]",
      ghost: "text-[#dce6e5]",
    },
    orange: {
      value: "text-[#ff6b00]",
      badge: "bg-[#fff3e8] text-[#ff6b00]",
      ghost: "text-[#ece3db]",
    },
  }[accent];

  return (
    <div className="relative overflow-hidden rounded-[1.1rem] border border-[#eef2f7] bg-white pl-2.5 pr-2.5 pb-4 pt-4 shadow-[0_10px_22px_rgba(15,23,42,0.045)]">
      <div className="flex items-center gap-1.5">
        <div className={`flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full ${tone.badge}`}>
          {icon}
        </div>
        <span className="min-w-0 whitespace-nowrap text-[12.5px] font-bold leading-none text-[#111111] sm:text-[13px] md:text-base">
          {title}
        </span>
      </div>

      <div className="relative mt-5 min-h-[4.85rem]">
        <div className="relative z-10">
          <p className={`text-[2.55rem] font-black leading-none tabular-nums tracking-[-0.03em] sm:text-[2.85rem] ${tone.value}`}>
            {value}
          </p>
          <p className="mt-2 text-[12.5px] font-extrabold text-slate-500">{unit}</p>
        </div>

        <div className={`pointer-events-none absolute bottom-0 right-[-0.15rem] opacity-[0.72] ${tone.ghost}`}>
          {ghost}
        </div>
      </div>
    </div>
  );
}

export function DashboardClient({
  overview,
  storeStatusSummary,
  stockProducts,
  stockSuppliers,
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

      {/* Header Section */}
      <header className="px-5 pt-8 mb-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden">
                <Image src="/ty-noodles-logo-cropped.png" alt="T&Y Noodles" fill className="object-contain" />
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-[#002581] leading-tight tracking-tight">ภาพรวมวันนี้</h1>
            </div>
            <p className="mt-1 text-[14px] font-bold text-slate-400 md:text-base">สวัสดี T&Y Noodles • {fmtThaiDateLong(today)}</p>
          </div>
          <div className="hidden md:flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-sm font-bold text-slate-600">ระบบทำงานปกติ</span>
          </div>
        </div>
      </header>

      <main className="px-5 mt-4 space-y-8 max-w-7xl mx-auto">

        {/* Top Row: Status + Actions */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">

          {/* Quick Actions (4 units on XL) */}
          <div className="order-1 grid grid-cols-2 gap-4 xl:col-span-4 xl:order-2 xl:grid-cols-1">
            <button
              onClick={() => openCreateOrder()}
              className="flex min-h-[4.25rem] flex-row items-center justify-center gap-3 rounded-[1rem] bg-[#0038b8] px-4 py-4 text-white shadow-[0_10px_24px_rgba(0,56,184,0.22)] transition-transform active:scale-95"
            >
              <Phone className="h-5 w-5 shrink-0 rotate-90" fill="white" strokeWidth={0} />
              <span className="whitespace-nowrap text-base font-extrabold md:text-lg">รับออเดอร์</span>
            </button>

            <button
              onClick={() => setIsStockModalOpen(true)}
              className="flex min-h-[4.25rem] flex-row items-center justify-center gap-3 rounded-[1rem] border border-[#d8f2df] bg-[#eefcf0] px-4 py-4 text-[#14a44d] shadow-[0_10px_24px_rgba(20,164,77,0.08)] transition-transform active:scale-95"
            >
              <Truck className="h-5 w-5 shrink-0" strokeWidth={2.2} />
              <span className="whitespace-nowrap text-base font-extrabold md:text-lg">รับสินค้า</span>
            </button>
          </div>

          {/* Store Status Summary (8 units on XL) */}
          <section className="order-2 flex flex-col gap-4 md:gap-6 xl:col-span-8 xl:order-1">
            <button
              onClick={() => setViewingStores({ title: "ร้านค้าทั้งหมด", stores: storeStatusSummary.allStores })}
              className="group flex w-full items-center gap-5 rounded-[1.35rem] border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-[#002581]/30 hover:shadow-md active:scale-[0.99] md:p-7"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-[#002581]/5 text-[#002581] transition-colors group-hover:bg-[#002581] group-hover:text-white md:h-20 md:w-20">
                <Store className="h-7 w-7 md:h-10 md:w-10" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[14px] font-bold text-slate-400 md:text-base">ร้านค้าทั้งหมดในระบบ</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black leading-none tracking-tight text-slate-900 tabular-nums md:text-5xl">
                    {fmtNumber(storeStatusSummary.allStores.length)}
                  </p>
                  <span className="text-sm font-bold text-slate-400 md:text-lg">ร้านค้า</span>
                </div>
              </div>
              <ChevronRight className="h-8 w-8 text-slate-200 transition-colors group-hover:text-[#002581]" strokeWidth={3} />
            </button>

            <div className="grid grid-cols-2 gap-4 md:gap-6">
              <button
                onClick={() => setViewingStores({ title: "ร้านค้าที่ยังไม่ได้สั่ง", stores: storeStatusSummary.unorderedStores })}
                className="group flex items-center gap-4 rounded-[1.35rem] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-rose-200 hover:shadow-md active:scale-[0.98] md:p-6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition-colors group-hover:bg-rose-600 group-hover:text-white md:h-16 md:w-16">
                  <ShoppingBag className="h-6 w-6 md:h-8 md:w-8" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 whitespace-nowrap text-[12px] font-bold leading-none text-slate-400 md:text-base">ยังไม่ได้สั่ง</p>
                  <p className="text-2xl font-black leading-none text-rose-600 tabular-nums md:text-4xl">
                    {fmtNumber(storeStatusSummary.unorderedStores.length)}
                  </p>
                </div>
              </button>

              <button
                onClick={() => setViewingStores({ title: "ร้านค้าที่สั่งแล้ว", stores: storeStatusSummary.orderedStores })}
                className="group flex items-center gap-4 rounded-[1.35rem] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-200 hover:shadow-md active:scale-[0.98] md:p-6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white md:h-16 md:w-16">
                  <ClipboardList className="h-6 w-6 md:h-8 md:w-8" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 whitespace-nowrap text-[12px] font-bold leading-none text-slate-400 md:text-base">สั่งแล้ววันนี้</p>
                  <p className="text-2xl font-black leading-none text-emerald-600 tabular-nums md:text-4xl">
                    {fmtNumber(storeStatusSummary.orderedStores.length)}
                  </p>
                </div>
              </button>
            </div>
          </section>
        </div>

        {/* Statistics Grid (2 cols on mobile, 4 on desktop) */}
        <section className="-mx-2 grid grid-cols-2 gap-2.5 px-2 md:mx-0 md:gap-5 md:px-0 lg:grid-cols-4">
          <DashboardStatCard
            title="รวมออเดอร์วันนี้"
            value={fmtNumber(kpi.todayOrderCount)}
            unit="รายการ"
            accent="blue"
            icon={<ClipboardList className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.15} />}
            ghost={<ClipboardList className="h-[4.2rem] w-[4.2rem] sm:h-[4.6rem] sm:w-[4.6rem]" strokeWidth={1.15} />}
          />

          <DashboardStatCard
            title="ยอดขายวันนี้"
            value={`฿${fmtMoney(kpi.todayOrderAmount)}`}
            unit="บาท"
            accent="green"
            icon={<TrendingUp className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.15} />}
            ghost={<BarChart3 className="h-[4.2rem] w-[4.2rem] sm:h-[4.6rem] sm:w-[4.6rem]" strokeWidth={1.15} />}
          />

          <DashboardStatCard
            title="ออเดอร์จากLINE"
            value={fmtNumber(kpi.submittedOrderCount)}
            unit="รายการ"
            accent="line"
            icon={<LineAppIcon className="h-[1.2rem] w-[1.2rem]" />}
            ghost={<MessageCircle className="h-[4.2rem] w-[4.2rem] sm:h-[4.6rem] sm:w-[4.6rem]" strokeWidth={1.15} />}
          />

          <Link href="/stock" className="block transition-transform active:scale-[0.98]">
            <DashboardStatCard
              title="สต็อคขาด"
              value={fmtNumber(kpi.lowStockCount)}
              unit="รายการ"
              accent="orange"
              icon={<Bell className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.15} />}
              ghost={
                <div className="relative h-[4.2rem] w-[4.2rem] sm:h-[4.6rem] sm:w-[4.6rem]">
                  <Package2 className="h-full w-full" strokeWidth={1.15} />
                  <AlertCircle className="absolute -bottom-1 -right-1 h-5 w-5 text-[#ff7f11]" strokeWidth={1.6} />
                </div>
              }
            />
          </Link>
        </section>

        {/* Mid Row: Trend */}
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

        {/* Bottom Row: Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">

          <section>
            <h2 className="mb-6 px-2 text-2xl font-black tracking-tight text-slate-900">สินค้าขายดี เดือนนี้</h2>
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
                    <p className="mt-1 text-base font-black text-[#28A745]">฿{fmtMoney(product.totalAmount)}</p>
                  </div>
                  <div className="hidden md:block pr-4">
                    <ChevronRight className="h-6 w-6 text-slate-100 group-hover:text-slate-300 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-6 px-2 text-2xl font-black tracking-tight text-slate-900">ลูกค้าชั้นนำ เดือนนี้</h2>
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
                    <p className="text-xl font-black text-[#002581] md:text-2xl">฿{fmtMoney(customer.totalAmount)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

      </main>

      {/* Modals */}
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
                            <p className="text-xs font-bold uppercase tracking-tighter text-slate-400">รหัส: {store.code || store.id.slice(0, 8)}</p>
                            {isOrdered ? (
                              <span className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tight text-emerald-600">สั่งแล้ววันนี้</span>
                            ) : (
                              <span className="rounded-md border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tight text-rose-600">ยังไม่สั่ง</span>
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
        <StockReceiveForm
          products={stockProducts}
          suppliers={stockSuppliers}
          returnHref="/dashboard"
          onClose={() => setIsStockModalOpen(false)}
        />
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
