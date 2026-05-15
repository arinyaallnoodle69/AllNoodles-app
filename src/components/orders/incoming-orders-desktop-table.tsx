"use client";

import { Fragment, memo, useMemo, useState, useTransition } from "react";
import { Building2, Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { fetchIncomingOrderDetailAction } from "@/app/orders/incoming/actions";
import { DesktopOrderDetail } from "@/components/orders/desktop-order-detail";
import { IncomingOrderDateButton } from "@/components/orders/incoming-order-date-button";
import { IncomingOrderVehicleSelect } from "@/components/orders/incoming-order-vehicle-select";
import { PrintStoreDeliveryButton } from "@/components/orders/print-store-delivery-button";
import type { IncomingOrderListItem, OrderDetailData } from "@/lib/orders/detail";
import type { OrderVehicleOption } from "@/lib/orders/manage";

type IncomingOrdersDesktopTableProps = {
  billedByCustomerDate: Record<string, boolean>;
  deliveryByCustomerId: Record<string, string[]>;
  initialExpandedDetail: OrderDetailData | null;
  initialExpandedOrderId: string;
  orderDate: string;
  orders: IncomingOrderListItem[];
  searchTerm: string;
  vehicles: OrderVehicleOption[];
};

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatOrderDate(value: string) {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

export const IncomingOrdersDesktopTable = memo(function IncomingOrdersDesktopTable({
  billedByCustomerDate,
  deliveryByCustomerId,
  initialExpandedDetail,
  initialExpandedOrderId,
  orderDate,
  orders,
  searchTerm,
  vehicles,
}: IncomingOrdersDesktopTableProps) {
  const [expandedOrderId, setExpandedOrderId] = useState(initialExpandedOrderId);
  const [detailByOrderId, setDetailByOrderId] = useState<Record<string, OrderDetailData>>(() =>
    initialExpandedOrderId && initialExpandedDetail
      ? { [initialExpandedOrderId]: initialExpandedDetail }
      : {},
  );
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleOrderIds = useMemo(() => new Set(orders.map((order) => order.id)), [orders]);

  async function toggleOrder(orderId: string) {
    setDetailError(null);

    if (expandedOrderId === orderId) {
      setExpandedOrderId("");
      return;
    }

    setExpandedOrderId(orderId);

    if (detailByOrderId[orderId]) return;

    setLoadingOrderId(orderId);
    startTransition(async () => {
      try {
        const result = await fetchIncomingOrderDetailAction(orderId);
        if (result.error || !result.detail) {
          setDetailError(result.error ?? "โหลดรายละเอียดออเดอร์ไม่สำเร็จ");
          return;
        }
        setDetailByOrderId((current) => ({ ...current, [orderId]: result.detail! }));
      } catch {
        setDetailError("โหลดรายละเอียดออเดอร์ไม่สำเร็จ");
      } finally {
        setLoadingOrderId(null);
      }
    });
  }

  return (
    <div className="overflow-x-auto no-scrollbar rounded-[1.25rem] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)] lg:block">
      <div className="min-w-[1150px]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-xl font-bold text-slate-950">ตารางรายการคำสั่งซื้อล่าสุด</h3>
            <p className="mt-1 text-base font-medium text-slate-950">
              จัดการและติดตามสถานะออเดอร์ในวันที่เลือกจากจุดเดียว
            </p>
          </div>
          <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <span className="h-2.5 w-2.5 rounded-full bg-[#003366]" />
            รายการทั้งหมด
          </div>
        </div>

        <div className="overflow-visible">
          <table className="w-full table-fixed border-collapse text-left">
            <thead className="bg-slate-50 text-slate-950">
              <tr className="border-b border-slate-200">
                <th className="w-[20%] px-3 py-4 text-sm font-bold tracking-[0.04em] text-slate-950">ร้านค้า</th>
                <th className="w-[12%] px-3 py-4 text-center text-sm font-bold tracking-[0.04em] text-slate-950">วันที่</th>
                <th className="w-[10%] px-3 py-4 text-center text-sm font-bold tracking-[0.04em] text-slate-950">สินค้า</th>
                <th className="w-[12%] whitespace-nowrap px-3 py-4 text-center text-sm font-bold tracking-[0.04em] text-slate-950">ยอดรวม</th>
                <th className="w-[16%] px-3 py-4 text-left text-sm font-bold tracking-[0.04em] text-slate-950">เลขจัดส่ง</th>
                <th className="w-[18%] px-3 py-4 text-left text-sm font-bold tracking-[0.04em] text-slate-950">การจัดส่ง</th>
                <th className="w-[12%] px-3 py-4 text-center text-sm font-bold tracking-[0.04em] text-slate-950">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {orders.map((order, index) => {
                const orderKey = `${order.customerId}_${order.orderDate}`;
                const isExpanded = expandedOrderId === order.id && visibleOrderIds.has(order.id);
                const detail = detailByOrderId[order.id] ?? null;
                const deliveryNumbers = deliveryByCustomerId[orderKey];
                const hasDelivery = Boolean(deliveryNumbers && deliveryNumbers.length > 0);
                const isBilled = billedByCustomerDate[orderKey] ?? false;
                const isLoading = loadingOrderId === order.id || (isPending && isExpanded && !detail);
                const showDivider = index === 0 || order.orderDate !== orders[index - 1].orderDate;

                return (
                  <Fragment key={order.id}>
                    {showDivider ? (
                      <tr className="bg-slate-50/50">
                        <td colSpan={7} className="border-y border-slate-200 px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-slate-300" />
                            <span className="rounded-2xl border border-slate-200 bg-white px-5 py-2 text-xs font-black uppercase tracking-[0.2em] text-[#003366] shadow-sm">
                              {formatOrderDate(order.orderDate)}
                            </span>
                            <div className="h-px flex-1 bg-slate-300" />
                          </div>
                        </td>
                      </tr>
                    ) : null}

                    <tr className="align-middle transition-colors hover:bg-slate-50/80">
                      <td className="px-3 py-5">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <Building2 className="h-4 w-4 shrink-0 text-[#003366]" strokeWidth={2.2} />
                            <p className="min-w-0 break-words line-clamp-2 text-base font-bold leading-tight text-slate-950">
                              <span translate="no">{order.customerCode}</span> - {order.customerName}
                            </p>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                              {order.channelLabel}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 pl-6">
                            <p
                              className="whitespace-nowrap font-mono text-sm font-semibold leading-5 text-slate-950"
                              translate="no"
                            >
                              {order.orderNumber}
                            </p>
                            {isBilled ? (
                              <span
                                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white"
                                title="วางบิลแล้ว"
                                aria-label="วางบิลแล้ว"
                              >
                                <Check className="h-3 w-3" strokeWidth={3} />
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-5 text-center text-base font-semibold text-slate-950">
                        {formatOrderDate(order.orderDate)}
                      </td>
                      <td className="px-3 py-5 text-center">
                        <p className="whitespace-nowrap text-base font-semibold text-slate-950">
                          {order.productCount.toLocaleString("th-TH")} รายการ
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-5 text-center">
                        <p className="font-mono text-base font-bold text-slate-950">
                          ฿{formatCurrency(order.totalAmount)}
                        </p>
                      </td>
                      <td className="min-w-0 px-3 py-5 text-left">
                        {hasDelivery && deliveryNumbers ? (
                          <div className="flex min-w-0 flex-col items-start gap-1">
                            {deliveryNumbers.map((num) => (
                              <span key={num} className="whitespace-nowrap font-mono text-base font-bold text-emerald-700">
                                {num}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-base font-medium text-slate-400">-</span>
                        )}
                      </td>
                      <td className="min-w-0 px-3 py-5">
                        <div className="flex min-w-0 max-w-full justify-start">
                          <IncomingOrderVehicleSelect
                            customerId={order.customerId}
                            currentVehicleId={order.vehicleId}
                            currentVehicleName={order.vehicleName}
                            vehicles={vehicles}
                            orderDate={orderDate}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-5">
                        <div className="flex w-full items-center justify-center gap-2">
                          <IncomingOrderDateButton
                            currentListDate={orderDate}
                            orderDate={order.orderDate}
                            orderId={order.id}
                            orderNumber={order.orderNumber}
                            searchTerm={searchTerm}
                          />
                          <button
                            type="button"
                            onClick={() => void toggleOrder(order.id)}
                            disabled={isLoading}
                            aria-busy={isLoading}
                            aria-label={isExpanded ? "ซ่อนรายละเอียดออเดอร์" : "แสดงรายละเอียดออเดอร์"}
                            title={isExpanded ? "ซ่อนรายละเอียดออเดอร์" : "แสดงรายละเอียดออเดอร์"}
                            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white p-0 leading-none text-slate-900 shadow-sm transition hover:border-[#003366]/30 hover:bg-slate-50 hover:text-[#003366] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003366]/20 disabled:opacity-85"
                          >
                            {isLoading ? (
                              <Loader2 className="h-4.5 w-4.5 animate-spin" strokeWidth={2.2} />
                            ) : isExpanded ? (
                              <ChevronUp className="h-4.5 w-4.5" strokeWidth={2.2} />
                            ) : (
                              <ChevronDown className="h-4.5 w-4.5" strokeWidth={2.2} />
                            )}
                          </button>
                          {hasDelivery ? (
                            <PrintStoreDeliveryButton
                              date={order.orderDate}
                              customerId={order.customerId}
                              label="พิมพ์ใบส่งของ"
                              iconOnly
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr className="bg-white">
                        <td colSpan={7} className="p-0">
                          {detail ? (
                            <DesktopOrderDetail detail={detail} deliveryNumbers={deliveryNumbers} />
                          ) : (
                            <div className="flex items-center justify-center gap-3 border-y border-slate-300 bg-white px-6 py-8 text-base font-semibold text-slate-700">
                              <Loader2 className="h-5 w-5 animate-spin text-[#003366]" strokeWidth={2.4} />
                              กำลังโหลดรายละเอียดออเดอร์
                            </div>
                          )}
                          {detailError && loadingOrderId === null ? (
                            <div className="border-t border-rose-100 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-700">
                              {detailError}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
