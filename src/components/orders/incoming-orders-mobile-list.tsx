"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { IncomingOrderOpenCard } from "./incoming-order-open-card";
import type { OrderVehicleOption } from "@/lib/orders/manage";

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
};

export function IncomingOrdersMobileList({
  orders,
  vehicles,
  currentListDate,
  searchTerm,
  selectedCustomerIds = [],
}: IncomingOrdersMobileListProps) {
  const [visibleCount, setVisibleCount] = useState(15);
  const [prevOrders, setPrevOrders] = useState(orders);
  const sensorRef = useRef<HTMLDivElement | null>(null);

  // Reset pagination count when orders list changes (e.g. new search or date filter)
  if (orders !== prevOrders) {
    setPrevOrders(orders);
    setVisibleCount(15);
  }

  useEffect(() => {
    const sensor = sensorRef.current;
    if (!sensor || visibleCount >= orders.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 15, orders.length));
        }
      },
      { rootMargin: "200px" } // Pre-load when within 200px of bottom
    );

    observer.observe(sensor);
    return () => {
      observer.unobserve(sensor);
    };
  }, [orders.length, visibleCount]);

  const visibleOrders = orders.slice(0, visibleCount);
  const hasMore = visibleCount < orders.length;

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-[#D4AF37]/25 bg-white px-3 py-3 sm:grid-cols-2 sm:gap-3">
      {visibleOrders.map((order, index) => {
        const showDivider = index === 0 || order.orderDate !== visibleOrders[index - 1].orderDate;

        return (
          <Fragment key={order.id}>
            {showDivider ? (
              <div className="col-span-full flex items-center gap-3 bg-white px-1 py-2">
                <div className="h-[2px] flex-1 bg-[#D4AF37]/35" />
                <div className="shrink-0 rounded-2xl border border-[#D4AF37]/50 bg-[#FAF7F2] px-4 py-1.5 shadow-sm">
                  <span className="text-[13px] font-black uppercase tracking-wider text-[#082A63]">
                    {formatDisplayDate(order.orderDate)}
                  </span>
                </div>
                <div className="h-[2px] flex-1 bg-[#D4AF37]/35" />
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
            />
          </Fragment>
        );
      })}

      {/* Sensor for Infinite Scrolling */}
      {hasMore && (
        <div ref={sensorRef} className="col-span-full flex items-center justify-center gap-2 rounded-2xl border border-[#D4AF37]/25 bg-white py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[#082A63]" strokeWidth={2.4} />
          <span className="text-sm font-semibold text-[#1F2A44]">กำลังโหลดออเดอร์เพิ่ม...</span>
        </div>
      )}
    </div>
  );
}
