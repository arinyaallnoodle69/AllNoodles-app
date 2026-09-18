"use client";

import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { IncomingOrderOpenCard } from "./incoming-order-open-card";
import { IncomingOrderVehicleFilter } from "./incoming-order-vehicle-filter";
import { IncomingOrdersVehicleTransfer } from "./incoming-orders-vehicle-transfer";
import { DailySpecialOrderManager } from "./daily-special-order-manager";
import { fetchIncomingOrderDetailAction } from "@/app/orders/incoming/actions";
import type { OrderVehicleOption } from "@/lib/orders/manage";
import type { DailySpecialCatalogProduct, DailySpecialItem } from "@/lib/orders/daily-special-items";
import type { VehicleTransferDateOption } from "@/lib/orders/vehicle-transfer";
import type { IncomingOrderListItem, OrderDetailData } from "@/lib/orders/detail";
import type { OrderProductOption } from "@/lib/orders/manage";

const IncomingOrderModal = dynamic(() =>
  import("./incoming-order-modal").then((mod) => mod.IncomingOrderModal),
);

type MobileListOrder = {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  channelLabel: string;
  orderDate: string;
  notes: string | null;
  productCount: number;
  totalAmount: number;
  totalAmountText: string;
  vehicleId: string | null;
  vehicleName: string | null;
  deliveryNumbers: string[] | undefined;
  isBilled: boolean;
  warehouseId?: string | null;
  warehouseName?: string | null;
};

function formatDisplayDate(value: string) {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

type IncomingOrdersMobileListProps = {
  orders: MobileListOrder[];
  vehicles: OrderVehicleOption[];
  currentListDate: string;
  searchTerm?: string;
  selectedCustomerIds?: string[];
  specialCatalog: DailySpecialCatalogProduct[];
  specialItems: DailySpecialItem[];
  vehicleTransferDates: VehicleTransferDateOption[];
};

export function IncomingOrdersMobileList({
  orders,
  vehicles,
  currentListDate,
  searchTerm,
  selectedCustomerIds = [],
  specialCatalog,
  specialItems,
  vehicleTransferDates,
}: IncomingOrdersMobileListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [selectedVehicleId, setSelectedVehicleId] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("vehicle") || "__all__";
    }
    return searchParams.get("vehicle") || "__all__";
  });

  const filteredOrders = useMemo(() => {
    if (selectedVehicleId === "__all__") return orders;
    if (selectedVehicleId === "__none__") return orders.filter((o) => !o.vehicleId);
    return orders.filter((o) => o.vehicleId === selectedVehicleId);
  }, [orders, selectedVehicleId]);

  const [visibleCount, setVisibleCount] = useState(15);
  const filterKey = `${selectedVehicleId ?? "all"}_${currentListDate ?? "all"}_${searchTerm?.trim() ?? ""}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setVisibleCount(15);
  }
  const sensorRef = useRef<HTMLDivElement | null>(null);

  const [activeModalOrderId, setActiveModalOrderId] = useState<string | null>(null);
  const [modalData, setModalData] = useState<{
    detail: OrderDetailData | null;
    products: OrderProductOption[];
    orderId: string;
  } | null>(null);
  const modalCacheRef = useRef<Record<string, { detail: OrderDetailData; products: OrderProductOption[] }>>({});

  const handleOpenModal = useCallback((orderId: string) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("last_order_scroll_y", String(window.scrollY));
      const p = new URLSearchParams(window.location.search);
      p.set("expanded", orderId);
      window.history.pushState(null, "", `${window.location.pathname}?${p.toString()}`);
    }

    setActiveModalOrderId(orderId);

    const cached = modalCacheRef.current[orderId];
    if (cached) {
      setModalData({
        detail: cached.detail,
        products: cached.products,
        orderId,
      });
      return;
    }

    setModalData({
      detail: null,
      products: [],
      orderId,
    });

    void (async () => {
      try {
        const result = await fetchIncomingOrderDetailAction(orderId);
        if (result && result.detail) {
          modalCacheRef.current[orderId] = {
            detail: result.detail,
            products: [],
          };
          setModalData((prev) => {
            if (prev?.orderId === orderId) {
              return {
                detail: result.detail,
                products: [],
                orderId,
              };
            }
            return prev;
          });
        }
      } catch (err) {
        console.error("Failed to load order details:", err);
      }
    })();
  }, []);

  const handleCloseModal = useCallback(() => {
    setActiveModalOrderId(null);
    setModalData(null);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const expanded = params.get("expanded");
      if (!expanded) {
        setActiveModalOrderId(null);
        setModalData(null);
      } else if (expanded !== activeModalOrderId) {
        handleOpenModal(expanded);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeModalOrderId, handleOpenModal]);

  useEffect(() => {
    const sensor = sensorRef.current;
    if (!sensor || visibleCount >= filteredOrders.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 15, filteredOrders.length));
        }
      },
      { rootMargin: "200px" } // Pre-load when within 200px of bottom
    );

    observer.observe(sensor);
    return () => {
      observer.unobserve(sensor);
    };
  }, [filteredOrders.length, visibleCount]);

  const visibleOrders = filteredOrders.slice(0, visibleCount);
  const hasMore = visibleCount < filteredOrders.length;

  return (
    <div className="bg-white">
      {/* Mobile Vehicle Filter Header */}
      <div className="px-4 py-3 border-b border-[#EA80FC]/20">
        <div className="flex items-center justify-between gap-3">
          <h3 className="min-w-0 text-base font-black text-[#4A148C]">ตารางรายการคำสั่งซื้อล่าสุด</h3>
        </div>
        <div className="mt-2 grid grid-cols-2 items-center gap-2">
          <DailySpecialOrderManager
            key={`mobile-special-${currentListDate}`}
            date={currentListDate}
            initialItems={specialItems}
            products={specialCatalog}
            variant="mobile-compact"
            vehicles={vehicles}
          />
          <IncomingOrdersVehicleTransfer dateOptions={vehicleTransferDates} variant="mobile" />
        </div>
        <IncomingOrderVehicleFilter
          vehicles={vehicles}
          activeVehicleId={selectedVehicleId}
          onVehicleChange={(id) => {
            setSelectedVehicleId(id);
            const params = new URLSearchParams(window.location.search);
            if (id === "__all__") {
              params.delete("vehicle");
            } else {
              params.set("vehicle", id);
            }
            startTransition(() => {
              router.replace(`/orders/incoming?${params.toString()}`, { scroll: false });
            });
          }}
        />
      </div>

      {visibleOrders.length === 0 ? (
        <div className="px-6 py-16 text-center bg-slate-50/30 rounded-b-2xl">
          <p className="text-base font-semibold text-slate-500">ไม่พบรายการคำสั่งซื้อสำหรับรถส่งของคันนี้</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 px-3 py-3 sm:grid-cols-2 sm:gap-3">
            {visibleOrders.map((order, index) => {
              const showDivider = index === 0 || order.orderDate !== visibleOrders[index - 1].orderDate;

              return (
                <Fragment key={order.id}>
                  {showDivider ? (
                    <div className="col-span-full flex items-center gap-3 bg-white px-1 py-2">
                      <div className="h-[2px] flex-1 bg-[#EA80FC]/35" />
                      <div className="shrink-0 rounded-2xl border border-[#EA80FC]/50 bg-[#F3E5F5] px-4 py-1.5 shadow-sm">
                        <span className="text-[13px] font-black uppercase tracking-wider text-[#4A148C]">
                          {formatDisplayDate(order.orderDate)}
                        </span>
                      </div>
                      <div className="h-[2px] flex-1 bg-[#EA80FC]/35" />
                    </div>
                  ) : null}

                  <IncomingOrderOpenCard
                    href={`/orders/incoming?expanded=${order.id}${searchTerm ? `&q=${searchTerm}` : ""}${currentListDate ? `&date=${currentListDate}` : ""}`}
                    orderId={order.id}
                    orderNumber={order.orderNumber}
                    customerId={order.customerId}
                    customerName={order.customerName}
                    customerCode={order.customerCode}
                    channelLabel={order.channelLabel}
                    currentListDate={currentListDate}
                    deliveryNumbers={order.deliveryNumbers}
                    displayDate={formatDisplayDate(order.orderDate)}
                    isBilled={order.isBilled}
                    notes={order.notes}
                    orderDate={order.orderDate}
                    productCount={order.productCount}
                    searchTerm={searchTerm}
                    selectedCustomerIds={selectedCustomerIds}
                    totalAmountText={order.totalAmountText}
                    vehicleId={order.vehicleId}
                    vehicleName={order.vehicleName}
                    vehicles={vehicles}
                    warehouseName={order.warehouseName}
                    onOpen={handleOpenModal}
                  />
                </Fragment>
              );
            })}

            {/* Sensor for Infinite Scrolling */}
            {hasMore && (
              <div ref={sensorRef} className="col-span-full flex items-center justify-center gap-2 rounded-2xl border border-[#EA80FC]/25 bg-white py-6">
                <Loader2 className="h-5 w-5 animate-spin text-[#4A148C]" strokeWidth={2.4} />
                <span className="text-sm font-semibold text-[#4A148C]">กำลังโหลดออเดอร์เพิ่ม...</span>
              </div>
            )}
          </div>
        </>
      )}

      {activeModalOrderId ? (
        <IncomingOrderModal
          key={`mobile-order-${activeModalOrderId}`}
          allOrders={filteredOrders as unknown as IncomingOrderListItem[]}
          date={currentListDate}
          detail={modalData?.orderId === activeModalOrderId ? modalData.detail : null}
          expandedId={activeModalOrderId}
          onAfterClose={handleCloseModal}
          products={modalData?.orderId === activeModalOrderId ? modalData.products : []}
          searchTerm={searchTerm ?? ""}
        />
      ) : null}
    </div>
  );
}
