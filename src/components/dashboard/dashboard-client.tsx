"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  Bell,
  ChevronRight,
  ClipboardList,
  HandCoins,
  Eye,
  Loader2,
  MessageCircle,
  Package2,
  Phone,
  ShoppingBag,
  Store,
  TrendingUp,
  Truck,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchIncomingOrderModalDataAction } from "@/app/orders/incoming/actions";
import { fetchDashboardStockProductsAction } from "@/app/dashboard/actions";
import { LineAppIcon } from "@/components/icons/line-app-icon";
import { useCreateOrder } from "@/components/orders/create-order-context";
import { IncomingOrderModal } from "@/components/orders/incoming-order-modal";
import { StockReceiveForm } from "@/components/settings/stock-receive-form";
import type { DashboardOverview } from "@/lib/dashboard/overview";
import type { IncomingOrderListItem, OrderDetailData } from "@/lib/orders/detail";
import type { OrderProductOption } from "@/lib/orders/manage";
import type { OrderStoreStatusSummary } from "@/lib/orders/store-status";
import type { StockProductOption } from "@/lib/stock/admin";

type Props = {
  overview: DashboardOverview;
  storeStatusSummary: OrderStoreStatusSummary;
  stockWarehouses: {
    id: string;
    name: string;
    slug: string;
  }[];
  today: string;
  orderDate: string;
  expandedDetail: OrderDetailData | null;
  expandedOrderId: string;
  allOrders: IncomingOrderListItem[];
  products: OrderProductOption[];
};

type StoreListModalState = {
  title: string;
  stores: Array<{
    id: string;
    name: string;
    code?: string;
    latestOrderId?: string | null;
    vehicleId?: string | null;
    vehicleName?: string | null;
  }>;
};

type LineOrderModalState = {
  allOrders: IncomingOrderListItem[];
  detail: OrderDetailData | null;
  expandedId: string;
  products: OrderProductOption[];
};

type FinancialRevealState =
  | {
      kind: "metric";
      title: string;
      rows: Array<{ label: string; value: string; tone: "green" | "rose" | "teal" }>;
    }
  | {
      kind: "dailyTable";
      title: string;
      rows: Array<{ cost: number; isoDate: string; profit: number; revenue: number }>;
    };

function DashboardStatCard({
  title,
  value,
  valueNode,
  unit,
  accent,
  icon,
  ghost,
  className = "",
  compact = false,
}: {
  title: string;
  value: string;
  valueNode?: React.ReactNode;
  unit?: string;
  accent: "blue" | "green" | "line" | "orange" | "teal" | "rose";
  icon: React.ReactNode;
  ghost: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const tone = {
    blue: {
      value: "text-[#4A148C]",
      badge: "bg-[#EA80FC] text-[#4A148C]",
      ghost: "text-[#eadfbe]",
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
    teal: {
      value: "text-[#0f766e]",
      badge: "bg-[#ecfdf5] text-[#0f766e]",
      ghost: "text-[#d6efe9]",
    },
    rose: {
      value: "text-[#e11d48]",
      badge: "bg-[#fff1f2] text-[#e11d48]",
      ghost: "text-[#ffe4e6]",
    },
  }[accent];

  return (
    <div
      className={`relative overflow-hidden rounded-[1.1rem] border border-[#eef2f7] bg-white pl-2.5 pr-2.5 shadow-[0_10px_22px_rgba(15,23,42,0.045)] dashboard-stat-card ${compact ? "pb-3 pt-3" : "pb-4 pt-4"} ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <div
          className={`flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full ${tone.badge}`}
        >
          {icon}
        </div>
        <span className="min-w-0 whitespace-nowrap text-[17px] font-extrabold leading-none text-[#4A148C] sm:text-[18px] md:text-xl">
          {title}
        </span>
      </div>

      <div className={`relative ${compact ? "mt-3 min-h-[3.7rem]" : "mt-5 min-h-[4.85rem]"}`}>
        <div className="relative z-10">
          <p
            className={`font-black leading-none tabular-nums tracking-[-0.03em] ${compact ? "text-[1.4rem] sm:text-[2.15rem]" : "text-[1.5rem] sm:text-[2.55rem]"} ${tone.value}`}
          >
            {valueNode ?? value}
          </p>
          {unit && (
            <p className={`${compact ? "mt-1" : "mt-2"} text-[12.5px] font-extrabold text-slate-500 md:text-[16px]`}>
              {unit}
            </p>
          )}
        </div>

        <div className={`pointer-events-none absolute bottom-0 right-[-0.15rem] opacity-[0.72] ${tone.ghost}`}>
          {ghost}
        </div>
      </div>
    </div>
  );
}

function HiddenMetricEye() {
  return (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#E1BEE7] bg-[#F3E5F5] text-[#4A148C] shadow-[0_8px_18px_rgba(74,20,140,0.12)]">
      <Eye className="h-5.5 w-5.5" strokeWidth={2.7} />
    </span>
  );
}

function toThaiShortDate(isoDate: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${isoDate}T00:00:00+07:00`));
}

function toThaiLongDate(isoDate: string) {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${isoDate}T00:00:00+07:00`));
}



function formatThaiDateTime(value: string) {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);

  return `${datePart} ${timePart}`;
}



export function DashboardClient({
  overview,
  storeStatusSummary,
  stockWarehouses,
  today,
  orderDate,
  expandedDetail,
  expandedOrderId,
  allOrders,
  products,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNavigating, startTransition] = useTransition();
  const { open: openCreateOrder } = useCreateOrder();
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockProducts, setStockProducts] = useState<StockProductOption[] | null>(null);
  const [isStockProductsLoading, setIsStockProductsLoading] = useState(false);

  // The stock-receive product catalog is heavy — load it on demand the first
  // time the user opens the modal, never on the initial dashboard render.
  function openStockModal() {
    setIsStockModalOpen(true);
    if (stockProducts !== null || isStockProductsLoading) return;
    setIsStockProductsLoading(true);
    fetchDashboardStockProductsAction()
      .then((loaded) => setStockProducts(loaded))
      .catch(() => setStockProducts([]))
      .finally(() => setIsStockProductsLoading(false));
  }
  const [isLineOrdersDrawerOpen, setIsLineOrdersDrawerOpen] = useState(false);
  const [isLineOrdersDrawerClosing, setIsLineOrdersDrawerClosing] = useState(false);
  const [lineOrderModal, setLineOrderModal] = useState<LineOrderModalState | null>(null);
  const [financialReveal, setFinancialReveal] = useState<FinancialRevealState | null>(null);
  const [isFinancialRevealClosing, setIsFinancialRevealClosing] = useState(false);

  function closeLineOrdersDrawer() {
    if (isLineOrdersDrawerClosing) return;
    setIsLineOrdersDrawerClosing(true);
    setTimeout(() => {
      setIsLineOrdersDrawerOpen(false);
      setIsLineOrdersDrawerClosing(false);
    }, 450);
  }

  function closeFinancialReveal() {
    if (isFinancialRevealClosing) return;
    setIsFinancialRevealClosing(true);
    setTimeout(() => {
      setFinancialReveal(null);
      setIsFinancialRevealClosing(false);
    }, 350);
  }
  const [viewingStores, setViewingStores] = useState<StoreListModalState | null>(null);
  const [isViewingStoresClosing, setIsViewingStoresClosing] = useState(false);
  const [selectedStoreVehicleId, setSelectedStoreVehicleId] = useState<string | "__all__">("__all__");
  const storeVehicleTabsContainerRef = useRef<HTMLDivElement>(null);
  const [storeVehicleUnderlineStyle, setStoreVehicleUnderlineStyle] = useState<React.CSSProperties | null>(null);

  function closeViewingStores() {
    if (isViewingStoresClosing) return;
    setIsViewingStoresClosing(true);
    setTimeout(() => {
      setViewingStores(null);
      setIsViewingStoresClosing(false);
    }, 450);
  }

  const [now, setNow] = useState<Date | null>(null);
  const [prevSs, setPrevSs] = useState("");

  useEffect(() => {
    const updateClock = () => {
      const next = new Date();
      setNow((current) => {
        if (current) {
          setPrevSs(String(current.getSeconds()).padStart(2, "0"));
        }
        return next;
      });
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const orderedStoreIds = useMemo(
    () => new Set(storeStatusSummary.orderedStores.map((store) => store.id)),
    [storeStatusSummary.orderedStores],
  );

  const visibleViewingStores = useMemo(() => {
    const stores = viewingStores?.stores ?? [];
    if (selectedStoreVehicleId === "__all__") return stores;
    return stores.filter((store) => store.vehicleId === selectedStoreVehicleId);
  }, [selectedStoreVehicleId, viewingStores]);

  useEffect(() => {
    const container = storeVehicleTabsContainerRef.current;
    if (!container) return;

    const timer = window.setTimeout(() => {
      const activeEl = container.querySelector('[data-active="true"]') as HTMLElement | null;
      if (!activeEl) {
        setStoreVehicleUnderlineStyle(null);
        return;
      }

      setStoreVehicleUnderlineStyle({
        left: `${activeEl.offsetLeft}px`,
        width: `${activeEl.offsetWidth}px`,
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedStoreVehicleId, storeStatusSummary.vehicles, viewingStores]);

  function handleStoreVehicleSelect(id: string | "__all__", event: React.MouseEvent<HTMLButtonElement>) {
    setSelectedStoreVehicleId(id);
    setStoreVehicleUnderlineStyle({
      left: `${event.currentTarget.offsetLeft}px`,
      width: `${event.currentTarget.offsetWidth}px`,
    });
    event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  const {
    kpi,
    dailyPerformanceRows,
    lineOrders,
  } = overview;

  const fmtNumber = (value: number) => (value ?? 0).toLocaleString("th-TH");
  const fmtMoney = (value: number) =>
    (value ?? 0).toLocaleString("th-TH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });



  async function openLineOrderDetail(orderId: string | null) {
    if (!orderId) {
      alert("รายการนี้ยังไม่ได้ผูกร้านค้า จึงยังไม่มีหน้ารายละเอียดออเดอร์");
      return;
    }

    setIsLineOrdersDrawerOpen(false);

    // Open the modal instantly with a loading skeleton state
    setLineOrderModal({
      allOrders: [],
      detail: null,
      expandedId: orderId,
      products: [],
    });

    try {
      const result = await fetchIncomingOrderModalDataAction(orderId, orderDate);
      if (result.error || !result.detail) {
        alert(result.error ?? "โหลดรายละเอียดออเดอร์ไม่สำเร็จ");
        setLineOrderModal(null);
        return;
      }

      setLineOrderModal({
        allOrders: result.allOrders,
        detail: result.detail,
        expandedId: orderId,
        products: result.products,
      });
    } catch (error) {
      console.error("[dashboard:openLineOrderDetail]", error);
      alert("โหลดรายละเอียดออเดอร์ไม่สำเร็จ");
      setLineOrderModal(null);
    }
  }

  const dailySummaryRows = [...dailyPerformanceRows].reverse().slice(0, 7);

  return (
    <div className="min-h-screen bg-background pb-24 font-apple-ui text-slate-800 dashboard-mobile-large-text">
      <header className="relative mx-auto mb-2 max-w-7xl overflow-hidden px-5 pt-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 overflow-hidden bg-transparent transition-transform hover:scale-105">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/api/brand/logo"
                  alt="All Noodles"
                  className="absolute inset-0 h-full w-full object-contain mix-blend-multiply"
                />
              </div>
              <div>
                <h1 className="text-4xl font-black leading-none tracking-tight text-[#4A148C] sm:text-6xl bg-gradient-to-r from-[#4A148C] via-[#EA80FC] to-[#EA80FC] bg-clip-text text-transparent">
                  All Noodles
                </h1>
                <p className="mt-2 text-[14px] font-bold text-slate-500 md:text-base flex items-center">
                  {toThaiLongDate(today)} • 
                  {now ? (
                    <>
                      <span className="ml-1.5 tabular-nums">
                        {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}:
                      </span>
                      <span className="relative inline-block h-[1em] w-[2ch] overflow-hidden tabular-nums leading-none">
                        <span key={`prev-${prevSs}`} className="absolute left-0 top-0 animate-slide-up-out leading-none">
                          {prevSs}
                        </span>
                        <span key={`curr-${String(now.getSeconds()).padStart(2, "0")}`} className="absolute left-0 top-0 animate-slide-up-in leading-none">
                          {String(now.getSeconds()).padStart(2, "0")}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="ml-1.5 tabular-nums">--:--:--</span>
                  )}
                </p>
              </div>
            </div>
            <style>{`
              @keyframes slideUpOut {
                from { transform: translateY(0); opacity: 1; }
                to { transform: translateY(-100%); opacity: 0; }
              }
              @keyframes slideUpIn {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
              @keyframes drawerSlideIn {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
              }
              @keyframes drawerSlideOut {
                from { transform: translateY(0); }
                to { transform: translateY(100%); }
              }
              @keyframes backdropFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes backdropFadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
              }
              .animate-slide-up-out {
                animation: slideUpOut 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
              }
              .animate-slide-up-in {
                animation: slideUpIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
              }
              .animate-drawer-slide-in {
                animation: drawerSlideIn 0.58s cubic-bezier(0.22, 1, 0.36, 1) forwards;
              }
              .animate-drawer-slide-out {
                animation: drawerSlideOut 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
              }
              .animate-backdrop-fade-in {
                animation: backdropFadeIn 0.45s ease-out forwards;
              }
              .animate-backdrop-fade-out {
                animation: backdropFadeOut 0.4s ease-in forwards;
              }
            `}</style>

          </div>
          <div className="hidden items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-2 shadow-sm md:flex">
            <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-sm font-bold text-slate-600">ระบบทำงานปกติ</span>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-1 max-w-7xl space-y-8 px-5">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="order-1 grid grid-cols-2 gap-4 xl:order-2 xl:col-span-4 xl:grid-cols-1">
            <button
              onClick={() => openCreateOrder()}
              className="flex min-h-[4.25rem] flex-row items-center justify-center gap-3 rounded-[1rem] bg-[#4A148C] px-4 py-4 text-white shadow-[0_10px_24px_rgba(74,20,140,0.32)] transition-transform active:scale-95"
            >
              <Phone className="h-5 w-5 shrink-0 rotate-90" fill="white" strokeWidth={0} />
              <span className="whitespace-nowrap text-base font-extrabold md:text-lg">
                รับออเดอร์
              </span>
            </button>

            <button
              onClick={openStockModal}
              className="flex min-h-[4.25rem] flex-row items-center justify-center gap-3 rounded-[1rem] border border-[#EA80FC]/30 bg-[#EA80FC] px-4 py-4 text-[#4A148C] shadow-[0_10px_24px_rgba(234,128,252,0.22)] transition-transform active:scale-95"
            >
              <Truck className="h-5 w-5 shrink-0" strokeWidth={2.2} />
              <span className="whitespace-nowrap text-base font-extrabold md:text-lg">
                รับสินค้า
              </span>
            </button>
          </div>

          <section className="order-2 flex flex-col gap-4 md:gap-6 xl:order-1 xl:col-span-8">
            <button
              onClick={() => {
                setIsViewingStoresClosing(false);
                setSelectedStoreVehicleId("__all__");
                setViewingStores({
                  title: "ร้านค้าทั้งหมด",
                  stores: storeStatusSummary.allStores,
                });
              }}
              className="group flex w-full items-center gap-5 rounded-[1.35rem] border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-[#4A148C]/30 hover:shadow-md active:scale-[0.99] dashboard-store-card md:p-7"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-[#EA80FC] text-[#4A148C] transition-colors group-hover:bg-[#EA80FC] group-hover:text-[#4A148C] md:h-20 md:w-20">
                <Store className="h-7 w-7 md:h-10 md:w-10" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[18px] font-extrabold text-slate-700 md:text-2xl">
                  ร้านค้าทั้งหมดในระบบ
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black leading-none tracking-tight text-slate-900 tabular-nums md:text-5xl">
                    {fmtNumber(storeStatusSummary.allStores.length)}
                  </p>
                  <span className="text-sm font-bold text-slate-400 md:text-lg">ร้านค้า</span>
                </div>
              </div>
              <ChevronRight
                className="h-8 w-8 text-slate-200 transition-colors group-hover:text-[#4A148C]"
                strokeWidth={3}
              />
            </button>

            <div className="grid grid-cols-2 gap-4 md:gap-6">
              <button
                onClick={() => {
                  setIsViewingStoresClosing(false);
                  setSelectedStoreVehicleId("__all__");
                  setViewingStores({
                    title: "ร้านค้าที่ยังไม่ได้สั่ง",
                    stores: storeStatusSummary.unorderedStores,
                  });
                }}
                className="group flex items-center gap-4 rounded-[1.35rem] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-rose-200 hover:shadow-md active:scale-[0.98] dashboard-store-card md:p-6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition-colors group-hover:bg-rose-600 group-hover:text-white md:h-16 md:w-16">
                  <ShoppingBag className="h-6 w-6 md:h-8 md:w-8" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="-ml-1 mb-1 whitespace-nowrap text-[16px] font-extrabold leading-none text-slate-700 md:text-xl">
                    ยังไม่ได้สั่ง
                  </p>
                  <p className="text-2xl font-black leading-none text-rose-600 tabular-nums md:text-4xl">
                    {fmtNumber(storeStatusSummary.unorderedStores.length)}
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsViewingStoresClosing(false);
                  setSelectedStoreVehicleId("__all__");
                  setViewingStores({
                    title: "ร้านค้าที่สั่งแล้ว",
                    stores: storeStatusSummary.orderedStores,
                  });
                }}
                className="group flex items-center gap-4 rounded-[1.35rem] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-200 hover:shadow-md active:scale-[0.98] dashboard-store-card md:p-6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white md:h-16 md:w-16">
                  <ClipboardList className="h-6 w-6 md:h-8 md:w-8" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="-ml-1 mb-1 whitespace-nowrap text-[16px] font-extrabold leading-none text-slate-700 md:text-xl">
                    สั่งแล้ววันนี้
                  </p>
                  <p className="text-2xl font-black leading-none text-emerald-600 tabular-nums md:text-4xl">
                    {fmtNumber(storeStatusSummary.orderedStores.length)}
                  </p>
                </div>
              </button>
            </div>
          </section>
        </div>

        <section className="-mx-2 grid grid-cols-2 gap-2.5 px-2 md:mx-0 md:gap-5 md:px-0 md:grid-cols-3 lg:grid-cols-3">
          <button
            type="button"
            onClick={() =>
              setFinancialReveal({
                kind: "metric",
                title: "ยอดขายวันนี้",
                rows: [{ label: "ยอดขายวันนี้", value: `฿${fmtMoney(kpi.todayOrderAmount)}`, tone: "green" }],
              })
            }
            className="block text-left transition-transform active:scale-[0.98]"
          >
            <DashboardStatCard
              title="ยอดขายวันนี้"
              value=""
              valueNode={<HiddenMetricEye />}
              accent="green"
              icon={<TrendingUp className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.15} />}
              ghost={<BarChart3 className="h-[4.2rem] w-[4.2rem] sm:h-[4.6rem] sm:w-[4.6rem]" strokeWidth={1.15} />}
            />
          </button>

          <button
            type="button"
            onClick={() =>
              setFinancialReveal({
                kind: "metric",
                title: "ต้นทุนวันนี้",
                rows: [{ label: "ต้นทุนวันนี้", value: `฿${fmtMoney(kpi.todayCost)}`, tone: "rose" }],
              })
            }
            className="block text-left transition-transform active:scale-[0.98]"
          >
            <DashboardStatCard
              title="ต้นทุนวันนี้"
              value=""
              valueNode={<HiddenMetricEye />}
              accent="rose"
              icon={<Wallet className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.15} />}
              ghost={<Wallet className="h-[4.2rem] w-[4.2rem] sm:h-[4.6rem] sm:w-[4.6rem]" strokeWidth={1.15} />}
            />
          </button>

          <button
            type="button"
            onClick={() =>
              setFinancialReveal({
                kind: "metric",
                title: "กำไรสุทธิวันนี้",
                rows: [{ label: "กำไรสุทธิวันนี้", value: `฿${fmtMoney(kpi.todayNetProfit)}`, tone: "teal" }],
              })
            }
            className="block text-left transition-transform active:scale-[0.98]"
          >
            <DashboardStatCard
              title="กำไรสุทธิวันนี้"
              value=""
              valueNode={<HiddenMetricEye />}
              accent="teal"
              icon={<HandCoins className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.15} />}
              ghost={<HandCoins className="h-[4.2rem] w-[4.2rem] sm:h-[4.6rem] sm:w-[4.6rem]" strokeWidth={1.15} />}
            />
          </button>

          <DashboardStatCard
            title="ออเดอร์วันนี้"
            value={fmtNumber(kpi.todayOrderCount)}
            unit="รายการ"
            accent="blue"
            icon={<ClipboardList className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.15} />}
            ghost={<ClipboardList className="h-[4.2rem] w-[4.2rem] sm:h-[4.6rem] sm:w-[4.6rem]" strokeWidth={1.15} />}
          />

          <button
            type="button"
            onClick={() => setIsLineOrdersDrawerOpen(true)}
            className="block text-left transition-transform active:scale-[0.98]"
          >
            <DashboardStatCard
              title="ออเดอร์Line"
              value={fmtNumber(kpi.submittedOrderCount)}
              unit="รายการ"
              accent="line"
              icon={<LineAppIcon className="h-[1.2rem] w-[1.2rem]" />}
              ghost={<MessageCircle className="h-[4.2rem] w-[4.2rem] sm:h-[4.6rem] sm:w-[4.6rem]" strokeWidth={1.15} />}
            />
          </button>

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
                  <AlertCircle
                    className="absolute -bottom-1 -right-1 h-5 w-5 text-[#ff7f11]"
                    strokeWidth={1.6}
                  />
                </div>
              }
            />
          </Link>
        </section>



        <div className="grid grid-cols-1 gap-8">


          <section
            role="button"
            tabIndex={0}
            onClick={() =>
              dailySummaryRows.length > 0 &&
              setFinancialReveal({
                kind: "dailyTable",
                title: "รายงานผลประกอบการรายวัน",
                rows: dailySummaryRows,
              })
            }
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && dailySummaryRows.length > 0) {
                event.preventDefault();
                setFinancialReveal({
                  kind: "dailyTable",
                  title: "รายงานผลประกอบการรายวัน",
                  rows: dailySummaryRows,
                });
              }
            }}
            className="cursor-pointer rounded-[2rem] border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition hover:border-[#E1BEE7] hover:shadow-[0_14px_38px_rgba(74,20,140,0.08)] active:scale-[0.995] md:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black leading-none text-slate-900 md:text-xl">
                  รายงานผลประกอบการรายวัน
                </h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black leading-none text-slate-500">
                  7 วันล่าสุด
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E1BEE7] bg-[#F3E5F5] px-3 py-1.5 text-xs font-black text-[#4A148C]">
                <Eye className="h-3.5 w-3.5" strokeWidth={2.4} />
                กดดูรายงาน
              </span>
            </div>
          </section>
        </div>


      </main>

      {financialReveal || isFinancialRevealClosing ? (
        <div className={`fixed inset-0 z-[310] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[6px] ${
          isFinancialRevealClosing ? "animate-backdrop-fade-out" : "animate-backdrop-fade-in"
        }`}>
          <button
            type="button"
            aria-label="ปิดยอด"
            className="absolute inset-0 cursor-default"
            onClick={closeFinancialReveal}
          />
          <section className={`relative z-10 max-h-[86dvh] w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-[#E1BEE7] bg-white shadow-[0_28px_90px_rgba(15,23,42,0.32)] ${
            isFinancialRevealClosing ? "animate-backdrop-fade-out" : "animate-backdrop-fade-in"
          }`}>
            <div className="flex items-start justify-between gap-4 border-b border-[#E1BEE7]/70 bg-[#F3E5F5] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8E24AA]">
                  {financialReveal?.kind === "dailyTable" ? "Daily Performance" : "Private Metric"}
                </p>
                <h3 className="mt-1 text-xl font-black leading-tight text-[#4A148C] sm:text-2xl">
                  {financialReveal?.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeFinancialReveal}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[#4A148C] shadow-sm transition active:scale-95"
                aria-label="ปิด"
              >
                <X className="h-5.5 w-5.5" strokeWidth={3} />
              </button>
            </div>

            {financialReveal?.kind === "metric" ? (
              <div className="space-y-3 px-5 py-5 sm:px-6">
                {financialReveal.rows.map((row) => {
                const toneClass =
                  row.tone === "green"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15"
                    : row.tone === "rose"
                      ? "bg-rose-50 text-rose-700 ring-rose-600/15"
                      : "bg-teal-50 text-teal-700 ring-teal-600/15";

                return (
                  <div
                    key={row.label}
                    className={`rounded-2xl px-4 py-5 ring-1 ${toneClass}`}
                  >
                    <p className="text-sm font-black text-current/70">{row.label}</p>
                    <p className="mt-1 text-4xl font-black leading-none tracking-tight tabular-nums">
                      {row.value}
                    </p>
                  </div>
                );
                })}
              </div>
            ) : financialReveal?.kind === "dailyTable" ? (
              <div className="max-h-[66dvh] overflow-auto px-2 py-4 sm:px-6">
                <table className="w-full table-fixed border-collapse overflow-hidden rounded-2xl text-[10px] sm:text-sm">
                  <thead>
                    <tr className="bg-[#4A148C] text-white">
                      <th className="w-[38%] whitespace-nowrap px-2 py-3 text-left font-black sm:w-[40%] sm:px-3">วัน</th>
                      <th className="w-[22%] whitespace-nowrap px-1 py-3 text-right font-black sm:w-[20%] sm:px-3">ยอดขาย</th>
                      <th className="w-[20%] whitespace-nowrap px-1 py-3 text-right font-black sm:px-3">ต้นทุน</th>
                      <th className="w-[20%] whitespace-nowrap px-1.5 py-3 text-right font-black sm:px-3">กำไร</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E1BEE7]/60 bg-white">
                    {financialReveal.rows.map((row, index) => (
                      <tr key={row.isoDate} className={index === 0 ? "bg-[#F3E5F5]" : "bg-white"}>
                        <td className="whitespace-nowrap px-2 py-3 font-black text-slate-800 sm:px-3">
                          {index === 0 ? `${toThaiShortDate(row.isoDate)} (วันนี้)` : toThaiShortDate(row.isoDate)}
                        </td>
                        <td className="whitespace-nowrap px-1 py-3 text-right font-black tabular-nums text-emerald-600 sm:px-3">
                          ฿{fmtMoney(row.revenue)}
                        </td>
                        <td className="whitespace-nowrap px-1 py-3 text-right font-black tabular-nums text-rose-600 sm:px-3">
                          ฿{fmtMoney(row.cost)}
                        </td>
                        <td className="whitespace-nowrap px-1.5 py-3 text-right font-black tabular-nums text-teal-600 sm:px-3">
                          ฿{fmtMoney(row.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {viewingStores || isViewingStoresClosing ? (
        <div className={`fixed inset-0 z-[300] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[6px] sm:items-center sm:p-4 ${
          isViewingStoresClosing ? "animate-backdrop-fade-out" : "animate-backdrop-fade-in"
        }`}>
          <button
            type="button"
            aria-label="ปิดรายการร้านค้า"
            className="absolute inset-0 cursor-default"
            onClick={closeViewingStores}
          />
          <div className={`relative z-10 w-full max-w-xl overflow-hidden rounded-t-[3rem] bg-white pb-12 pt-4 shadow-2xl sm:rounded-[3rem] dashboard-modal-content dashboard-stores-modal ${
            isViewingStoresClosing ? "animate-drawer-slide-out" : "animate-drawer-slide-in"
          }`}>
            <div className="mb-6 flex justify-center">
              <div className="h-1.5 w-16 rounded-full bg-slate-200" />
            </div>
            <div className="mb-8 flex items-center justify-between px-8">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-[#4A148C]">
                  {viewingStores?.title}
                </h3>
                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Store Registry
                </p>
              </div>
              <button
                onClick={closeViewingStores}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 transition-transform active:scale-90"
              >
                <X className="h-6 w-6" strokeWidth={3} />
              </button>
            </div>

            {storeStatusSummary.vehicles.length > 0 ? (
              <div className="mb-5 shrink-0 border-b border-[#EA80FC]/15 bg-white">
                <div
                  ref={storeVehicleTabsContainerRef}
                  className="no-scrollbar relative flex select-none gap-6 overflow-x-auto overscroll-x-contain scroll-smooth px-8 pt-1 touch-pan-x [-webkit-overflow-scrolling:touch] [-webkit-touch-callout:none] [user-select:none]"
                >
                  <span
                    className="absolute bottom-0 h-[3px] rounded-full bg-[#4A148C]"
                    style={{
                      ...(storeVehicleUnderlineStyle ?? { left: 0, width: 0 }),
                      opacity: storeVehicleUnderlineStyle ? 1 : 0,
                      transition:
                        "left 300ms cubic-bezier(0.16, 1, 0.3, 1), width 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-in-out",
                    }}
                  />
                  <button
                    type="button"
                    data-active={selectedStoreVehicleId === "__all__"}
                    onClick={(event) => handleStoreVehicleSelect("__all__", event)}
                    className={`shrink-0 whitespace-nowrap pb-3 text-sm font-black tracking-wide transition-all touch-pan-x ${
                      selectedStoreVehicleId === "__all__"
                        ? "scale-[1.03] text-[#4A148C]"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    ร้านทั้งหมด
                  </button>
                  {storeStatusSummary.vehicles.map((vehicle) => (
                    <button
                      key={vehicle.id}
                      type="button"
                      data-active={selectedStoreVehicleId === vehicle.id}
                      onClick={(event) => handleStoreVehicleSelect(vehicle.id, event)}
                      className={`shrink-0 whitespace-nowrap pb-3 text-sm font-black tracking-wide transition-all touch-pan-x ${
                        selectedStoreVehicleId === vehicle.id
                          ? "scale-[1.03] text-[#4A148C]"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {vehicle.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="no-scrollbar max-h-[60vh] space-y-px overflow-y-auto pb-10">
              {!viewingStores || visibleViewingStores.length === 0 ? (
                <div className="flex flex-col items-center py-24 text-center">
                  <div className="mb-5 rounded-full bg-slate-50 p-7">
                    <Store className="h-14 w-14 text-slate-200" />
                  </div>
                  <p className="text-xl font-black text-slate-300">ไม่มีข้อมูลร้านค้าในขณะนี้</p>
                </div>
              ) : (
                <div className="relative">
                  {isNavigating ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                      <Loader2 className="h-10 w-10 animate-spin text-[#4A148C]" strokeWidth={3} />
                    </div>
                  ) : null}
                  {visibleViewingStores.map((store) => {
                    const isOrdered = orderedStoreIds.has(store.id);

                    return (
                      <button
                        key={store.id}
                        onClick={() => {
                          if (isOrdered && store.latestOrderId) {
                            startTransition(() => {
                              const params = new URLSearchParams(searchParams.toString());
                              params.set("expanded", store.latestOrderId ?? "");
                              router.push(`/dashboard?${params.toString()}`, { scroll: false });
                              closeViewingStores();
                            });
                            return;
                          }

                          openCreateOrder(store.id);
                        }}
                        className="group flex w-full items-center gap-5 border-b border-slate-100 bg-white px-6 py-6 text-left transition-colors hover:bg-slate-50 disabled:opacity-50"
                        disabled={isNavigating}
                      >
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-[#4A148C] shadow-sm transition-all group-hover:bg-[#4A148C] group-hover:text-white">
                          <Store className="h-7 w-7" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-lg font-black leading-tight text-slate-800">
                            {store.name}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <p className="text-xs font-bold uppercase tracking-tighter text-slate-400">
                              รหัส: {store.code || store.id.slice(0, 8)}
                            </p>
                            {isOrdered ? (
                              <span className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tight text-emerald-600">
                                สั่งแล้ววันนี้
                              </span>
                            ) : (
                              <span className="rounded-md border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-tight text-rose-600">
                                ยังไม่สั่ง
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight
                          className="h-6 w-6 text-slate-200 transition-all group-hover:translate-x-1 group-hover:text-[#4A148C]"
                          strokeWidth={3}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isLineOrdersDrawerOpen || isLineOrdersDrawerClosing ? (
        <div className={`fixed inset-0 z-[310] flex items-end justify-end bg-slate-950/55 backdrop-blur-[4px] ${
          isLineOrdersDrawerClosing ? "animate-backdrop-fade-out" : "animate-backdrop-fade-in"
        }`}>
          <button
            type="button"
            aria-label="ปิดรายการออเดอร์จาก LINE"
            className="absolute inset-0 cursor-default"
            onClick={closeLineOrdersDrawer}
          />
          <aside className={`relative flex h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-[0_-24px_70px_rgba(15,23,42,0.24)] sm:h-full sm:rounded-l-[2rem] sm:rounded-tr-none dashboard-modal-content dashboard-line-orders-modal ${
            isLineOrdersDrawerClosing ? "animate-drawer-slide-out" : "animate-drawer-slide-in"
          }`}>
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#06c755]/10">
                  <LineAppIcon className="h-7 w-7" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-xl font-black leading-tight text-slate-950">
                    ออเดอร์จาก LINE
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {fmtNumber(lineOrders.length)} รายการวันนี้
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeLineOrdersDrawer}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-95"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" strokeWidth={2.6} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {lineOrders.length === 0 ? (
                <div className="flex min-h-80 flex-col items-center justify-center text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-50 text-slate-300">
                    <MessageCircle className="h-9 w-9" strokeWidth={1.8} />
                  </div>
                  <p className="text-lg font-black text-slate-400">ยังไม่มีออเดอร์จาก LINE วันนี้</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lineOrders.map((order) => {
                    const displayName = order.customerName || order.lineDisplayName || "ลูกค้า LINE";
                    const isLinked = order.status === "converted" && Boolean(order.customerName);

                    return (
                      <button
                        type="button"
                        key={order.id}
                        onClick={() => void openLineOrderDetail(order.orderId)}
                        className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#06c755]/35 hover:shadow-[0_16px_34px_rgba(15,23,42,0.09)] active:scale-[0.99]"
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                            {order.linePictureUrl ? (
                              <Image
                                src={order.linePictureUrl}
                                alt={order.lineDisplayName || displayName}
                                fill
                                sizes="48px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[#06c755]">
                                <UserRound className="h-6 w-6" strokeWidth={2.1} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <h4 className="min-w-0 flex-1 truncate text-base font-black leading-tight text-slate-950">
                                {displayName}
                              </h4>
                              {order.hasUnpricedItems ? (
                                <span className="shrink-0 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-black text-yellow-200 border border-red-500 shadow-sm animate-pulse-subtle">
                                  ออเดอร์ไม่สมบูรณ์
                                </span>
                              ) : null}
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
                                  isLinked
                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                                    : "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                                }`}
                              >
                                {isLinked ? "ผูกแล้ว" : "รอผูก"}
                              </span>
                            </div>
                            {order.customerName && order.lineDisplayName ? (
                              <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                                LINE: {order.lineDisplayName}
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                              <span>{formatThaiDateTime(order.createdAt)}</span>
                              {order.orderNumber ? (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-[#4A148C]">{order.orderNumber}</span>
                                </>
                              ) : null}
                            </div>
                            <p className="mt-2 text-xs font-black text-[#06c755] opacity-0 transition group-hover:opacity-100">
                              {order.orderId ? "แตะเพื่อเปิดรายละเอียดออเดอร์" : "รอผูกร้านค้าก่อนเปิดรายละเอียด"}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </aside>
        </div>
      ) : null}



      {lineOrderModal ? (
        <IncomingOrderModal
          key={`line-order-${lineOrderModal.expandedId}`}
          allOrders={lineOrderModal.allOrders}
          date={orderDate}
          detail={lineOrderModal.detail}
          expandedId={lineOrderModal.expandedId}
          onAfterClose={() => setLineOrderModal(null)}
          products={lineOrderModal.products}
          searchTerm=""
        />
      ) : null}

      {isStockModalOpen ? (
        stockProducts === null ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3">
            <Loader2 className="h-8 w-8 animate-spin text-white" strokeWidth={2.4} />
          </div>
        ) : (
          <StockReceiveForm
            products={stockProducts}
            warehouses={stockWarehouses}
            returnHref="/dashboard"
            onClose={() => setIsStockModalOpen(false)}
          />
        )
      ) : null}

      {expandedOrderId && !lineOrderModal ? (
        <IncomingOrderModal
          allOrders={allOrders}
          date={orderDate}
          detail={expandedDetail}
          expandedId={expandedOrderId}
          products={products}
          searchTerm=""
        />
      ) : null}
    </div>
  );
}
