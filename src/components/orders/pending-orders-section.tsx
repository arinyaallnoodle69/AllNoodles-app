"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertTriangle, ArrowLeft, Building2, Check, CheckCircle2, Layers3, Loader2, Package2, PencilLine, Search, Truck, X } from "lucide-react";
import {
  createBatchDeliveryNotesAction,
  createDeliveryNoteAction,
  getBatchDeliveryReviewDataAction,
  getDeliveryFormDataAction,
  getStoreDeliveryDataAction,
} from "@/app/orders/delivery-actions";
import type { BatchCreateDeliveryNoteInput, BatchDeliveryReviewGroup, CreateDeliveryState } from "@/app/orders/delivery-actions";
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

function formatOrderNumbers(orderNumbers: string[] | undefined) {
  const cleanOrderNumbers = Array.from(new Set((orderNumbers ?? []).filter(Boolean)));
  if (cleanOrderNumbers.length === 0) return "";
  if (cleanOrderNumbers.length <= 2) return cleanOrderNumbers.join(", ");
  return `${cleanOrderNumbers.slice(0, 2).join(", ")} + อีก ${cleanOrderNumbers.length - 2}`;
}

function formatPendingLine(item: PendingOrder["pendingItems"][number]) {
  return `ค้างส่ง: ${item.productName} ${formatNum(item.remainingQty)} ${item.saleUnitLabel}`;
}

function toEditableRowKey(customerId: string, groupKey: string) {
  return `${customerId}::${groupKey}`;
}

type StoreSummaryForBatch = {
  customerId: string;
  customerName: string;
  customerCode: string;
  orderIds?: string[];
  orderNumbers?: string[];
  orderRounds: number;
  totalAmount: number;
};

type GroupedStoreItem = DeliveryItemData & {
  customerId: string;
  groupKey: string;
  orderId: string;
  orderItems: Array<DeliveryItemData & { customerId: string; groupKey: string; orderId: string }>;
  totalOrdered: number;
  totalRemaining: number;
};

type BatchStoreGroup = BatchDeliveryReviewGroup;

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
      const names = unpricedActiveItems.map((i) => `  • ${i.productName} (${i.saleUnitLabel})`).join("\n");
      const confirmed = window.confirm(
        `⚠️ รายการต่อไปนี้ยังไม่ได้ตั้งราคา (${unpricedActiveItems.length} รายการ)\n\n${names}\n\nใบส่งของจะคิดราคาเป็น 0 บาท\nต้องการยืนยันต่อไหม?`
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-3xl border-b border-slate-100 bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
              <h2 className="text-lg font-bold text-slate-950">สร้างใบส่งของ</h2>
            </div>
            {formData && (
              <p className="mt-0.5 text-sm text-slate-500">
                {formData.customerName} ·{" "}
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
            <p className="py-8 text-center text-sm text-slate-500">โหลดข้อมูลไม่สำเร็จ</p>
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
                            สั่ง{" "}
                            <span className="font-semibold text-slate-700">
                              {formatNum(item.orderedQty)} {item.saleUnitLabel}
                            </span>
                          </span>
                          {item.deliveredBaseQty > 0 && (
                            <span>
                              ส่งแล้ว{" "}
                              <span className="font-semibold text-emerald-600">
                                {formatNum(item.deliveredBaseQty / item.saleUnitRatio)}{" "}
                                {item.saleUnitLabel}
                              </span>
                            </span>
                          )}
                          <span>
                            สต็อก{" "}
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
                        <span>ยังไม่ได้ตั้งราคาสินค้านี้กับลูกค้า ใบส่งของจะคิดเป็น 0 บาท</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Notes */}
              <div className="pt-1">
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  หมายเหตุ (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น ส่งรอบเช้า"
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
                สร้าง {actionState.deliveryNumber} เรียบร้อยแล้ว
              </div>
              {actionState.deliveryId && (
                <a
                  href={`/orders/delivery-notes/${actionState.deliveryId}`}
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
            ยกเลิก
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
                กำลังสร้าง...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4" strokeWidth={2.2} />
                ยืนยันใบส่งของ
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
        "⚠️ ยังไม่ได้เลือกรถจัดส่ง\n\nกรุณาเลือกรถจัดส่งก่อนยืนยัน\nเลือกได้จากช่อง \"รถจัดส่ง\" ด้านบน"
      );
      return;
    }

    if (unpricedActiveGroups.length > 0) {
      const names = unpricedActiveGroups.map((g) => `  • ${g.productName} (${g.saleUnitLabel})`).join("\n");
      const confirmed = window.confirm(
        `⚠️ รายการต่อไปนี้ยังไม่ได้ตั้งราคา (${unpricedActiveGroups.length} รายการ)\n\n${names}\n\nใบส่งของจะคิดราคาเป็น 0 บาท\nต้องการยืนยันต่อไหม?`
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-[2rem] border border-slate-200/80 bg-slate-50 shadow-[0_28px_70px_rgba(15,23,42,0.20)] sm:max-w-5xl sm:rounded-[2rem]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/8 text-[#003366]">
                <Truck className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div>
                <h2 className="text-lg font-black text-slate-950">สร้างใบส่งของ</h2>
              </div>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-600">
              {customerName}
              {orders.length > 1 && (
                <span className="ml-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  {orders.length} รอบออเดอร์
                </span>
              )}
            </p>
            {/* Vehicle selector */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">รถจัดส่ง</span>
              {vehicles.length === 0 ? (
                <span className="text-sm text-slate-400">ยังไม่มีข้อมูลรถ</span>
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
                  <option value="">— กรุณาเลือกรถจัดส่ง —</option>
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

        {/* ── Mobile card view (< sm) ── */}
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
                        ยังไม่ตั้งราคา
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
                    สต็อก{" "}
                    <span className={`font-semibold ${item.availableStock <= 0 ? "text-red-600" : "text-slate-700"}`}>
                      {formatNum(item.availableStock)} {item.productUnit}
                    </span>
                  </span>
                  <span className="text-slate-500">
                    ราคา{" "}
                    <span className="font-semibold text-slate-700">
                      {item.unitPrice > 0 ? `${formatMoney(item.unitPrice)} บาท` : "-"}
                    </span>
                  </span>
                  {lineTotal > 0 && (
                    <span className="ml-auto font-bold text-slate-900">{formatMoney(lineTotal)} บาท</span>
                  )}
                </div>

              </div>
            );
          })}

          {/* Mobile total */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-600">รวมทั้งหมด</span>
            <span className="text-base font-bold text-slate-950">
              {formatMoney(
                groupedItems.reduce((sum, item) => sum + (parseFloat(qtys[item.groupKey] ?? "0") || 0) * item.unitPrice, 0)
              )} บาท
            </span>
          </div>
        </div>

        {/* ── Desktop table view (≥ sm) ── */}
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 sm:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  รหัส
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  สินค้า
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  จำนวน
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  หน่วย
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  สต็อก
                </th>
                <th className="border-b border-r border-slate-200 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  ราคา/หน่วย
                </th>
                <th className="border-b border-slate-200 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  รวมยอดเงิน
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
                              ยังไม่ตั้งราคา
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
                  รวมทั้งหมด
                </td>
                <td className="px-3 py-3 text-right text-base font-bold text-slate-950">
                  {formatMoney(
                    groupedItems.reduce((sum, item) => sum + (parseFloat(qtys[item.groupKey] ?? "0") || 0) * item.unitPrice, 0)
                  )} บาท
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

          {/* Notes */}

          <div className="mt-4 pt-1">
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">
              หมายเหตุ (ถ้ามี)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="เช่น ส่งรอบเช้า"
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
                      สร้าง {r.deliveryNumber} เรียบร้อยแล้ว
                    </div>
                    {r.deliveryId && (
                      <a
                        href={`/orders/delivery-notes/${r.deliveryId}`}
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
            ยกเลิก
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
                กำลังสร้าง...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4" strokeWidth={2.2} />
                ยืนยันใบส่งของ
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
  stores,
  onClose,
}: {
  date: string;
  stores: StoreSummaryForBatch[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"select" | "review" | "print">("select");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(stores.map((store) => store.customerId)),
  );
  const [groups, setGroups] = useState<BatchStoreGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<
    Array<{ customerId: string; customerName: string; state: CreateDeliveryState }>
  >([]);
  const [printSelectedIds, setPrintSelectedIds] = useState<Set<string>>(new Set());
  const [reviewEdits, setReviewEdits] = useState<Record<string, { quantity: string; unitPrice: string }>>({});
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [isPrintingSelected, setIsPrintingSelected] = useState(false);
  const printFallbackTimerRef = useRef<number | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
	  const filteredStores = useMemo(() => {
	    if (!normalizedQuery) return stores;
	    return stores.filter((store) => {
	      const haystack = `${store.customerCode} ${store.customerName} ${(store.orderNumbers ?? []).join(" ")}`.toLowerCase();
	      return haystack.includes(normalizedQuery);
	    });
	  }, [normalizedQuery, stores]);

  const selectedStores = useMemo(
    () => stores.filter((store) => selectedIds.has(store.customerId)),
    [selectedIds, stores],
  );

  function toggleStore(customerId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
    setLoadError(null);
  }

  function selectAllStores() {
    setSelectedIds(new Set(stores.map((store) => store.customerId)));
    setLoadError(null);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setLoadError(null);
  }

  function getReviewValues(customerId: string, item: BatchStoreGroup["groupedItems"][number]) {
    const rowKey = toEditableRowKey(customerId, item.groupKey);
    const edit = reviewEdits[rowKey];
    const quantityRaw = edit?.quantity ?? formatNum(item.totalOrdered, 3).replace(/,/g, "");
    const unitPriceRaw = edit?.unitPrice ?? item.unitPrice.toFixed(2);
    const parsedQuantity = Number.parseFloat(quantityRaw);
    const parsedUnitPrice = Number.parseFloat(unitPriceRaw);

    return {
      rowKey,
      quantityInput: quantityRaw,
      unitPriceInput: unitPriceRaw,
      quantity:
        Number.isFinite(parsedQuantity) && parsedQuantity > 0
          ? Math.min(parsedQuantity, item.totalOrdered)
          : 0,
      unitPrice: Number.isFinite(parsedUnitPrice) && parsedUnitPrice >= 0 ? parsedUnitPrice : 0,
    };
  }

  function updateReviewValue(
    rowKey: string,
    field: "quantity" | "unitPrice",
    value: string,
    defaults: { quantity: string; unitPrice: string },
  ) {
    setReviewEdits((prev) => ({
      ...prev,
      [rowKey]: {
        quantity: prev[rowKey]?.quantity ?? defaults.quantity,
        unitPrice: prev[rowKey]?.unitPrice ?? defaults.unitPrice,
        [field]: value,
      },
    }));
  }

  const reviewGroups = groups.map((group) => {
    const reviewRows = group.groupedItems.map((item) => {
      const reviewValue = getReviewValues(group.customerId, item);
      return {
        item,
        ...reviewValue,
        lineTotal: reviewValue.quantity * reviewValue.unitPrice,
      };
    });

    return {
      ...group,
      reviewRows,
      groupTotal: reviewRows.reduce((sum, row) => sum + row.lineTotal, 0),
    };
  });

  async function handleReviewSelectedStores() {
    if (selectedStores.length === 0 || loadingGroups) return;

    setLoadingGroups(true);
    setLoadError(null);
    try {
      const nextGroups = await getBatchDeliveryReviewDataAction(selectedStores, date, true);

      if (nextGroups.length === 0) {
        setGroups([]);
        setLoadError("ไม่มีร้านค้าที่พร้อมสร้างใบส่งของในชุดที่เลือก");
        return;
      }

      setGroups(nextGroups);
      setReviewEdits(
        Object.fromEntries(
          nextGroups.flatMap((group) =>
            group.groupedItems.map((item) => [
              toEditableRowKey(group.customerId, item.groupKey),
              {
                quantity: formatNum(item.totalOrdered, 3).replace(/,/g, ""),
                unitPrice: item.unitPrice.toFixed(2),
              },
            ]),
          ),
        ),
      );
      setEditingRowKey(null);
      setResults([]);
      setSubmitError(null);
      setPrintSelectedIds(new Set());
      setStep("review");
    } catch {
      setLoadError("โหลดรายการสำหรับสร้างใบส่งของไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoadingGroups(false);
    }
  }

  const storesWithQty = reviewGroups.filter((group) =>
    group.reviewRows.some((row) => row.quantity > 0),
  );
  const hasAnyQty = storesWithQty.length > 0;

  const unpricedActiveRows = reviewGroups.flatMap((group) =>
    group.reviewRows
      .filter((row) => row.unitPrice === 0 && row.quantity > 0)
      .map((row) => ({ customerName: group.customerName, item: row.item })),
  );

  async function handleSubmit() {
    if (!hasAnyQty || isPending) return;
    setSubmitError(null);
    setResults([]);

    if (unpricedActiveRows.length > 0) {
      const lines = unpricedActiveRows
        .slice(0, 12)
        .map(({ customerName, item }) => `  • ${customerName}: ${item.productName}`)
        .join("\n");
      const moreText =
        unpricedActiveRows.length > 12
          ? `\n  • และอีก ${unpricedActiveRows.length - 12} รายการ`
          : "";
      const confirmed = window.confirm(
        `⚠️ มีรายการที่ยังไม่ได้ตั้งราคา ${unpricedActiveRows.length} รายการ\n\n${lines}${moreText}\n\nระบบจะคิดราคาเป็น 0 บาทในรายการเหล่านี้\nต้องการยืนยันต่อหรือไม่?`,
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const payloadGroups: BatchCreateDeliveryNoteInput[] = storesWithQty
        .map((group) => {
          const items = group.reviewRows.flatMap((row) => {
            const { quantity, unitPrice, item } = row;
            let remainingQty = quantity;

            return item.orderItems.flatMap((orderItem) => {
              if (remainingQty <= 0) return [];
              const orderItemMaxQty = orderItem.quantityDelivered;
              const deliverQty = Math.min(remainingQty, orderItemMaxQty);
              remainingQty -= deliverQty;

              if (deliverQty <= 0) return [];

              return [
                {
                  orderItemId: orderItem.orderItemId,
                  productId: orderItem.productId,
                  productSaleUnitId: orderItem.productSaleUnitId,
                  quantityDelivered: deliverQty,
                  saleUnitLabel: orderItem.saleUnitLabel,
                  saleUnitRatio: orderItem.saleUnitRatio,
                  unitPrice,
                },
              ];
            });
          });

          return {
            customerId: group.customerId,
            customerName: group.customerName,
            orderIds: group.orderIds,
            notes: "",
            items,
          };
        })
        .filter((group) => group.items.length > 0);

      if (payloadGroups.length === 0) {
        setSubmitError("ไม่พบรายการที่พร้อมสร้างใบส่งของ กรุณาตรวจสอบจำนวนสินค้าอีกครั้ง");
        return;
      }

      try {
        const nextResults = await createBatchDeliveryNotesAction(payloadGroups, date);
        setResults(nextResults);

        const nextSuccessIds = nextResults
          .filter((row) => row.state.status === "success")
          .map((row) => row.customerId);

        if (nextSuccessIds.length > 0) {
          setPrintSelectedIds(new Set(nextSuccessIds));
          setStep("print");
          router.refresh();
          return;
        }

        const firstError = nextResults.find((row) => row.state.status === "error")?.state.message;
        setSubmitError(firstError ?? "สร้างใบส่งของไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      } catch {
        setSubmitError("สร้างใบส่งของไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    });
  }

  const totalSelectedAmount = reviewGroups.reduce((sum, group) => sum + group.groupTotal, 0);

  const successRows = results.filter((row) => row.state.status === "success");
  const errorRows = results.filter((row) => row.state.status === "error");
  const printRows = successRows.filter((row) => row.state.deliveryId);

  function togglePrintStore(customerId: string) {
    setPrintSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) {
        next.delete(customerId);
      } else {
        next.add(customerId);
      }
      return next;
    });
  }

  function handlePrintSelected() {
    if (isPrintingSelected) return;
    const customerIds = Array.from(printSelectedIds);
    if (customerIds.length === 0) return;

    setIsPrintingSelected(true);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    iframe.src = `/delivery/print?date=${date}&customers=${encodeURIComponent(customerIds.join(","))}&autoprint=1`;
    document.body.appendChild(iframe);

    const done = () => {
      if (printFallbackTimerRef.current) {
        window.clearTimeout(printFallbackTimerRef.current);
        printFallbackTimerRef.current = null;
      }
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      setIsPrintingSelected(false);
    };

    printFallbackTimerRef.current = window.setTimeout(done, 15000);

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        done();
        return;
      }
      win.addEventListener("afterprint", () => {
        done();
      });
      setTimeout(() => win.print(), 300);
    };

    iframe.onerror = () => {
      done();
    };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="h-[100dvh] w-full overflow-x-hidden overflow-y-auto bg-slate-50 shadow-[0_28px_70px_rgba(15,23,42,0.20)] sm:max-h-[94vh] sm:max-w-6xl sm:rounded-[2rem] sm:border sm:border-slate-200/80">
        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:sticky sm:top-0 sm:z-20 sm:bg-white/95 sm:backdrop-blur sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/8 text-[#003366]">
                  <Layers3 className="h-5 w-5" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-black text-slate-950 sm:text-xl">
                  {step === "select"
                    ? "เลือกร้านค้าสำหรับใบส่งของ"
                    : step === "review"
                      ? "ตรวจสอบใบส่งของ"
                      : "เลือกใบส่งของที่จะพิมพ์"}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    วันที่ {formatDate(date)} ·{" "}
                    {step === "select"
                      ? `เลือกแล้ว ${selectedStores.length} จาก ${stores.length} ร้าน`
                      : step === "review"
                        ? `${groups.length} ร้านที่กำลังสร้าง`
                        : `พิมพ์ ${printSelectedIds.size} จาก ${printRows.length} ร้าน`}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { key: "select", label: "1 เลือกร้าน" },
                  { key: "review", label: "2 ตรวจสอบ" },
                  { key: "print", label: "3 พิมพ์" },
                ].map((stepItem, index) => {
                  const active = step === stepItem.key;
                  const complete =
                    (step === "review" && index === 0) ||
                    (step === "print" && index < 2);

                  return (
                    <span
                      key={stepItem.key}
                      className={[
                        "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold transition",
                        active
                          ? "bg-[#003366] text-white shadow-sm"
                          : complete
                            ? "border border-[#003366]/20 bg-[#003366]/6 text-[#003366]"
                            : "border border-slate-200 bg-slate-50 text-slate-500",
                      ].join(" ")}
                    >
                      {stepItem.label}
                    </span>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
              aria-label="ปิด"
            >
              <X className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-3 py-3 sm:space-y-5 sm:px-6 sm:py-5">
          {step === "select" ? (
            <>
              <div className="grid grid-cols-3 gap-2.5 rounded-[1.35rem] border border-slate-200 bg-white px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:gap-3 sm:px-4">
                <div className="rounded-[1rem] bg-slate-50 px-3 py-2.5 text-center">
                  <p className="text-[11px] font-bold text-slate-500 sm:text-xs">พร้อมสร้าง</p>
                  <p className="mt-1 text-lg font-black text-[#003366] sm:text-2xl">{stores.length}</p>
                </div>
                <div className="rounded-[1rem] bg-emerald-50 px-3 py-2.5 text-center">
                  <p className="text-[11px] font-bold text-slate-500 sm:text-xs">เลือกแล้ว</p>
                  <p className="mt-1 text-lg font-black text-emerald-700 sm:text-2xl">{selectedStores.length}</p>
                </div>
                <div className="rounded-[1rem] bg-slate-50 px-3 py-2.5 text-center">
                  <p className="text-[11px] font-bold text-slate-500 sm:text-xs">รอบออเดอร์</p>
                  <p className="mt-1 text-lg font-black text-slate-950 sm:text-2xl">
                    {selectedStores.reduce((sum, store) => sum + store.orderRounds, 0)}
                  </p>
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-slate-200 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)] sm:sticky sm:top-[7.25rem] sm:z-10 sm:bg-white/95 sm:backdrop-blur">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" strokeWidth={2.2} />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="ค้นหารหัสร้านหรือชื่อร้าน"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-base font-medium text-slate-900 outline-none transition focus:border-[#003366] focus:bg-white focus:ring-2 focus:ring-[#003366]/10"
                  />
                </label>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllStores}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-[#003366]/20 bg-[#003366] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#00264d]"
                  >
                    เลือกทั้งหมด
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                  >
                    ล้างที่เลือก
                  </button>
                </div>
              </div>

              {loadError && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  {loadError}
                </div>
              )}

              <div className="grid gap-2.5 sm:grid-cols-2">
                {filteredStores.map((store) => {
                  const checked = selectedIds.has(store.customerId);
                  return (
                    <label
                      key={store.customerId}
                      className={[
                        "flex cursor-pointer items-start gap-3 rounded-[1.2rem] border px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition",
                        checked
                          ? "border-[#003366]/35 bg-[#003366]/[0.03] shadow-[0_12px_28px_rgba(0,51,102,0.10)]"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStore(store.customerId)}
                        className="mt-1 h-5 w-5 rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
	                      />
	                      <span className="min-w-0 flex-1">
	                        <span className="block text-base font-bold leading-snug text-slate-950">
	                          {store.customerName}
	                        </span>
	                        <span className="mt-1 block font-mono text-sm font-semibold text-[#003366]">
                            {formatOrderNumbers(store.orderNumbers) || "ไม่มีเลขออเดอร์"}
	                        </span>
	                        <span className="mt-1 block text-xs font-semibold text-slate-500">
	                          {store.customerCode} · {store.orderRounds} รอบออเดอร์ · {formatMoney(store.totalAmount)} บาท
	                        </span>
	                      </span>
                      {checked && (
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#003366] text-white">
                          <Check className="h-4 w-4" strokeWidth={2.4} />
                        </span>
                      )}
                    </label>
                  );
                })}
                {filteredStores.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500 sm:col-span-2">
                    ไม่พบร้านค้าที่ตรงกับคำค้นหา
                  </div>
                )}
              </div>
            </>
          ) : step === "review" ? (
            <>
          <div className="grid grid-cols-2 gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.04)] sm:grid-cols-3">
            <div className="rounded-[1rem] bg-slate-50 p-3 text-center">
              <p className="text-xs font-bold text-slate-500">ร้านค้าที่เลือกส่ง</p>
              <p className="mt-1 text-xl font-black text-[#003366]">{storesWithQty.length}</p>
            </div>
            <div className="rounded-[1rem] bg-slate-50 p-3 text-center">
              <p className="text-xs font-bold text-slate-500">รวมยอดส่งรอบนี้</p>
              <p className="mt-1 text-xl font-black text-slate-900">{formatMoney(totalSelectedAmount)}</p>
            </div>
            <div className="rounded-[1rem] bg-slate-50 p-3 text-center">
              <p className="text-xs font-bold text-slate-500">รายการยังไม่ตั้งราคา</p>
              <p className="mt-1 text-xl font-black text-amber-700">{unpricedActiveRows.length}</p>
            </div>
          </div>

          <div className="sticky top-[7.5rem] z-10 hidden overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-sm sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse table-fixed text-sm">
                <colgroup>
                  <col style={{ width: 40 }} />
                  <col style={{ width: 112 }} />
                  <col />
                  <col style={{ width: 64 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 112 }} />
                  <col style={{ width: 112 }} />
                  <col style={{ width: 64 }} />
                </colgroup>
                <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-[0.09em]">
                  <tr className="border-b border-slate-200">
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">#</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-left text-slate-600 whitespace-nowrap">รหัสสินค้า</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">สินค้า</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">หน่วย</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">ออเดอร์</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">ราคา/หน่วย</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">ยอดเงิน</th>
                    <th className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">จัดการ</th>
                  </tr>
                </thead>
              </table>
            </div>
          </div>

	          <div className="space-y-0">
		          {reviewGroups.map((group) => {
              const { reviewRows, groupTotal } = group;
	            return (
		              <section
		                key={group.customerId}
		                className="overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-sm [contain-intrinsic-size:700px] [content-visibility:auto] sm:rounded-none sm:border-x-0 sm:border-b-0 sm:border-t-0 sm:shadow-none"
		              >
	                <div className="bg-[#0f2f56] px-4 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-base font-bold text-white">
                          <Building2 className="h-4 w-4 shrink-0 text-white/85" strokeWidth={2.1} />
                          <span>{group.customerName}</span>
                        </span>
                        <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />
                        <span className="font-mono text-sm font-bold text-white/80">{group.customerCode}</span>
                        {formatOrderNumbers(group.orderNumbers) ? (
                          <>
                            <span className="h-3.5 w-px bg-white/20" aria-hidden="true" />
                            <span className="font-mono text-sm font-bold text-white">{formatOrderNumbers(group.orderNumbers)}</span>
                          </>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white">
                          <Package2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                          {reviewRows.length} รายการ
                        </span>
                      </div>
                    </div>
	                </div>

		                <div className="divide-y divide-slate-300 sm:hidden">
                    {reviewRows.map((row) => {
                      const isEditing = editingRowKey === row.rowKey;
                      const defaults = {
                        quantity: formatNum(row.item.totalOrdered, 3).replace(/,/g, ""),
                        unitPrice: row.item.unitPrice.toFixed(2),
                      };

                      return (
	                        <div key={`${group.customerId}-${row.item.groupKey}-mobile`} className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                              {row.item.imageUrl ? (
                                <Image
                                  src={row.item.imageUrl}
                                  alt={row.item.productName}
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold leading-snug text-slate-900">{row.item.productName}</p>
                              <p className="font-mono text-xs text-slate-400">{row.item.productSku}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingRowKey(isEditing ? null : row.rowKey)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#003366]"
                            >
                              <PencilLine className="h-3.5 w-3.5" strokeWidth={2.2} />
                              {isEditing ? "เสร็จ" : "แก้ไข"}
                            </button>
                          </div>

                          <div className="mt-2 grid grid-cols-3 gap-3 border-t border-slate-200 pt-2.5 text-sm">
                            <div>
                              <p className="text-xs font-bold text-slate-500">หน่วย</p>
                              <p className="mt-1 font-bold text-slate-950">{row.item.saleUnitLabel}</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-500">ออเดอร์</p>
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  max={row.item.totalOrdered}
                                  step="any"
                                  value={row.quantityInput}
                                  onChange={(event) =>
                                    updateReviewValue(row.rowKey, "quantity", event.target.value, defaults)
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-center font-bold text-slate-950 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                                />
                              ) : (
                                <p className="mt-1 font-black text-slate-950">{formatNum(row.quantity)}</p>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-500">ราคา/หน่วย</p>
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={row.unitPriceInput}
                                  onChange={(event) =>
                                    updateReviewValue(row.rowKey, "unitPrice", event.target.value, defaults)
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-right font-bold text-slate-950 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                                />
                              ) : (
                                <p className="mt-1 font-black text-slate-950">{formatMoney(row.unitPrice)}</p>
                              )}
                            </div>
                          </div>

                          <div className="mt-1.5 flex items-center justify-between text-xs">
                            <span className="text-slate-400">
                              {formatNum(row.quantity)} {row.item.saleUnitLabel} · {formatMoney(row.unitPrice)} บาท
                            </span>
                            <span className="font-bold text-slate-900">{formatMoney(row.lineTotal)} บาท</span>
                          </div>
                        </div>
                      );
                    })}
		                  <div className="flex items-center justify-between border-t border-slate-300 bg-slate-50 px-4 py-2.5">
	                    <span className="text-xs font-semibold text-slate-500">ยอดรวม — {group.customerName}</span>
	                    <span className="font-bold text-slate-900">{formatMoney(groupTotal)} บาท</span>
	                  </div>
	                </div>

	                <div className="hidden overflow-x-auto sm:block">
	                  <table className="w-full min-w-[860px] border-collapse table-fixed text-sm">
                      <colgroup>
                        <col style={{ width: 40 }} />
                        <col style={{ width: 112 }} />
                        <col />
                        <col style={{ width: 64 }} />
                        <col style={{ width: 80 }} />
                        <col style={{ width: 112 }} />
                        <col style={{ width: 112 }} />
                        <col style={{ width: 64 }} />
                      </colgroup>
	                    <tbody>
	                      {reviewRows.map((row, idx) => {
                          const isEditing = editingRowKey === row.rowKey;
                          const defaults = {
                            quantity: formatNum(row.item.totalOrdered, 3).replace(/,/g, ""),
                            unitPrice: row.item.unitPrice.toFixed(2),
                          };
	                        return (
	                          <tr key={`${group.customerId}-${row.item.groupKey}`} className="border-t border-slate-200 text-sm transition hover:bg-slate-50/40">
	                            <td className="border-r border-slate-200 px-3 py-2 text-center text-xs text-slate-400 tabular-nums">{idx + 1}</td>
	                            <td className="border-r border-slate-200 px-3 py-2 text-center">
                                  <p className="font-mono text-xs text-slate-500">{row.item.productSku}</p>
                                </td>
	                            <td className="border-r border-slate-200 px-3 py-2 text-left font-semibold text-slate-800">
                                  <div className="flex items-center gap-2.5">
                                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                      {row.item.imageUrl ? (
                                        <Image
                                          src={row.item.imageUrl}
                                          alt={row.item.productName}
                                          fill
                                          sizes="36px"
                                          className="object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                          <Package2 className="h-4 w-4 text-slate-300" strokeWidth={1.8} />
                                        </div>
                                      )}
                                    </div>
                                    <span>{row.item.productName}</span>
                                  </div>
                                </td>
	                            <td className="border-r border-slate-200 px-3 py-2 text-center text-slate-600">{row.item.saleUnitLabel}</td>
	                            <td className="border-r border-slate-200 px-3 py-2 text-center tabular-nums font-semibold text-slate-600">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      min="0"
                                      max={row.item.totalOrdered}
                                      step="any"
                                      value={row.quantityInput}
                                      onChange={(event) =>
                                        updateReviewValue(row.rowKey, "quantity", event.target.value, defaults)
                                      }
                                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm font-semibold text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                                    />
                                  ) : (
                                    <span>{formatNum(row.quantity)}</span>
                                  )}
                                </td>
	                            <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums text-slate-600 whitespace-nowrap">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={row.unitPriceInput}
                                      onChange={(event) =>
                                        updateReviewValue(row.rowKey, "unitPrice", event.target.value, defaults)
                                      }
                                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm font-semibold text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                                    />
                                  ) : (
                                    <span>{formatMoney(row.unitPrice)} บาท</span>
                                  )}
                                </td>
	                            <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">{formatMoney(row.lineTotal)} บาท</td>
	                            <td className="px-3 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setEditingRowKey(isEditing ? null : row.rowKey)}
                                    className="font-semibold text-[#003366] underline decoration-[#003366]/35 underline-offset-4"
                                  >
                                    {isEditing ? "เสร็จ" : "แก้ไข"}
                                  </button>
                                </td>
	                          </tr>
	                        );
	                      })}
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td colSpan={6} className="border-r border-slate-200 px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                            ยอดรวม — {group.customerName}
                          </td>
                          <td className="border-r border-slate-200 px-3 py-2 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                            {formatMoney(groupTotal)} บาท
                          </td>
                          <td className="px-3 py-2" />
                        </tr>
	                    </tbody>
	                  </table>
	                </div>
	              </section>
	            );
	          })}
          </div>

          {submitError && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {submitError}
            </div>
          )}

          {errorRows.length > 0 && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorRows.map((row) => (
                <p key={row.customerId}>
                  {row.customerName}: {row.state.message}
                </p>
              ))}
            </div>
          )}

          {successRows.length > 0 && (
            <div className="space-y-2 rounded-xl bg-emerald-50 px-4 py-3">
              {successRows.map((row) => (
                <div key={row.customerId} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                    {row.customerName} · {row.state.deliveryNumber}
                  </div>
                  {row.state.deliveryId && (
                    <a
                      href={`/orders/delivery-notes/${row.state.deliveryId}`}
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
            </>
          ) : (
            <>
              {errorRows.length > 0 && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorRows.map((row) => (
                    <p key={row.customerId}>
                      {row.customerName}: {row.state.message}
                    </p>
                  ))}
                </div>
              )}

              <div className="rounded-[1.5rem] border border-emerald-200 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(5,150,105,0.06)]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-700" strokeWidth={2.4} />
                  <div>
                    <p className="font-bold text-emerald-900">สร้างใบส่งของเรียบร้อย</p>
                    <p className="mt-1 text-sm text-emerald-800">
                      เลือกร้านค้าที่ต้องการพิมพ์ แล้วกดพิมพ์เฉพาะรายการที่เลือก
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {printRows.map((row) => {
                  const checked = printSelectedIds.has(row.customerId);
                  return (
                    <label
                      key={row.customerId}
                      className={[
                        "flex cursor-pointer items-center gap-3 rounded-[1.35rem] border px-4 py-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition",
                        checked
                          ? "border-emerald-500 bg-emerald-50 shadow-[0_10px_28px_rgba(5,150,105,0.10)]"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePrintStore(row.customerId)}
                        className="h-5 w-5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold leading-snug text-slate-950">
                          {row.customerName}
                        </span>
                        <span className="mt-0.5 block text-xs font-semibold text-emerald-700">
                          {row.state.deliveryNumber}
                        </span>
                      </span>
                      {checked && (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white">
                          <Check className="h-4 w-4" strokeWidth={2.4} />
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-200/80 bg-white/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {step === "select" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loadingGroups}
                className="w-full rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleReviewSelectedStores}
                disabled={selectedStores.length === 0 || loadingGroups}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] px-5 py-3 text-base font-bold text-white shadow-[0_14px_30px_rgba(0,51,102,0.16)] transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:py-2.5 sm:text-sm"
              >
                {loadingGroups ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                    กำลังเตรียมรายการ...
                  </>
                ) : (
                  <>
                    <Layers3 className="h-4 w-4" strokeWidth={2.2} />
                    ถัดไป: ตรวจสอบ {selectedStores.length} ร้าน
                  </>
                )}
              </button>
            </>
          ) : step === "review" ? (
            <>
              <button
                type="button"
                onClick={() => setStep("select")}
                disabled={isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
                กลับไปเลือกร้าน
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!hasAnyQty || isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] px-5 py-3 text-base font-bold text-white shadow-[0_14px_30px_rgba(0,51,102,0.16)] transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:py-2.5 sm:text-sm"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                    กำลังสร้าง...
                  </>
                ) : (
                  <>
                    <Layers3 className="h-4 w-4" strokeWidth={2.2} />
                    สร้างใบส่งของ {storesWithQty.length} ร้าน
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isPrintingSelected}
                className="w-full rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handlePrintSelected}
                disabled={printSelectedIds.size === 0 || isPrintingSelected}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-base font-bold text-white shadow-[0_14px_30px_rgba(5,150,105,0.16)] transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:py-2.5 sm:text-sm"
              >
                {isPrintingSelected ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                    กำลังพิมพ์...
                  </>
                ) : (
                  <>
                    <Truck className="h-4 w-4" strokeWidth={2.2} />
                    พิมพ์ {printSelectedIds.size} ร้าน
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AllStoresDeliveryButton({
  date,
  stores,
}: {
  date: string;
  stores: StoreSummaryForBatch[];
}) {
  const [open, setOpen] = useState(false);

  if (stores.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-[#003366] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#002244] disabled:opacity-60"
      >
        <Layers3 className="h-4 w-4" strokeWidth={2.2} />
        สร้างใบส่งของ
      </button>
      {open && (
        <AllStoresDeliveryModal date={date} stores={stores} onClose={() => setOpen(false)} />
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
        className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#003366] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#002244] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
        )}
        สร้างใบส่งของ
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
            <p className="text-sm text-slate-500">ไม่มีออเดอร์ที่พร้อมสร้างใบส่งของ</p>
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
          สร้างใบส่งของ
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
            ค้างส่ง {orders.length} ออเดอร์
          </span>
          <span className="text-xs font-semibold text-amber-700">
            ยอดค้างส่ง {formatMoney(totalOutstandingAmount)} บาท
          </span>
          <span className="text-xs text-amber-700/80">
            ของวันที่ {outstandingDateLabel}
          </span>
          <span className="ml-auto text-xs text-amber-600">
            ออเดอร์จากวันก่อนหน้าที่ยังไม่ได้จัดส่ง
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
                      ส่งบางส่วน
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
                    {formatMoney(order.totalAmount)} บาท
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveOrderId(order.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#003366] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#002244]"
                  >
                    <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
                    <span className="hidden xs:inline">สร้างใบส่งของ</span>
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
                      title={`${item.productSku} · สั่ง ${formatNum(item.orderedQty)} ${item.saleUnitLabel} · ส่งแล้ว ${formatNum(item.deliveredQty)} ${item.saleUnitLabel}`}
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
