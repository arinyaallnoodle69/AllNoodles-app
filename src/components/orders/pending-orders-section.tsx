"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Loader2, Package2, Printer, Search, Share2, Truck, X } from "lucide-react";
import {
  createDeliveryNoteAction,
  getDeliveryFormDataAction,
  getStoreDeliveryDataAction,
} from "@/app/orders/delivery-actions";
import type { CreateDeliveryState } from "@/app/orders/delivery-actions";
import type { DeliveryFormData, DeliveryItemData, PendingOrder } from "@/lib/delivery/admin";
import { DeliveryPdfPreviewModal } from "@/components/print/delivery-pdf-preview-modal";
import {
  createDeliveryPdfPreviewFromUrl,
  type DeliveryPdfPreview,
} from "@/components/print/share-delivery-pdf";
import type { PriceDisplayMode } from "@/components/print/delivery-note-layout";

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
  return `ค้างส่ง: ${item.productName} ${formatNum(item.remainingQty)} ${item.saleUnitLabel}`;
}



type StoreSummaryForBatch = {
  customerId: string;
  customerName: string;
  customerCode: string;
  orderDate: string;
  orderIds?: string[];
  orderNumbers?: string[];
  deliveryNoteIds?: string[];
  deliveryNumbers?: string[];
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
  if (deliveredQty > 0) {
    return deliveredQty;
  }

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
  const [previousOutstanding, setPreviousOutstanding] = useState("");
  const [installmentPaid, setInstallmentPaid] = useState("");
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
        setPreviousOutstanding(data.outstandingBalance?.toString() ?? "0");
        setInstallmentPaid(data.installmentLimit?.toString() ?? "");
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
        `⚠️ รายการต่อไปนี้ยังไม่ได้ตั้งราคา (${unpricedActiveItems.length} รายการ)\n\n${names}\n\nบิลส่งของจะคิดราคาเป็น 0 บาท\nต้องการยืนยันต่อไหม?`
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
    fd.set("previousOutstanding", previousOutstanding);
    fd.set("installmentPaid", installmentPaid);

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
              <Truck className="h-5 w-5 text-[#4A148C]" strokeWidth={2.2} />
              <h2 className="text-lg font-bold text-slate-950">พิมพ์บิลส่งของ</h2>
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
                            "border-slate-200 bg-white text-slate-950 focus:border-[#4A148C] focus:ring-[#4A148C]/10"
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
                        <span>ยังไม่ได้ตั้งราคาสินค้านี้กับลูกค้า บิลส่งของจะคิดเป็น 0 บาท</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Outstanding Balance & Installment inputs */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-500">
                    ยอดค้างชำระเดิม (บาท)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={previousOutstanding}
                    onChange={(e) => setPreviousOutstanding(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 outline-none transition focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-500">
                    ยอดผ่อนชำระวันนี้ (บาท)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={installmentPaid}
                    onChange={(e) => setInstallmentPaid(e.target.value)}
                    placeholder="เว้นว่างเพื่อจ่ายหมด"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-[#4A148C] outline-none transition focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/10"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="pt-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  หมายเหตุ (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น ส่งรอบเช้า"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/10"
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
                  href={`/orders/delivery-notes/${actionState.deliveryId}?autoprint=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
                  พิมพ์บิลส่งของ
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
            className="inline-flex items-center gap-2 rounded-xl bg-[#4A148C] px-5 py-2.5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(142, 36, 170,0.16)] transition hover:bg-[#4A148C] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                กำลังสร้าง...
              </>
            ) : (
              <>
                <Truck className="h-4 w-4" strokeWidth={2.2} />
                ยืนยันบิลส่งของ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Store-level delivery modal (combines all order rounds of one store)

export function StoreDeliveryModal({
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
  const [previousOutstanding, setPreviousOutstanding] = useState(() => {
    return orders[0]?.outstandingBalance?.toString() ?? "0";
  });
  const [installmentPaid, setInstallmentPaid] = useState(() => {
    return orders[0]?.installmentLimit?.toString() ?? "";
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(defaultVehicleId);
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<CreateDeliveryState[]>([]);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<DeliveryPdfPreview | null>(null);

  const hasAnyQty = groupedItems.some((g) => parseFloat(qtys[g.groupKey] ?? "0") > 0);

  const unpricedActiveGroups = groupedItems.filter(
    (g) => g.unitPrice === 0 && parseFloat(qtys[g.groupKey] ?? "0") > 0,
  );

  const anySuccess = results.some((r) => r.status === "success");
  const anyError = results.filter((r) => r.status === "error");
  const isSubmitting = isPending || isSharingPdf;

  useEffect(() => {
    setPreviewPdf(null);
  }, [notes, qtys, selectedVehicleId]);

  function buildDeliveryItemsPayload() {
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

    return allItemsPayload;
  }

  function buildDeliveryFormData() {
    const fd = new FormData();
    fd.set("orderIds", JSON.stringify(orders.map((o) => o.orderId)));
    fd.set("customerId", orders[0].customerId);
    fd.set("deliveryDate", orders[0].orderDate);
    fd.set("notes", notes);
    fd.set("items", JSON.stringify(buildDeliveryItemsPayload()));
    if (selectedVehicleId) fd.set("vehicleId", selectedVehicleId);
    fd.set("previousOutstanding", previousOutstanding);
    fd.set("installmentPaid", installmentPaid);
    return fd;
  }

  async function handleSubmit() {
    if (!hasAnyQty || isSubmitting) return;

    if (!selectedVehicleId) {
      window.alert(
        "⚠️ ยังไม่ได้เลือกรถจัดส่ง\n\nกรุณาเลือกรถจัดส่งก่อนยืนยัน\nเลือกได้จากช่อง \"รถจัดส่ง\" ด้านบน"
      );
      return;
    }

    if (unpricedActiveGroups.length > 0) {
      const names = unpricedActiveGroups.map((g) => `  • ${g.productName} (${g.saleUnitLabel})`).join("\n");
      const confirmed = window.confirm(
        `⚠️ รายการต่อไปนี้ยังไม่ได้ตั้งราคา (${unpricedActiveGroups.length} รายการ)\n\n${names}\n\nบิลส่งของจะคิดราคาเป็น 0 บาท\nต้องการยืนยันต่อไหม?`
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const fd = buildDeliveryFormData();
      const result = await createDeliveryNoteAction(null, fd);
      setResults([result]);
        if (result.status === "success") {
          router.refresh();
          setTimeout(onClose, 1400);
        }
    });
  }

  async function handleSharePdf() {
    if (!hasAnyQty || isSubmitting) return;

    if (!selectedVehicleId) {
      window.alert("ยังไม่ได้เลือกรถจัดส่ง\n\nกรุณาเลือกรถจัดส่งก่อนแชร์ PDF");
      return;
    }

    if (unpricedActiveGroups.length > 0) {
      const names = unpricedActiveGroups.map((g) => `  • ${g.productName} (${g.saleUnitLabel})`).join("\n");
      const confirmed = window.confirm(
        `รายการต่อไปนี้ยังไม่ได้ตั้งราคา (${unpricedActiveGroups.length} รายการ)\n\n${names}\n\nบิลส่งของจะคิดราคาเป็น 0 บาท\nต้องการยืนยันต่อไหม?`
      );
      if (!confirmed) return;
    }

    setIsSharingPdf(true);

    try {
      const result = await createDeliveryNoteAction(null, buildDeliveryFormData());
      setResults([result]);

      if (result.status !== "success") return;

      router.refresh();

      const printUrl = result.deliveryId
        ? `/delivery/print?note_ids=${encodeURIComponent(result.deliveryId)}&date=${orders[0].orderDate}`
        : `/delivery/print?date=${orders[0].orderDate}&customer=${orders[0].customerId}`;

      const pdf = await createDeliveryPdfPreviewFromUrl(printUrl, `delivery-note-${orders[0].orderDate}`);
      setPreviewPdf(pdf);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("[delivery/share-pdf]", error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error);
      window.alert("สร้างหรือแชร์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSharingPdf(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-[2rem] border border-slate-200/80 bg-slate-50 shadow-[0_28px_70px_rgba(15,23,42,0.20)] sm:max-w-5xl sm:rounded-[2rem]">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EA80FC]/30 text-[#4A148C]">
                <Truck className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div>
                <h2 className="text-lg font-black text-slate-950">พิมพ์บิลส่งของ</h2>
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
              <span className="text-sm font-semibold text-slate-700">รถจัดส่ง:</span>
              {vehicles.length === 0 ? (
                <span className="text-sm text-slate-400">ยังไม่มีข้อมูลรถ</span>
              ) : defaultVehicleId && defaultVehicleName ? (
                <span className="border-b border-[#4A148C] px-1 py-0.5 text-sm font-bold text-[#4A148C]">
                  {defaultVehicleName}
                </span>
              ) : (
                <select
                  value={selectedVehicleId ?? ""}
                  onChange={(e) => setSelectedVehicleId(e.target.value || null)}
                  className={[
                    "border-b border-t-0 border-l-0 border-r-0 rounded-none bg-transparent px-1 py-0.5 text-sm font-semibold outline-none focus:ring-0 transition cursor-pointer",
                    selectedVehicleId
                      ? "border-slate-300 text-slate-800 focus:border-slate-500"
                      : "border-orange-400 text-orange-700 focus:border-orange-500",
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

        {/* Mobile card view (< sm) */}
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
                        "border-slate-200 bg-white text-slate-950 focus:border-[#4A148C] focus:ring-[#4A148C]/10"
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

        {/* Desktop table view (>= sm) */}
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
                            "border-slate-200 bg-white text-slate-950 focus:border-[#4A148C] focus:ring-[#4A148C]/10"
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

          {/* Outstanding Balance & Installment inputs */}
          <div className="grid grid-cols-2 gap-3 mt-4 pt-1">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-500">
                ยอดค้างชำระเดิม (บาท)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={previousOutstanding}
                onChange={(e) => setPreviousOutstanding(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 outline-none transition focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-500">
                ยอดผ่อนชำระวันนี้ (บาท)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={installmentPaid}
                onChange={(e) => setInstallmentPaid(e.target.value)}
                placeholder="เว้นว่างเพื่อจ่ายหมด"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-[#4A148C] outline-none transition focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/10"
              />
            </div>
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
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/10"
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
                        href={`/orders/delivery-notes/${r.deliveryId}?autoprint=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
                        พิมพ์บิลส่งของ
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
            disabled={isSubmitting}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleSharePdf}
              disabled={!hasAnyQty || isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#4A148C]/20 bg-white px-5 py-2.5 text-sm font-semibold text-[#4A148C] shadow-sm transition hover:bg-[#4A148C]/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSharingPdf ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  กำลังสร้าง PDF...
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" strokeWidth={2.2} />
                  ส่งออก PDF
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!hasAnyQty || isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4A148C] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4A148C] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  กำลังสร้าง...
                </>
              ) : (
                <>
                  <Truck className="h-4 w-4" strokeWidth={2.2} />
                  ยืนยันบิลส่งของ
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      {previewPdf ? (
        <DeliveryPdfPreviewModal
          file={previewPdf.file}
          previewImages={previewPdf.previewImages}
          onClose={() => setPreviewPdf(null)}
        />
      ) : null}
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
  const [isSharingSelected, setIsSharingSelected] = useState(false);
  const [previewSelectedPdf, setPreviewSelectedPdf] = useState<DeliveryPdfPreview | null>(null);
  const [priceMode, setPriceMode] = useState<PriceDisplayMode>("all");
  const printFallbackTimerRef = useRef<number | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("th");

  // Extract unique vehicles dynamically from the persisted list used by this modal.
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

  const vehicleTabsContainerRef = useRef<HTMLDivElement>(null);
  const [vehicleUnderlineStyle, setVehicleUnderlineStyle] = useState<React.CSSProperties | null>(null);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    const container = vehicleTabsContainerRef.current;
    if (!container) return;

    const activeBtn = container.querySelector(
      `button[data-active="true"]`
    ) as HTMLButtonElement | null;

    if (activeBtn) {
      const nextLeft = activeBtn.offsetLeft;
      const nextWidth = activeBtn.offsetWidth;

      setShouldAnimate(false);

      setVehicleUnderlineStyle((prev) => {
        if (prev && prev.left === nextLeft && prev.width === nextWidth) {
          return prev;
        }
        return { left: nextLeft, width: nextWidth };
      });
    } else {
      setVehicleUnderlineStyle(null);
    }
  }, [activeTab, uniqueVehicles]);

  const handleTabClick = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setShouldAnimate(true);
    setActiveTab(id);
  };

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

  useEffect(() => {
    setPreviewSelectedPdf(null);
  }, [activeTab, printSelectedIds]);

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
    const printUrl = `/delivery/print?note_ids=${encodeURIComponent(deliveryNoteIds.join(","))}&date=${date}${endDate ? `&endDate=${endDate}` : ""}&autoprint=1&price_mode=${priceMode}&show_amount=${priceMode === "all" ? "1" : priceMode === "total_only" ? "0" : "none"}`;

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

  function getSelectedDeliveryNoteIds() {
    return Array.from(
      new Set(selectedStores.flatMap((store) => store.deliveryNoteIds ?? [])),
    );
  }

  function buildSelectedDeliveryPrintUrl(deliveryNoteIds: string[], autoprint = false) {
    const params = new URLSearchParams();
    params.set("note_ids", deliveryNoteIds.join(","));
    params.set("date", date);
    if (endDate) params.set("endDate", endDate);
    if (autoprint) params.set("autoprint", "1");
    params.set("price_mode", priceMode);
    params.set("show_amount", priceMode === "all" ? "1" : priceMode === "total_only" ? "0" : "none");
    return `/delivery/print?${params.toString()}`;
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

    const deliveryNoteIds = getSelectedDeliveryNoteIds();
    triggerPrintJob(deliveryNoteIds);
  }

  async function handleShareSelected() {
    if (selectedStores.length === 0 || isSharingSelected || isPrintingSelected) return;

    const deliveryNoteIds = getSelectedDeliveryNoteIds();
    if (deliveryNoteIds.length === 0) return;

    setIsSharingSelected(true);

    try {
      const pdf = await createDeliveryPdfPreviewFromUrl(
        buildSelectedDeliveryPrintUrl(deliveryNoteIds),
        `delivery-notes-${date}${endDate ? `-to-${endDate}` : ""}`,
      );
      setPreviewSelectedPdf(pdf);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("[delivery/share-pdf]", error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error);
      window.alert("สร้างหรือแชร์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSharingSelected(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[700] flex items-end justify-center bg-[#4A148C]/45 p-0 backdrop-blur-[3px] sm:items-center sm:p-5">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden border-[#EA80FC]/40 bg-white shadow-[0_28px_80px_rgba(142, 36, 170,0.22)] sm:max-h-[92vh] sm:max-w-6xl sm:border">
        <div className="flex h-1 w-full shrink-0">
          <div className="h-full flex-1 bg-[#4A148C]" />
          <div className="h-full flex-1 bg-[#EA80FC]" />
        </div>
        <div className="border-b border-[#EA80FC]/30 bg-white px-4 py-3 sm:px-6 sm:py-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
            <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border border-[#EA80FC]/45 bg-[#4A148C] text-white sm:h-12 sm:w-12">
                <Printer className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#EA80FC]">
                  ALL NOODLES DELIVERY PRINT
                </p>
                <h2 className="text-lg font-black leading-none text-[#4A148C] sm:whitespace-nowrap sm:text-[2rem]">
                  พิมพ์บิลส่งของ
                </h2>
                <p className="mt-1 text-[11px] font-black leading-tight text-[#4A148C] sm:text-sm">
                  วันที่ {formatDate(date)} · เลือกร้านก่อนพิมพ์
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-full border border-[#EA80FC]/45 bg-white text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#EA80FC]/10 active:scale-95"
              aria-label="ปิด"
            >
              <X className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#EA80FC]/15 pt-3.5 text-[11px] font-black text-[#4A148C] sm:text-xs">
            <div>
              ร้านค้าในแท็บนี้: <strong className="text-[#4A148C] font-black">{currentTabTotalCount}</strong>
            </div>
            <div className="h-3 w-px bg-[#EA80FC]/25 hidden sm:block" />
            <div>
              เลือกพิมพ์ในแท็บนี้: <strong className="text-[#EA80FC] font-black">{currentTabSelectedCount}</strong>
            </div>
            <div className="h-3 w-px bg-[#EA80FC]/25 hidden sm:block" />
            <div>
              รอบ/ยอดรวมกลุ่มนี้: <strong className="text-[#4A148C] font-black">{selectedRounds} รอบ · {formatMoney(selectedTotal)}</strong>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#F7F8FA] px-3 py-3 sm:px-6 sm:py-5">
          <div className="mb-2">
            <div className="flex flex-row items-center gap-2">
              <label className="relative block flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4A148C]" strokeWidth={2.2} />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหาร้านค้า..."
                  className="h-9 w-full border border-[#EA80FC]/30 bg-white pl-8 pr-3 text-xs font-black text-[#4A148C] outline-none transition placeholder:text-[#4A148C]/70 focus:border-[#EA80FC] focus:ring-1 focus:ring-[#EA80FC]/20"
                />
              </label>
              <div className="grid grid-cols-2 gap-1.5 shrink-0 w-44 sm:w-52">
                <button
                  type="button"
                  onClick={selectAllStores}
                  className="h-9 w-full bg-[#4A148C] text-[10px] sm:text-xs font-black text-white transition hover:bg-[#4A148C] active:scale-95"
                >
                  เลือกทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="h-9 w-full border border-[#EA80FC]/45 bg-white text-[10px] sm:text-xs font-black text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#EA80FC]/10 active:scale-95"
                >
                  ล้างที่เลือก
                </button>
              </div>
            </div>
          </div>

          <div className="relative bg-transparent overflow-hidden mt-3 mb-1.5 w-full">
            <div
              ref={vehicleTabsContainerRef}
              className="relative flex gap-6 overflow-x-auto pb-2 pt-0.5 no-scrollbar scroll-smooth"
            >
              {/* Underline indicator */}
              <span
                className="absolute bottom-0 h-[3px] rounded-full bg-[#4A148C]"
                style={{
                  ...(vehicleUnderlineStyle ?? { left: 0, width: 0 }),
                  opacity: vehicleUnderlineStyle ? 1 : 0,
                  transition: shouldAnimate
                    ? "left 300ms cubic-bezier(0.16, 1, 0.3, 1), width 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-in-out"
                    : "none",
                }}
              />

              <button
                type="button"
                data-active={activeTab === "all"}
                onClick={(e) => handleTabClick("all", e)}
                className={`pb-1.5 text-sm font-black transition-all whitespace-nowrap tracking-wide bg-transparent border-0 outline-none ${
                  activeTab === "all"
                    ? "text-[#4A148C] scale-[1.03]"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>ทั้งหมด</span>
                <span className="text-xs opacity-75 ml-1">
                  ({tabStats.all.selected > 0 ? `${tabStats.all.selected}/${tabStats.all.total}` : tabStats.all.total})
                </span>
              </button>

              {uniqueVehicles.map((vehicle) => {
                const stats = tabStats[vehicle.id] || { total: 0, selected: 0 };
                const isActive = activeTab === vehicle.id;
                return (
                  <button
                    key={vehicle.id}
                    type="button"
                    data-active={isActive}
                    onClick={(e) => handleTabClick(vehicle.id, e)}
                    className={`pb-1.5 text-sm font-black transition-all whitespace-nowrap tracking-wide bg-transparent border-0 outline-none ${
                      isActive
                        ? "text-[#4A148C] scale-[1.03]"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <span>{vehicle.name}</span>
                    <span className="text-xs opacity-75 ml-1">
                      ({stats.selected > 0 ? `${stats.selected}/${stats.total}` : stats.total})
                    </span>
                  </button>
                );
              })}

              {hasUnassigned && (
                <button
                  type="button"
                  data-active={activeTab === "unassigned"}
                  onClick={(e) => handleTabClick("unassigned", e)}
                  className={`pb-1.5 text-sm font-black transition-all whitespace-nowrap tracking-wide bg-transparent border-0 outline-none ${
                    activeTab === "unassigned"
                      ? "text-[#4A148C] scale-[1.03]"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span>ยังไม่กำหนดรถ</span>
                  <span className="text-xs opacity-75 ml-1">
                    ({tabStats.unassigned.selected > 0 ? `${tabStats.unassigned.selected}/${tabStats.unassigned.total}` : tabStats.unassigned.total})
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 overflow-hidden border border-[#EA80FC]/30 bg-white">
            <div className="hidden w-full grid-cols-[82px_88px_minmax(120px,1fr)_122px_108px_42px_116px_34px] gap-x-2 border-b border-[#EA80FC]/25 bg-[#4A148C] px-3 py-3 text-xs font-black uppercase tracking-[0.08em] text-white md:grid lg:grid-cols-[96px_104px_minmax(150px,1fr)_136px_124px_48px_132px_38px] lg:gap-x-3 lg:px-4 xl:grid-cols-[104px_112px_minmax(190px,1fr)_148px_136px_56px_144px_44px]">
              <span>วันที่</span>
              <span>รหัสร้านค้า</span>
              <span>ชื่อร้านค้า</span>
              <span>เลขใบจัดส่ง</span>
              <span>รถจัดส่ง</span>
              <span className="text-center">รอบ</span>
              <span className="text-right">ยอดรวม</span>
              <span className="text-center">เลือก</span>
            </div>
            <div className="divide-y divide-[#EA80FC]/20">
              {visibleStores.map((store) => {
                const compositeKey = `${store.customerId}_${store.orderDate}`;
                const checked = printSelectedIds.has(compositeKey);
                return (
                  <label
                    key={compositeKey}
                    className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 transition hover:bg-[#EA80FC]/10 md:grid-cols-[82px_88px_minmax(120px,1fr)_122px_108px_42px_116px_34px] md:items-center md:gap-x-2 md:px-3 lg:grid-cols-[96px_104px_minmax(150px,1fr)_136px_124px_48px_132px_38px] lg:gap-x-3 lg:px-4 xl:grid-cols-[104px_112px_minmax(190px,1fr)_148px_136px_56px_144px_44px]"
                  >
                    <span className="hidden text-sm font-black text-[#4A148C] md:block">
                      {formatDate(store.orderDate)}
                    </span>
                    <span className="hidden min-w-0 pr-3 font-mono text-sm font-black text-[#4A148C] md:block">
                      {store.customerCode}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-black leading-snug text-[#4A148C]">
                        <span className="md:hidden">{store.customerCode} - </span>
                        {store.customerName}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 md:hidden">
                        {store.vehicleName ? (
                          <span className="inline-flex items-center gap-1 border border-[#EA80FC]/30 bg-[#EA80FC]/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-[#4A148C]">
                            <Truck className="h-2.5 w-2.5" strokeWidth={2.5} />
                            {store.vehicleName}
                          </span>
                        ) : null}
                        {endDate ? (
                          <span className="text-[10px] font-black uppercase text-[#4A148C]">
                            วันที่จัดส่ง: {formatDate(store.orderDate)}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs font-black text-[#4A148C] md:hidden">
                        {store.orderRounds} รอบ · {formatMoney(store.totalAmount)} บาท
                      </span>
                    </span>
                    <span className="hidden min-w-0 pr-3 font-mono text-xs font-black text-[#4A148C] md:block lg:text-sm">
                      {store.deliveryNumbers?.length ? store.deliveryNumbers.join(", ") : "-"}
                    </span>
                    <span className="hidden min-w-0 pr-3 text-sm font-black text-[#4A148C] md:block">
                      {store.vehicleName ?? "-"}
                    </span>
                    <span className="hidden text-center text-sm font-black text-[#4A148C] md:block">
                      {store.orderRounds}
                    </span>
                    <span className="hidden text-right text-sm font-black text-[#4A148C] md:block">
                      {formatMoney(store.totalAmount)} บาท
                    </span>
                    <span className="flex items-center justify-end md:justify-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePrintStore(compositeKey)}
                        className="h-5 w-5 rounded border-[#EA80FC]/55 text-[#4A148C] focus:ring-[#EA80FC]"
                      />
                    </span>
                  </label>
                );
              })}
              {visibleStores.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm font-black text-[#4A148C]">
                  ไม่พบร้านค้าที่ตรงกับคำค้นหา
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-t border-[#EA80FC]/30 bg-white px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#4A148C]/70 sm:hidden">
                การแสดงราคา:
              </span>
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 sm:gap-x-4">
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-black text-[#4A148C] sm:text-sm">
                  <input
                    type="radio"
                    name="printPriceMode"
                    value="all"
                    checked={priceMode === "all"}
                    onChange={() => setPriceMode("all")}
                    className="h-4 w-4 border-[#EA80FC]/50 text-[#4A148C] focus:ring-[#4A148C]"
                  />
                  <span>แสดงครบ</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-black text-[#4A148C] sm:text-sm">
                  <input
                    type="radio"
                    name="printPriceMode"
                    value="total_only"
                    checked={priceMode === "total_only"}
                    onChange={() => setPriceMode("total_only")}
                    className="h-4 w-4 border-[#EA80FC]/50 text-[#4A148C] focus:ring-[#4A148C]"
                  />
                  <span>เฉพาะยอดรวม</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-black text-[#4A148C] sm:text-sm">
                  <input
                    type="radio"
                    name="printPriceMode"
                    value="none"
                    checked={priceMode === "none"}
                    onChange={() => setPriceMode("none")}
                    className="h-4 w-4 border-[#EA80FC]/50 text-[#4A148C] focus:ring-[#4A148C]"
                  />
                  <span>ไม่แสดงราคา/ยอดเงิน</span>
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                disabled={isPrintingSelected || isSharingSelected}
                className="hidden border border-[#EA80FC]/45 bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.08em] text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#EA80FC]/10 sm:inline-flex sm:min-w-28 sm:items-center sm:justify-center"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleShareSelected}
                disabled={currentTabSelectedCount === 0 || isPrintingSelected || isSharingSelected}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap border border-[#EA80FC]/55 bg-white px-2 py-3 text-[13px] font-black uppercase tracking-normal text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#EA80FC]/10 disabled:cursor-not-allowed disabled:opacity-40 min-[390px]:px-3 min-[390px]:text-sm sm:min-w-44 sm:gap-2 sm:px-5 sm:text-base sm:tracking-[0.08em]"
              >
                {isSharingSelected ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                    กำลังสร้าง PDF...
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" strokeWidth={2.2} />
                    ส่งออก PDF
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handlePrintSelected}
                disabled={currentTabSelectedCount === 0 || isPrintingSelected || isSharingSelected}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap bg-[#4A148C] px-2 py-3 text-[13px] font-black uppercase tracking-normal text-white transition hover:bg-[#4A148C] disabled:cursor-not-allowed disabled:opacity-40 min-[390px]:px-3 min-[390px]:text-sm sm:min-w-44 sm:gap-2 sm:px-5 sm:text-base sm:tracking-[0.08em]"
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
      {previewSelectedPdf ? (
        <DeliveryPdfPreviewModal
          file={previewSelectedPdf.file}
          previewImages={previewSelectedPdf.previewImages}
          onClose={() => setPreviewSelectedPdf(null)}
        />
      ) : null}
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
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#4A148C]/20 bg-[#4A148C] px-3 py-1.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#4A148C] hover:shadow-lg active:scale-[0.98] disabled:opacity-50 print:hidden md:gap-2 md:px-6 md:py-2.5 md:text-sm"
      >
        <Printer className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" strokeWidth={2.5} />
        พิมพ์บิลส่งของทุกร้านค้า
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <AllStoresDeliveryModal date={date} endDate={endDate} stores={stores} onClose={() => setOpen(false)} />,
            document.body,
          )
        : null}
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
    if (loading) return;
    setLoading(true);
    try {
      const data = await getStoreDeliveryDataAction(customerId, date);
      setOrders(data);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={loading}
        className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#4A148C] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#4A148C] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
        )}
        พิมพ์บิลส่งของ
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
            <p className="text-sm text-slate-500">ไม่มีบิลส่งของสำหรับพิมพ์</p>
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
          className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#4A148C] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#4A148C] active:scale-[0.98]"
        >
          <Truck className="h-3.5 w-3.5" strokeWidth={2.4} />
          พิมพ์บิลส่งของ
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
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#4A148C] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#4A148C]"
                  >
                    <Truck className="h-3.5 w-3.5" strokeWidth={2.2} />
                    <span className="hidden xs:inline">พิมพ์บิลส่งของ</span>
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
