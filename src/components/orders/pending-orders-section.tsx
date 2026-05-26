"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, Loader2, Package2, Printer, Search, Truck, X } from "lucide-react";
import {
  createDeliveryNoteAction,
  getDeliveryFormDataAction,
  getStoreDeliveryDataAction,
} from "@/app/orders/delivery-actions";
import type { CreateDeliveryState } from "@/app/orders/delivery-actions";
import type { DeliveryFormData, DeliveryItemData, PendingOrder } from "@/lib/delivery/admin";

// Helpers

function formatDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

function formatNum(value: number, fractions = 3) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: fractions });
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPendingLine(item: PendingOrder["pendingItems"][number]) {
  return `à¸„à¹‰à¸²à¸‡à¸ªà¹ˆà¸‡: ${item.productName} ${formatNum(item.remainingQty)} ${item.saleUnitLabel}`;
}



type StoreSummaryForBatch = {
  customerId: string;
  customerName: string;
  customerCode: string;
  orderDate: string;
  orderIds?: string[];
  orderNumbers?: string[];
  deliveryNoteIds?: string[];
  orderRounds: number;
  totalAmount: number;
  hasDelivery?: boolean;
  vehicleId?: string | null;
  vehicleName?: string | null;
};

type GroupedStoreItem = DeliveryItemData & {
  customerId: string;
  groupKey: string;
  orderId: string;
  orderItems: Array<DeliveryItemData & { customerId: string; groupKey: string; orderId: string }>;
  totalOrdered: number;
  totalRemaining: number;
};

function toGroupKey(productId: string, saleUnitLabel: string) {
  return `${productId}::${saleUnitLabel}`;
}

function getRemainingSaleUnitQty(item: DeliveryItemData) {
  const remainingByBase =
    item.saleUnitRatio > 0 ? item.remainingBaseQty / item.saleUnitRatio : item.remainingBaseQty;
  if (remainingByBase > 0) {
    return remainingByBase;
  }

  const deliveredQty =
    item.saleUnitRatio > 0 ? item.deliveredBaseQty / item.saleUnitRatio : item.deliveredBaseQty;
  return Math.max(0, item.orderedQty - deliveredQty);
}

function getOrderedSaleUnitQty(item: DeliveryItemData) {
  if (item.orderedQty > 0) {
    return item.orderedQty;
  }

  const orderedByBase =
    item.saleUnitRatio > 0 ? item.orderedBaseQty / item.saleUnitRatio : item.orderedBaseQty;
  if (orderedByBase > 0) {
    return orderedByBase;
  }

  return getRemainingSaleUnitQty(item);
}

function buildGroupedItemsForOrders(orders: DeliveryFormData[]): GroupedStoreItem[] {
  const allItems = orders.flatMap((order) =>
    order.items.map((item) => ({
      ...item,
      customerId: order.customerId,
      groupKey: toGroupKey(item.productId, item.saleUnitLabel),
      orderId: order.orderId,
    })),
  );

  const grouped = new Map<string, typeof allItems>();
  for (const item of allItems) {
    if (!grouped.has(item.groupKey)) {
      grouped.set(item.groupKey, []);
    }
    grouped.get(item.groupKey)?.push(item);
  }

  return Array.from(grouped.values())
    .map((items) => {
      const totalOrdered = items.reduce(
        (sum, item) => sum + getOrderedSaleUnitQty(item),
        0,
      );
      const totalRemaining = items.reduce(
        (sum, item) => sum + getRemainingSaleUnitQty(item),
        0,
      );
      return {
        ...items[0],
        orderItems: items,
        totalOrdered,
        totalRemaining,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, "th"));
}



// Delivery Modal

function DeliveryModal({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [formData, setFormData] = useState<DeliveryFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<CreateDeliveryState | null>(null);
  const deliveryItems = useMemo(() => formData?.items ?? [], [formData]);

  // Load order items on mount
  useEffect(() => {
    getDeliveryFormDataAction(orderId).then((data) => {
      setFormData(data);
      if (data) {
        const init: Record<string, string> = {};
        for (const item of data.items) {
          const defaultQty = getRemainingSaleUnitQty(item);
          init[item.orderItemId] =
            defaultQty > 0 ? formatNum(defaultQty, 3).replace(/,/g, "") : "";
        }
        setQtys(init);
      }
      setLoading(false);
    });
  }, [orderId]);

  const hasAnyQty = deliveryItems.some(
    (item) => parseFloat(qtys[item.orderItemId] ?? "0") > 0,
  );

  const unpricedActiveItems = deliveryItems.filter(
    (item) => item.unitPrice === 0 && parseFloat(qtys[item.orderItemId] ?? "0") > 0,
  );

  async function handleSubmit() {
    if (!formData || !hasAnyQty || isPending) return;

    if (unpricedActiveItems.length > 0) {
      const names = unpricedActiveItems.map((i) => `  â€¢ ${i.productName} (${i.saleUnitLabel})`).join("\n");
      const confirmed = window.confirm(
        `âš ï¸ à¸£à¸²à¸¢à¸à¸²à¸£à¸•à¹ˆà¸­à¹„à¸›à¸™à¸µà¹‰à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸•à¸±à¹‰à¸‡à¸£à¸²à¸„à¸² (${unpricedActiveItems.length} à¸£à¸²à¸¢à¸à¸²à¸£)\n\n${names}\n\nà¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¸ˆà¸°à¸„à¸´à¸”à¸£à¸²à¸„à¸²à¹€à¸›à¹‡à¸™ 0 à¸šà¸²à¸—\nà¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸¢à¸·à¸™à¸¢à¸±à¸™à¸•à¹ˆà¸­à¹„à¸«à¸¡?`
      );
      if (!confirmed) return;
    }

    const itemsPayload = formData.items
      .map((item) => ({
        orderItemId: item.orderItemId,
        productId: item.productId,
        productSaleUnitId: item.productSaleUnitId,
        saleUnitLabel: item.saleUnitLabel,
        saleUnitRatio: item.saleUnitRatio,
        quantityDelivered: parseFloat(qtys[item.orderItemId] ?? "0") || 0,
        unitPrice: item.unitPrice,
      }))
      .filter((i) => i.quantityDelivered > 0);

    const fd = new FormData();
    fd.set("orderIds", JSON.stringify([formData.orderId]));
    fd.set("customerId", formData.customerId);
    fd.set("deliveryDate", formData.orderDate);
    fd.set("notes", notes);
    fd.set("items", JSON.stringify(itemsPayload));

    startTransition(async () => {
      const result = await createDeliveryNoteAction(null, fd);
      setActionState(result);
      if (result.status === "success") {
        router.refresh();
        setTimeout(onClose, 1200);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-3xl border-b border-slate-100 bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
              <h2 className="text-lg font-bold text-slate-950">พิมพ์ใบส่งของ</h2>
            </div>
            {formData && (
              <p className="mt-0.5 text-sm text-slate-500">
                {formData.customerName} Â·{" "}
                <span className="font-mono">{formData.orderNumber}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" strokeWidth={2} />
            </div>
          ) : !formData ? (
            <p className="py-8 text-center text-sm text-slate-500">à¹‚à¸«à¸¥à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ</p>
          ) : (
            <div className="space-y-3">
              {deliveryItems.map((item) => {
                const qty = qtys[item.orderItemId] ?? "";

                return (
                  <div
                    key={item.orderItemId}
                    className="rounded-2xl border border-slate-100 bg-slate-50 p-4 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-950">{item.productName}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-400">{item.productSku}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>
                            à¸ªà¸±à¹ˆà¸‡{" "}
                            <span className="font-semibold text-slate-700">
                              {formatNum(item.orderedQty)} {item.saleUnitLabel}
                            </span>
                          </span>
                          {item.deliveredBaseQty > 0 && (
                            <span>
                              à¸ªà¹ˆà¸‡à¹à¸¥à¹‰à¸§{" "}
                              <span className="font-semibold text-emerald-600">
                                {formatNum(item.deliveredBaseQty / item.saleUnitRatio)}{" "}
                                {item.saleUnitLabel}
                              </span>
                            </span>
                          )}
                          <span>
                            à¸ªà¸•à¹‡à¸­à¸{" "}
                            <span
                              className={`font-semibold ${
                                item.availableStock <= 0 ? "text-red-600" : "text-slate-700"
                              }`}
                            >
                              {formatNum(item.availableStock)} {item.productUnit}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Qty input */}
                      <div className="flex shrink-0 items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={qty}
                          onChange={(e) =>
                            setQtys((prev) => ({
                              ...prev,
                              [item.orderItemId]: e.target.value,
                            }))
                          }
                          className={`w-24 rounded-xl border px-3 py-2 text-right text-base font-bold outline-none transition focus:ring-2 ${
                            "border-slate-200 bg-white text-slate-950 focus:border-[#003366] focus:ring-[#003366]/10"
                          }`}
                          placeholder="0"
                        />
                        <span className="min-w-[3rem] text-sm text-slate-500">
                          {item.saleUnitLabel}
                        </span>
                      </div>
                    </div>

                    {/* No-price warning */}
                    {item.unitPrice === 0 && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
                        <span>à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸•à¸±à¹‰à¸‡à¸£à¸²à¸„à¸²à¸ªà¸´à¸™à¸„à¹‰à¸²à¸™à¸µà¹‰à¸à¸±à¸šà¸¥à¸¹à¸à¸„à¹‰à¸² à¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¸ˆà¸°à¸„à¸´à¸”à¹€à¸›à¹‡à¸™ 0 à¸šà¸²à¸—</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Notes */}
              <div className="pt-1">
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸ (à¸–à¹‰à¸²à¸¡à¸µ)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="à¹€à¸Šà¹ˆà¸™ à¸ªà¹ˆà¸‡à¸£à¸­à¸šà¹€à¸Šà¹‰à¸²"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                />
              </div>
            </div>
          )}

          {/* Action state feedback */}
          {actionState?.status === "error" && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} />
              {actionState.message}
            </div>
          )}
          {actionState?.status === "success" && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                à¸ªà¸£à¹‰à¸²à¸‡ {actionState.deliveryNumber} à¹€à¸£à¸µà¸¢à¸šà¸£à¹‰à¸­à¸¢à¹à¸¥à¹‰à¸§
              </div>
              {actionState.deliveryId && (
                <a
                  href={`/orders/delivery-notes/${actionState.deliveryId}?autoprint=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
                  พิมพ์ใบส่งของ
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-200/80 bg-white/95 px-6 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            à¸¢à¸à¹€à¸¥à¸´à¸
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!formData || !hasAnyQty || isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-[#003366] px-5 py-2.5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(0,51,102,0.16)] transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                à¸à¸³à¸¥à¸±à¸‡à¸ªà¸£à¹‰à¸²à¸‡...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4" strokeWidth={2.2} />
                à¸¢à¸·à¸™à¸¢à¸±à¸™à¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Store-level delivery modal (combines all order rounds of one store)

function StoreDeliveryModal({
  customerName,
  orders,
  onClose,
  defaultVehicleId = null,
  defaultVehicleName = null,
  vehicles = [],
}: {
  customerName: string;
  orders: DeliveryFormData[];
  onClose: () => void;
  defaultVehicleId?: string | null;
  defaultVehicleName?: string | null;
  vehicles?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const groupedItems = useMemo(() => buildGroupedItemsForOrders(orders), [orders]);

  // qtys keyed by product + sale unit
  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const group of groupedItems) {
      init[group.groupKey] =
        group.totalRemaining > 0 ? formatNum(group.totalRemaining, 3).replace(/,/g, "") : "";
    }
    return init;
  });
  const [notes, setNotes] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(defaultVehicleId);
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<CreateDeliveryState[]>([]);

  const hasAnyQty = groupedItems.some((g) => parseFloat(qtys[g.groupKey] ?? "0") > 0);

  const unpricedActiveGroups = groupedItems.filter(
    (g) => g.unitPrice === 0 && parseFloat(qtys[g.groupKey] ?? "0") > 0,
  );

  const anySuccess = results.some((r) => r.status === "success");
  const anyError = results.filter((r) => r.status === "error");

  async function handleSubmit() {
    if (!hasAnyQty || isPending) return;

    if (!selectedVehicleId) {
      window.alert(
        "âš ï¸ à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¹€à¸¥à¸·à¸­à¸à¸£à¸–à¸ˆà¸±à¸”à¸ªà¹ˆà¸‡\n\nà¸à¸£à¸¸à¸“à¸²à¹€à¸¥à¸·à¸­à¸à¸£à¸–à¸ˆà¸±à¸”à¸ªà¹ˆà¸‡à¸à¹ˆà¸­à¸™à¸¢à¸·à¸™à¸¢à¸±à¸™\nà¹€à¸¥à¸·à¸­à¸à¹„à¸”à¹‰à¸ˆà¸²à¸à¸Šà¹ˆà¸­à¸‡ \"à¸£à¸–à¸ˆà¸±à¸”à¸ªà¹ˆà¸‡\" à¸”à¹‰à¸²à¸™à¸šà¸™"
      );
      return;
    }

    if (unpricedActiveGroups.length > 0) {
      const names = unpricedActiveGroups.map((g) => `  â€¢ ${g.productName} (${g.saleUnitLabel})`).join("\n");
      const confirmed = window.confirm(
        `âš ï¸ à¸£à¸²à¸¢à¸à¸²à¸£à¸•à¹ˆà¸­à¹„à¸›à¸™à¸µà¹‰à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸•à¸±à¹‰à¸‡à¸£à¸²à¸„à¸² (${unpricedActiveGroups.length} à¸£à¸²à¸¢à¸à¸²à¸£)\n\n${names}\n\nà¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¸ˆà¸°à¸„à¸´à¸”à¸£à¸²à¸„à¸²à¹€à¸›à¹‡à¸™ 0 à¸šà¸²à¸—\nà¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸¢à¸·à¸™à¸¢à¸±à¸™à¸•à¹ˆà¸­à¹„à¸«à¸¡?`
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      // Distribute qty greedily across order items (earliest order first)
      // then submit ALL items in ONE delivery note
      const toDistribute = new Map<string, number>();
      for (const g of groupedItems) {
        toDistribute.set(g.groupKey, parseFloat(qtys[g.groupKey] ?? "0") || 0);
      }

      const allItemsPayload = [];
      for (const order of orders) {
        for (const item of order.items) {
          const key = toGroupKey(item.productId, item.saleUnitLabel);
          const remaining = toDistribute.get(key) ?? 0;
          if (remaining <= 0) continue;
          const itemMax = getRemainingSaleUnitQty(item);
          const qty = Math.min(remaining, itemMax);
          if (qty <= 0) continue;
          toDistribute.set(key, remaining - qty);
          allItemsPayload.push({
            orderItemId: item.orderItemId,
            productId: item.productId,
            productSaleUnitId: item.productSaleUnitId,
            saleUnitLabel: item.saleUnitLabel,
            saleUnitRatio: item.saleUnitRatio,
            quantityDelivered: qty,
            unitPrice: item.unitPrice,
          });
        }
      }

      const fd = new FormData();
      fd.set("orderIds", JSON.stringify(orders.map((o) => o.orderId)));
      fd.set("customerId", orders[0].customerId);
      fd.set("deliveryDate", orders[0].orderDate);
      fd.set("notes", notes);
      fd.set("items", JSON.stringify(allItemsPayload));
      if (selectedVehicleId) fd.set("vehicleId", selectedVehicleId);

      const result = await createDeliveryNoteAction(null, fd);
      setResults([result]);
        if (result.status === "success") {
          router.refresh();
          setTimeout(onClose, 1400);
        }
    });
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-[2rem] border border-slate-200/80 bg-slate-50 shadow-[0_28px_70px_rgba(15,23,42,0.20)] sm:max-w-5xl sm:rounded-[2rem]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/8 text-[#003366]">
                <Truck className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div>
                <h2 className="text-lg font-black text-slate-950">พิมพ์ใบส่งของ</h2>
              </div>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-600">
              {customerName}
              {orders.length > 1 && (
                <span className="ml-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  {orders.length} à¸£à¸­à¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ
                </span>
              )}
            </p>
            {/* Vehicle selector */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">à¸£à¸–à¸ˆà¸±à¸”à¸ªà¹ˆà¸‡</span>
              {vehicles.length === 0 ? (
                <span className="text-sm text-slate-400">à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸£à¸–</span>
              ) : defaultVehicleId && defaultVehicleName ? (
                <span className="rounded-full border border-[#003366]/15 bg-[#003366]/8 px-3 py-1 text-sm font-semibold text-[#003366]">
                  {defaultVehicleName}
                </span>
              ) : (
                <select
                  value={selectedVehicleId ?? ""}
                  onChange={(e) => setSelectedVehicleId(e.target.value || null)}
                  className={[
                    "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                    selectedVehicleId
                      ? "border-slate-200 text-slate-800"
                      : "border-orange-400 bg-orange-50 text-orange-700",
                  ].join(" ")}
                >
                  <option value="">â€” à¸à¸£à¸¸à¸“à¸²à¹€à¸¥à¸·à¸­à¸à¸£à¸–à¸ˆà¸±à¸”à¸ªà¹ˆà¸‡ â€”</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
          >
            <X className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 sm:px-6 sm:py-5">

        {/* â”€â”€ Mobile card view (< sm) â”€â”€ */}
        <div className="space-y-2 sm:hidden">
          {groupedItems.map((item) => {
            const qty = qtys[item.groupKey] ?? "";
            const qtyNum = parseFloat(qty) || 0;
            const lineTotal = qtyNum * item.unitPrice;

            return (
              <div
                key={item.orderItemId}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
              >
                {/* Product row */}
                <div className="flex items-center gap-3">
                  {item.imageUrl ? (
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-100">
                      <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" sizes="40px" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-100">
                      <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-snug text-slate-900">{item.productName}</p>
                    <p className="font-mono text-xs text-slate-400">{item.productSku}</p>
                    {item.unitPrice === 0 && (
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" strokeWidth={2.4} />
                        à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸•à¸±à¹‰à¸‡à¸£à¸²à¸„à¸²
                      </div>
                    )}
                  </div>
                  {/* Qty input */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={qty}
                      onChange={(e) =>
                        setQtys((prev) => ({ ...prev, [item.groupKey]: e.target.value }))
                      }
                      className={`w-20 rounded-xl border px-2 py-2 text-center text-sm font-bold outline-none transition focus:ring-2 ${
                        "border-slate-200 bg-white text-slate-950 focus:border-[#003366] focus:ring-[#003366]/10"
                      }`}
                      placeholder="0"
                    />
                    <span className="text-xs text-slate-500">{item.saleUnitLabel}</span>
                  </div>
                </div>

                {/* Info row */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-slate-500">
                    à¸ªà¸•à¹‡à¸­à¸{" "}
                    <span className={`font-semibold ${item.availableStock <= 0 ? "text-red-600" : "text-slate-700"}`}>
                      {formatNum(item.availableStock)} {item.productUnit}
                    </span>
                  </span>
                  <span className="text-slate-500">
                    à¸£à¸²à¸„à¸²{" "}
                    <span className="font-semibold text-slate-700">
                      {item.unitPrice > 0 ? `${formatMoney(item.unitPrice)} à¸šà¸²à¸—` : "-"}
                    </span>
                  </span>
                  {lineTotal > 0 && (
                    <span className="ml-auto font-bold text-slate-900">{formatMoney(lineTotal)} à¸šà¸²à¸—</span>
                  )}
                </div>

              </div>
            );
          })}

          {/* Mobile total */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-600">à¸£à¸§à¸¡à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”</span>
            <span className="text-base font-bold text-slate-950">
              {formatMoney(
                groupedItems.reduce((sum, item) => sum + (parseFloat(qtys[item.groupKey] ?? "0") || 0) * item.unitPrice, 0)
              )} à¸šà¸²à¸—
            </span>
          </div>
        </div>

        {/* â”€â”€ Desktop table view (â‰¥ sm) â”€â”€ */}
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 sm:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  à¸£à¸«à¸±à¸ª
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  à¸ªà¸´à¸™à¸„à¹‰à¸²
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  à¸ˆà¸³à¸™à¸§à¸™
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  à¸«à¸™à¹ˆà¸§à¸¢
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  à¸ªà¸•à¹‡à¸­à¸
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  à¸£à¸²à¸„à¸²/à¸«à¸™à¹ˆà¸§à¸¢
                </th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  à¸£à¸§à¸¡à¸¢à¸­à¸”à¹€à¸‡à¸´à¸™
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedItems.map((item, idx) => {
                const qty = qtys[item.groupKey] ?? "";
                const qtyNum = parseFloat(qty) || 0;
                const lineTotal = qtyNum * item.unitPrice;
                const rowBorder = idx < groupedItems.length - 1 ? "border-b border-slate-200" : "";

                return (
                  <tr
                    key={item.orderItemId}
                    className={idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"}
                  >
                    <td className={`border-r border-slate-200 px-3 py-3 text-center font-mono text-xs text-slate-500 ${rowBorder}`}>
                      {item.productSku}
                    </td>
                    <td className={`border-r border-slate-200 px-3 py-3 ${rowBorder}`}>
                      <div className="flex items-center gap-2.5">
                        {item.imageUrl ? (
                          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100">
                            <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" sizes="36px" />
                          </div>
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
                            <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold leading-snug text-slate-900">{item.productName}</p>
                          {item.unitPrice === 0 && (
                            <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              <AlertTriangle className="h-2.5 w-2.5 shrink-0" strokeWidth={2.4} />
                              à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸•à¸±à¹‰à¸‡à¸£à¸²à¸„à¸²
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`border-r border-slate-200 px-2 py-3 ${rowBorder}`}>
                      <div className="flex flex-col items-center gap-0.5">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={qty}
                          onChange={(e) =>
                            setQtys((prev) => ({ ...prev, [item.groupKey]: e.target.value }))
                          }
                          className={`w-20 rounded-lg border px-2 py-1.5 text-center text-sm font-bold outline-none transition focus:ring-2 ${
                            "border-slate-200 bg-white text-slate-950 focus:border-[#003366] focus:ring-[#003366]/10"
                          }`}
                          placeholder="0"
                        />
                      </div>
                    </td>
                    <td className={`border-r border-slate-200 px-3 py-3 text-center text-sm text-slate-600 ${rowBorder}`}>
                      {item.saleUnitLabel}
                    </td>
                    <td className={`border-r border-slate-200 px-3 py-3 text-right ${rowBorder}`}>
                      <span className={`text-sm font-medium ${item.availableStock <= 0 ? "text-red-600" : "text-slate-700"}`}>
                        {formatNum(item.availableStock)}
                      </span>
                      <span className="ml-1 text-xs text-slate-400">{item.productUnit}</span>
                    </td>
                    <td className={`border-r border-slate-200 px-3 py-3 text-right text-sm text-slate-700 ${rowBorder}`}>
                      {item.unitPrice > 0 ? formatMoney(item.unitPrice) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className={`px-3 py-3 text-right text-sm font-semibold ${lineTotal > 0 ? "text-slate-900" : "text-slate-300"} ${rowBorder}`}>
                      {lineTotal > 0 ? formatMoney(lineTotal) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={6} className="px-3 py-3 text-right text-sm font-semibold text-slate-600">
                  à¸£à¸§à¸¡à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”
                </td>
                <td className="px-3 py-3 text-right text-base font-bold text-slate-950">
                  {formatMoney(
                    groupedItems.reduce((sum, item) => sum + (parseFloat(qtys[item.groupKey] ?? "0") || 0) * item.unitPrice, 0)
                  )} à¸šà¸²à¸—
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

          {/* Notes */}

          <div className="mt-4 pt-1">
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">
              à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸ (à¸–à¹‰à¸²à¸¡à¸µ)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="à¹€à¸Šà¹ˆà¸™ à¸ªà¹ˆà¸‡à¸£à¸­à¸šà¹€à¸Šà¹‰à¸²"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
            />
          </div>

          {/* Results */}
          {anyError.length > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} />
              {anyError[0].message}
            </div>
          )}
          {anySuccess && (
            <div className="mt-4 space-y-2 rounded-xl bg-emerald-50 px-4 py-3">
              {results
                .filter((r) => r.status === "success")
                .map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                      à¸ªà¸£à¹‰à¸²à¸‡ {r.deliveryNumber} à¹€à¸£à¸µà¸¢à¸šà¸£à¹‰à¸­à¸¢à¹à¸¥à¹‰à¸§
                    </div>
                    {r.deliveryId && (
                      <a
                        href={`/orders/delivery-notes/${r.deliveryId}?autoprint=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
                        พิมพ์ใบส่งของ
                      </a>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            à¸¢à¸à¹€à¸¥à¸´à¸
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!hasAnyQty || isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-[#003366] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                à¸à¸³à¸¥à¸±à¸‡à¸ªà¸£à¹‰à¸²à¸‡...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4" strokeWidth={2.2} />
                à¸¢à¸·à¸™à¸¢à¸±à¸™à¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function AllStoresDeliveryModal({
  date,
  endDate,
  stores,
  onClose,
}: {
  date: string;
  endDate?: string;
  stores: StoreSummaryForBatch[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all"); // "all", "unassigned", or vehicleId
  const [printSelectedIds, setPrintSelectedIds] = useState<Set<string>>(
    () => new Set(stores.map((store) => `${store.customerId}_${store.orderDate}`)),
  );
  const [isPrintingSelected, setIsPrintingSelected] = useState(false);
  const printFallbackTimerRef = useRef<number | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("th");

  // Extract unique vehicles dynamically from stores list
  const uniqueVehicles = useMemo(() => {
    const map = new Map<string, string>();
    stores.forEach((store) => {
      if (store.vehicleId && store.vehicleName) {
        map.set(store.vehicleId, store.vehicleName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [stores]);

  const hasUnassigned = useMemo(() => {
    return stores.some((store) => !store.vehicleId);
  }, [stores]);

  // Tab statistics: total vs selected stores per tab
  const tabStats = useMemo(() => {
    const stats: Record<string, { total: number; selected: number }> = {
      all: { total: stores.length, selected: 0 },
      unassigned: { total: 0, selected: 0 },
    };

    stores.forEach((store) => {
      const isSelected = printSelectedIds.has(`${store.customerId}_${store.orderDate}`);
      const vId = store.vehicleId;

      if (isSelected) stats.all.selected++;

      if (vId) {
        if (!stats[vId]) {
          stats[vId] = { total: 0, selected: 0 };
        }
        stats[vId].total++;
        if (isSelected) stats[vId].selected++;
      } else {
        stats.unassigned.total++;
        if (isSelected) stats.unassigned.selected++;
      }
    });

    return stats;
  }, [stores, printSelectedIds]);

  // Filter stores belonging to active tab
  const tabFilteredStores = useMemo(() => {
    return stores.filter((store) => {
      if (activeTab === "all") return true;
      if (activeTab === "unassigned") return !store.vehicleId;
      return store.vehicleId === activeTab;
    });
  }, [stores, activeTab]);

  // Filter stores matching query in current tab
  const visibleStores = useMemo(() => {
    return normalizedQuery
      ? tabFilteredStores.filter((store) => {
          const orderNumbers = (store.orderNumbers ?? []).join(" ");
          const haystack = (store.customerCode + " " + store.customerName + " " + orderNumbers).toLocaleLowerCase("th");
          return haystack.includes(normalizedQuery);
        })
      : tabFilteredStores;
  }, [tabFilteredStores, normalizedQuery]);

  // Select stores which are active under current tab
  const selectedStores = useMemo(() => {
    return stores.filter((store) => {
      const isSelected = printSelectedIds.has(`${store.customerId}_${store.orderDate}`);
      if (!isSelected) return false;
      if (activeTab === "all") return true;
      if (activeTab === "unassigned") return !store.vehicleId;
      return store.vehicleId === activeTab;
    });
  }, [stores, printSelectedIds, activeTab]);

  const selectedRounds = selectedStores.reduce((sum, store) => sum + store.orderRounds, 0);
  const selectedTotal = selectedStores.reduce((sum, store) => sum + store.totalAmount, 0);

  const currentTabTotalCount = tabFilteredStores.length;
  const currentTabSelectedCount = selectedStores.length;

  useEffect(() => {
    return () => {
      if (printFallbackTimerRef.current) {
        window.clearTimeout(printFallbackTimerRef.current);
      }
    };
  }, []);

  function selectAllStores() {
    setPrintSelectedIds((prev) => {
      const next = new Set(prev);
      tabFilteredStores.forEach((store) => {
        next.add(`${store.customerId}_${store.orderDate}`);
      });
      return next;
    });
  }

  function clearSelection() {
    setPrintSelectedIds((prev) => {
      const next = new Set(prev);
      tabFilteredStores.forEach((store) => {
        next.delete(`${store.customerId}_${store.orderDate}`);
      });
      return next;
    });
  }

  function triggerPrintJob(deliveryNoteIds: string[]) {
    if (isPrintingSelected) return;
    if (deliveryNoteIds.length === 0) return;
    
    setIsPrintingSelected(true);
    const printUrl = `/delivery/print?note_ids=${encodeURIComponent(deliveryNoteIds.join(","))}&date=${date}${endDate ? `&endDate=${endDate}` : ""}&autoprint=1`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    iframe.src = printUrl;
    document.body.appendChild(iframe);

    const done = () => {
      if (printFallbackTimerRef.current) {
        window.clearTimeout(printFallbackTimerRef.current);
        printFallbackTimerRef.current = null;
      }
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      setIsPrintingSelected(false);
    };

    // Use a very long timeout (2 mins) for large multi-day prints
    printFallbackTimerRef.current = window.setTimeout(done, 120000);
    
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        done();
        return;
      }
      win.addEventListener("afterprint", done, { once: true });
    };
    iframe.onerror = done;
  }

  function togglePrintStore(compositeKey: string) {
    setPrintSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(compositeKey)) {
        next.delete(compositeKey);
      } else {
        next.add(compositeKey);
      }
      return next;
    });
  }

  function handlePrintSelected() {
    if (selectedStores.length === 0) return;

    const deliveryNoteIds = Array.from(
      new Set(selectedStores.flatMap((store) => store.deliveryNoteIds ?? [])),
    );
    triggerPrintJob(deliveryNoteIds);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[4px] sm:items-center sm:p-4">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f5f7fa] shadow-[0_30px_80px_rgba(15,23,42,0.25)] sm:max-h-[92vh] sm:max-w-5xl sm:rounded-[1.75rem] sm:border sm:border-slate-200">
        <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
            <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#003366] text-white shadow-lg sm:h-12 sm:w-12 sm:rounded-2xl">
                <Printer className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-black leading-none text-slate-950 sm:whitespace-nowrap sm:text-[2rem] sm:tracking-[-0.01em]">
                  พิมพ์ใบส่งของ
                </h2>
                <p className="mt-1 text-[11px] font-bold leading-tight text-slate-400 sm:text-sm">
                  วันที่ {formatDate(date)} · เลือกร้านก่อนพิมพ์
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 active:scale-90 sm:h-10 sm:w-10"
              aria-label="ปิด"
            >
              <X className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-5">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-center shadow-sm sm:items-start sm:rounded-2xl sm:p-4 sm:text-left">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 sm:text-xs">ร้านค้าในแท็บนี้</p>
              <p className="text-lg font-black text-[#003366] sm:mt-1 sm:text-2xl">{currentTabTotalCount}</p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-center shadow-sm sm:items-start sm:rounded-2xl sm:p-4 sm:text-left">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600 sm:text-xs">เลือกพิมพ์ในแท็บนี้</p>
              <p className="text-lg font-black text-emerald-700 sm:mt-1 sm:text-2xl">{currentTabSelectedCount}</p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-center shadow-sm sm:items-start sm:rounded-2xl sm:p-4 sm:text-left">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 sm:text-xs">รอบ / ยอดรวมกลุ่มนี้</p>
              <p className="mt-0.5 text-[10px] font-black text-slate-900 sm:mt-1 sm:text-lg">
                {selectedRounds} รอบ · {formatMoney(selectedTotal)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-none sm:mt-5 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black transition active:scale-95 sm:px-5 sm:py-2.5 sm:text-sm ${
                activeTab === "all"
                  ? "bg-[#003366] text-white shadow-[0_8px_20px_rgba(0,51,102,0.15)]"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>ทั้งหมด</span>
              <span
                className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                  activeTab === "all" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {tabStats.all.selected > 0 ? `${tabStats.all.selected}/${tabStats.all.total}` : tabStats.all.total}
              </span>
            </button>

            {uniqueVehicles.map((vehicle) => {
              const stats = tabStats[vehicle.id] || { total: 0, selected: 0 };
              const isActive = activeTab === vehicle.id;
              return (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => setActiveTab(vehicle.id)}
                  className={`relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black transition active:scale-95 sm:px-5 sm:py-2.5 sm:text-sm ${
                    isActive
                      ? "bg-[#003366] text-white shadow-[0_8px_20px_rgba(0,51,102,0.15)]"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Truck className="h-3.5 w-3.5" strokeWidth={isActive ? 2.5 : 2} />
                  <span>{vehicle.name}</span>
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                      isActive
                        ? "bg-white/20 text-white"
                        : stats.selected > 0
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {stats.selected > 0 ? `${stats.selected}/${stats.total}` : stats.total}
                  </span>
                </button>
              );
            })}

            {hasUnassigned && (
              <button
                type="button"
                onClick={() => setActiveTab("unassigned")}
                className={`relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black transition active:scale-95 sm:px-5 sm:py-2.5 sm:text-sm ${
                  activeTab === "unassigned"
                    ? "bg-[#003366] text-white shadow-[0_8px_20px_rgba(0,51,102,0.15)]"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>ยังไม่กำหนดรถ</span>
                <span
                  className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                    activeTab === "unassigned"
                      ? "bg-white/20 text-white"
                      : tabStats.unassigned.selected > 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {tabStats.unassigned.selected > 0 ? `${tabStats.unassigned.selected}/${tabStats.unassigned.total}` : tabStats.unassigned.total}
                </span>
              </button>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:mt-4 sm:rounded-2xl sm:p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <label className="relative block flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 sm:left-4 sm:h-4 sm:w-4" strokeWidth={2.2} />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหาร้านค้า..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-semibold text-slate-950 outline-none transition focus:border-[#003366] focus:bg-white focus:ring-2 focus:ring-[#003366]/10 sm:rounded-xl sm:py-3 sm:pl-11 sm:pr-4 sm:text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0">
                <button
                  type="button"
                  onClick={selectAllStores}
                  className="rounded-lg bg-[#003366] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#002244] sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                >
                  เลือกทั้งหมดในแท็บ
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
                >
                  ล้างที่เลือกในแท็บ
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="hidden grid-cols-[minmax(0,1fr)_110px_140px_64px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-600 md:grid">
              <span>ร้านค้า</span>
              <span className="text-center">รอบ</span>
              <span className="text-right">ยอดรวม</span>
              <span className="text-center">เลือก</span>
            </div>
            <div className="divide-y divide-slate-200">
              {visibleStores.map((store) => {
                const compositeKey = `${store.customerId}_${store.orderDate}`;
                const checked = printSelectedIds.has(compositeKey);
                return (
                  <label
                    key={compositeKey}
                    className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 transition hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_110px_140px_64px] md:items-center"
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-black leading-snug text-slate-950">
                        {store.customerCode} - {store.customerName}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {store.vehicleName ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[#003366]/5 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#003366]">
                            <Truck className="h-2.5 w-2.5" strokeWidth={2.5} />
                            {store.vehicleName}
                          </span>
                        ) : null}
                        {endDate ? (
                          <span className="text-[10px] font-bold uppercase text-[#003366]">
                            วันที่จัดส่ง: {formatDate(store.orderDate)}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-slate-500 md:hidden">
                        {store.orderRounds} รอบ · {formatMoney(store.totalAmount)} บาท
                      </span>
                    </span>
                    <span className="hidden text-center text-sm font-bold text-slate-900 md:block">
                      {store.orderRounds}
                    </span>
                    <span className="hidden text-right text-sm font-black text-[#003366] md:block">
                      {formatMoney(store.totalAmount)} บาท
                    </span>
                    <span className="flex items-center justify-end md:justify-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePrintStore(compositeKey)}
                        className="h-5 w-5 rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                    </span>
                  </label>
                );
              })}
              {visibleStores.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                  ไม่พบร้านค้าที่ตรงกับคำค้นหา
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-4 shadow-[0_-16px_40px_rgba(15,23,42,0.06)] sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-500">
              เลือกแล้ว {currentTabSelectedCount} ร้าน จากทั้งหมด {currentTabTotalCount} ร้านในกลุ่มนี้ (รวมเลือกทั้งหมด {printSelectedIds.size} ร้าน)
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                disabled={isPrintingSelected}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 sm:min-w-28"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handlePrintSelected}
                disabled={currentTabSelectedCount === 0 || isPrintingSelected}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#003366] px-5 py-3 text-base font-black text-white shadow-[0_14px_30px_rgba(0,51,102,0.18)] transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-44"
              >
                {isPrintingSelected ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                    กำลังพิมพ์...
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4" strokeWidth={2.2} />
                    พิมพ์ {currentTabSelectedCount} ร้าน
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AllStoresDeliveryButton({
  date,
  endDate,
  stores,
}: {
  date: string;
  endDate?: string;
  stores: StoreSummaryForBatch[];
}) {
  const [open, setOpen] = useState(false);

  if (stores.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#003366]/20 bg-[#003366] px-3 py-1.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#002244] hover:shadow-lg active:scale-[0.98] disabled:opacity-50 print:hidden md:gap-2 md:px-6 md:py-2.5 md:text-sm"
      >
        <Printer className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" strokeWidth={2.5} />
        พิมพ์ใบส่งของทุกร้านค้า
      </button>
      {open && (
        <AllStoresDeliveryModal date={date} endDate={endDate} stores={stores} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export function StoreDeliveryButton({
  customerId,
  customerName,
  date,
  defaultVehicleId = null,
  defaultVehicleName = null,
  vehicles = [],
}: {
  customerId: string;
  customerName: string;
  date: string;
  defaultVehicleId?: string | null;
  defaultVehicleName?: string | null;
  vehicles?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<DeliveryFormData[] | null>(null);

  async function handleOpen() {
    setLoading(true);
    const data = await getStoreDeliveryDataAction(customerId, date);
    setOrders(data);
    setLoading(false);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={loading}
        className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#003366] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#002244] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
        )}
        พิมพ์ใบส่งของ
      </button>
      {open && orders && orders.length > 0 && (
        <StoreDeliveryModal
          customerName={customerName}
          orders={orders}
          defaultVehicleId={defaultVehicleId}
          defaultVehicleName={defaultVehicleName}
          vehicles={vehicles}
          onClose={() => { setOpen(false); setOrders(null); }}
        />
      )}
      {open && orders && orders.length === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="rounded-2xl bg-white px-8 py-6 text-center shadow-2xl">
            <p className="text-sm text-slate-500">ไม่มีใบส่งของสำหรับพิมพ์</p>
          </div>
        </div>
      )}
    </>
  );
}

// Standalone create-delivery button (reusable in order rounds list)

export function CreateDeliveryButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#003366] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#002244] active:scale-[0.98]"
        >
          <Truck className="h-3.5 w-3.5" strokeWidth={2.4} />
          พิมพ์ใบส่งของ
      </button>
      {open && <DeliveryModal orderId={orderId} onClose={() => setOpen(false)} />}
    </>
  );
}

// Pending Orders Section

export function PendingOrdersSection({ orders }: { orders: PendingOrder[] }) {
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  if (orders.length === 0) return null;

  const totalOutstandingAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const outstandingDates = Array.from(new Set(orders.map((order) => order.orderDate)));
  const outstandingDateLabel =
    outstandingDates.length === 1
      ? formatDate(outstandingDates[0])
      : `${formatDate(outstandingDates[0])} - ${formatDate(outstandingDates[outstandingDates.length - 1])}`;

  return (
    <>
      <section className="overflow-hidden rounded-[1.5rem] border border-amber-200 bg-amber-50 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
        {/* Section header */}
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-100/60 px-5 py-3.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" strokeWidth={2.4} />
          <span className="text-sm font-bold text-amber-800">
            à¸„à¹‰à¸²à¸‡à¸ªà¹ˆà¸‡ {orders.length} à¸­à¸­à¹€à¸”à¸­à¸£à¹Œ
          </span>
          <span className="text-xs font-semibold text-amber-700">
            à¸¢à¸­à¸”à¸„à¹‰à¸²à¸‡à¸ªà¹ˆà¸‡ {formatMoney(totalOutstandingAmount)} à¸šà¸²à¸—
          </span>
          <span className="text-xs text-amber-700/80">
            à¸‚à¸­à¸‡à¸§à¸±à¸™à¸—à¸µà¹ˆ {outstandingDateLabel}
          </span>
          <span className="ml-auto text-xs text-amber-600">
            à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸ˆà¸²à¸à¸§à¸±à¸™à¸à¹ˆà¸­à¸™à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆà¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸ˆà¸±à¸”à¸ªà¹ˆà¸‡
          </span>
        </div>

        {/* Order rows */}
        <div className="divide-y divide-amber-100">
          {orders.map((order) => (
            <div key={order.id} className="px-4 py-3 sm:px-5 sm:py-4">
              {/* Top row: date | customer | amount + button */}
              <div className="flex items-start gap-3">
                {/* Date + badge */}
                <div className="shrink-0 text-center">
                  <p className="text-xs font-semibold text-amber-700">
                    {formatDate(order.orderDate)}
                  </p>
                  {order.fulfillmentStatus === "partial" && (
                    <span className="mt-1 inline-block rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      à¸ªà¹ˆà¸‡à¸šà¸²à¸‡à¸ªà¹ˆà¸§à¸™
                    </span>
                  )}
                </div>

                {/* Customer */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{order.customerName}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">{order.orderNumber}</p>
                </div>

                {/* Amount + button (stacked on mobile, side-by-side on sm+) */}
                <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                  <p className="text-sm font-bold text-slate-950 whitespace-nowrap">
                    {formatMoney(order.totalAmount)} à¸šà¸²à¸—
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveOrderId(order.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#003366] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#002244]"
                  >
                    <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
                    <span className="hidden xs:inline">พิมพ์ใบส่งของ</span>
                    <span className="xs:hidden">สร้าง</span>
                  </button>
                </div>
              </div>

              {/* Pending item tags */}
              {order.pendingItems.length > 0 && (
                <div className="mt-2 ml-[52px] flex flex-wrap gap-1.5">
                  {order.pendingItems.map((item) => (
                    <span
                      key={item.orderItemId}
                      className="inline-flex rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200"
                      title={`${item.productSku} Â· à¸ªà¸±à¹ˆà¸‡ ${formatNum(item.orderedQty)} ${item.saleUnitLabel} Â· à¸ªà¹ˆà¸‡à¹à¸¥à¹‰à¸§ ${formatNum(item.deliveredQty)} ${item.saleUnitLabel}`}
                    >
                      {formatPendingLine(item)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Modal */}
      {activeOrderId && (
        <DeliveryModal
          orderId={activeOrderId}
          onClose={() => setActiveOrderId(null)}
        />
      )}
    </>
  );
}
