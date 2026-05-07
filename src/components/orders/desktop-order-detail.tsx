"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Building2,
  ClipboardList,
  Minus,
  Package2,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import type { OrderDetailData } from "@/lib/orders/detail";
import type { OrderProductOption } from "@/lib/orders/manage";
import {
  OrderAddProductPicker,
  type AddedOrderItemDraft,
} from "@/components/orders/order-add-product-picker";
import {
  addOrderItemAction,
  cancelOrderAction,
  removeOrderItemAction,
  updateOrderItemQtyAction,
} from "@/app/orders/incoming/actions";

function formatCurrency(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  date: string;
  detail: OrderDetailData;
  deliveryNumbers?: string[];
  products: OrderProductOption[];
  searchTerm: string;
};

export function DesktopOrderDetail({ detail, date, deliveryNumbers, products, searchTerm }: Props) {
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelPending, startCancelTransition] = useTransition();
  const [savePending, startSaveTransition] = useTransition();
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(detail.items.map((i) => [i.id, i.quantity])),
  );
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [addedItems, setAddedItems] = useState<AddedOrderItemDraft[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  const canEdit = detail.status === "submitted";
  const activeItems = detail.items.filter((i) => !removed.has(i.id));
  const deliveryNumberText = Array.from(new Set(deliveryNumbers ?? [])).join(", ");

  function handleQty(itemId: string, delta: number) {
    setEditError(null);
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(1, (prev[itemId] ?? 1) + delta) }));
  }

  function cancelEdit() {
    setEditMode(false);
    setRemoved(new Set());
    setAddedItems([]);
    setEditError(null);
    setQuantities(Object.fromEntries(detail.items.map((i) => [i.id, i.quantity])));
  }

  function handleCancelOrder() {
    startCancelTransition(async () => {
      const fd = new FormData();
      fd.set("orderId", detail.id);
      await cancelOrderAction(fd);
      const p = new URLSearchParams();
      p.set("date", date);
      if (searchTerm) p.set("q", searchTerm);
      router.push(`/orders/incoming?${p.toString()}`);
    });
  }

  function handleSave() {
    startSaveTransition(async () => {
      for (const itemId of removed) {
        const fd = new FormData();
        fd.set("itemId", itemId);
        const result = await removeOrderItemAction(fd);
        if ("error" in result) {
          setEditError(result.error);
          return;
        }
      }
      for (const item of detail.items.filter((i) => !removed.has(i.id))) {
        const newQty = quantities[item.id] ?? item.quantity;
        if (newQty !== item.quantity) {
          const fd = new FormData();
          fd.set("itemId", item.id);
          fd.set("quantity", String(newQty));
          const result = await updateOrderItemQtyAction(fd);
          if ("error" in result) {
            setEditError(result.error);
            return;
          }
        }
      }
      for (const item of addedItems) {
        const fd = new FormData();
        fd.set("orderId", detail.id);
        fd.set("productId", item.productId);
        fd.set("productSaleUnitId", item.productSaleUnitId ?? "");
        fd.set("quantity", String(item.quantity));
        fd.set("unitPrice", String(item.unitPrice));
        const result = await addOrderItemAction(fd);
        if ("error" in result) {
          setEditError(`${item.productName}: ${result.error}`);
          return;
        }
      }
      setAddedItems([]);
      setEditMode(false);
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
      {editMode ? (
        <div className="border-b border-slate-200 bg-white px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-bold text-[#003366]">{detail.customer.code}</span>
                <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
                <h3 className="text-2xl font-bold text-slate-900">{detail.customer.name}</h3>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4 text-slate-400" strokeWidth={2.2} />
                  เลขออเดอร์: <span className="font-mono font-bold text-slate-700" translate="no">{detail.orderNumber}</span>
                </span>
                {deliveryNumberText ? (
                  <>
                    <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
                    <span>
                      ใบส่งของ: <span className="font-mono font-bold text-slate-700" translate="no">{deliveryNumberText}</span>
                    </span>
                  </>
                ) : null}
                <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
                <span>ช่องทาง: <span className="font-bold text-slate-700">{detail.channelLabel}</span></span>
                <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
                <span>จำนวนรวม: <span className="font-bold text-slate-700">{detail.totalQuantity.toLocaleString("th-TH")} หน่วย</span></span>
                {detail.notes ? (
                  <>
                    <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
                    <span>หมายเหตุ: <span className="font-bold text-slate-700">{detail.notes}</span></span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {confirmCancel && (
        <div className="m-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="font-semibold text-rose-700">
            แน่ใจว่าจะยกเลิกออเดอร์ {detail.orderNumber}?
          </p>
          <p className="mt-1 text-sm text-rose-600">สต็อกที่จองไว้จะถูกคืนทั้งหมด</p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ไม่ใช่
            </button>
            <button
              type="button"
              onClick={handleCancelOrder}
              disabled={cancelPending}
              className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {cancelPending ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
            </button>
          </div>
        </div>
      )}

      {editMode ? (
        <div className="p-5">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            แก้ไขรายการสินค้า
          </p>

          <div className="mb-3">
            <OrderAddProductPicker
              addedItems={addedItems}
              customerId={detail.customer.id}
              onAddMany={(items) => {
                setEditError(null);
                setAddedItems((current) => [...current, ...items]);
              }}
              products={products}
            />
          </div>

          {editError ? (
            <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {editError}
            </div>
          ) : null}

          {addedItems.length > 0 ? (
            <div className="mb-3 grid gap-2 rounded-[1.35rem] border border-emerald-100 bg-emerald-50/60 p-3 lg:grid-cols-2">
              {addedItems.map((item) => (
                <div key={item.key} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm">
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-50">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.productName}
                        fill
                        sizes="44px"
                        className="object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Package2 className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-normal break-words text-sm font-semibold leading-snug text-slate-900">
                      {item.productName}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      {item.quantity.toLocaleString("th-TH")} {item.unitLabel} · {formatCurrency(item.unitPrice)} บาท
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAddedItems((current) => current.filter((draft) => draft.key !== item.key))
                    }
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-50 active:scale-95"
                    aria-label="ลบรายการใหม่"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {activeItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center">
              <p className="text-sm text-slate-400">ไม่มีรายการสินค้า</p>
              <p className="mt-1 text-xs text-slate-400">
                เพิ่มสินค้าใหม่ หรือบันทึกเพื่อยกเลิกออเดอร์โดยอัตโนมัติ
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.productName}
                        fill
                        sizes="44px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Package2 className="h-5 w-5 text-slate-300" strokeWidth={1.8} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{item.productName}</p>
                    <p className="text-xs text-slate-400">
                      {item.unit} · {formatCurrency(item.unitPrice)} บาท/หน่วย
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleQty(item.id, -1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 active:scale-95"
                      aria-label="ลดจำนวน"
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                    <span className="w-10 text-center text-base font-bold text-slate-900 tabular-nums">
                      {quantities[item.id] ?? item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQty(item.id, 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 active:scale-95"
                      aria-label="เพิ่มจำนวน"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditError(null);
                      setRemoved((p) => new Set([...p, item.id]));
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                    aria-label="ลบสินค้าออกจากออเดอร์"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={savePending}
              className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              ยกเลิกการแก้ไข
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={savePending}
              className="flex-1 rounded-2xl bg-[#003366] py-3 text-sm font-semibold text-white transition hover:bg-[#002244] disabled:opacity-50"
            >
              {savePending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 bg-white px-8 py-8">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#003366]/5 text-[#003366]">
                    <Building2 className="h-6 w-6" strokeWidth={2.4} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{detail.customer.name}</h3>
                    <p className="mt-0.5 font-mono text-sm font-bold text-[#003366]/70">{detail.customer.code}</p>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-slate-400" />
                    ออเดอร์: <span className="font-mono text-slate-900" translate="no">{detail.orderNumber}</span>
                  </span>
                  {deliveryNumberText ? (
                    <>
                      <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
                      <span>ใบส่งของ: <span className="font-mono text-slate-900" translate="no">{deliveryNumberText}</span></span>
                    </>
                  ) : null}
                  <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
                  <span>ช่องทาง: <span className="text-slate-900">{detail.channelLabel}</span></span>
                  <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
                  <span>รวม: <span className="text-slate-900">{detail.totalQuantity.toLocaleString("th-TH")} หน่วย</span></span>
                  {detail.notes ? (
                    <>
                      <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
                      <span className="flex-1">หมายเหตุ: <span className="text-slate-900 italic">&ldquo;{detail.notes}&rdquo;</span></span>
                    </>
                  ) : null}
                </div>
              </div>

              {canEdit ? (
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmCancel(false);
                      setEditMode(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] shadow-sm"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                    แก้ไขรายการ
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-5 py-2.5 text-sm font-bold text-rose-600 transition hover:bg-rose-100 active:scale-[0.98]"
                  >
                    <XCircle className="h-4 w-4" strokeWidth={2.2} />
                    ยกเลิกออเดอร์
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {(["รหัสสินค้า", "รายการสินค้า", "จำนวน", "หน่วย", "สต็อก", "ราคา/หน่วย", "รวม"] as const).map(
                  (col) => (
                    <th
                      key={col}
                      className="px-6 py-4 text-center text-xs font-bold uppercase tracking-widest text-slate-500"
                    >
                      {col}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {detail.items.map((item) => (
                <tr key={item.id} className="align-middle transition-colors hover:bg-slate-50/40">
                  <td className="px-6 py-5 text-center">
                    <span className="font-mono text-sm font-bold text-[#003366]/80">{item.sku}</span>
                  </td>

                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 border border-slate-100 shadow-sm">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.productName}
                            fill
                            sizes="56px"
                            className="bg-white object-contain p-1.5"
                          />
                        ) : (
                          <Package2 className="h-6 w-6 text-slate-300" strokeWidth={1.5} />
                        )}
                      </div>
                      <p className="text-base font-bold text-slate-900 leading-tight">{item.productName}</p>
                    </div>
                  </td>

                  <td className="px-6 py-5 text-center">
                    <span className="text-lg font-bold text-slate-950 tabular-nums">
                      {item.quantity.toLocaleString("th-TH")}
                    </span>
                  </td>

                  <td className="px-6 py-5 text-center text-sm font-bold text-slate-500 uppercase tracking-wide">
                    {item.unit}
                  </td>

                  <td className="px-6 py-5 text-center">
                    <span className="text-sm font-bold tabular-nums text-slate-600">
                      {item.stockQuantity.toLocaleString("th-TH")}
                    </span>
                  </td>

                  <td className="px-6 py-5 text-center tabular-nums text-sm font-bold text-slate-600">
                    {formatCurrency(item.unitPrice)}
                  </td>

                  <td className="px-6 py-5 text-center">
                    <p className="font-mono text-base font-bold tabular-nums text-[#003366]">
                      {formatCurrency(item.lineTotal)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="bg-slate-50/50 border-t border-slate-200">
                <td
                  colSpan={6}
                  className="px-8 py-6 text-right text-base font-bold text-slate-500 uppercase tracking-widest"
                >
                  ยอดรวมทั้งสิ้น
                </td>
                <td className="px-8 py-6 text-center">
                  <p className="font-mono text-2xl font-bold tabular-nums text-[#003366]">
                    {formatCurrency(detail.items.reduce((s, i) => s + i.lineTotal, 0))} บาท
                  </p>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
