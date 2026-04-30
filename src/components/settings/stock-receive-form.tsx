"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CirclePlus,
  Minus,
  Package2,
  Plus,
  Save,
  Search,
  Truck,
  X,
} from "lucide-react";
import {
  startTransition,
  useActionState,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { receiveStockAction } from "@/app/settings/stock/actions";
import type { ReceiveStockActionState } from "@/app/settings/stock/actions";
import { SettingsPanel, SettingsPanelBody, SettingsPanelHeader, settingsFieldLabelClass, settingsInputClass } from "@/components/settings/settings-ui";
import { StockProductSelect } from "@/components/settings/stock-product-select";
import type { StockProductOption } from "@/lib/stock/admin";

type StockReceiveFormProps = {
  products: StockProductOption[];
  returnHref: string;
  defaultProductId?: string;
};

type MobileStep = "product" | "quantity" | "review";

const initialReceiveStockState: ReceiveStockActionState = {
  fieldErrors: {},
  message: "",
  status: "idle",
};

const MAX_MOBILE_PRODUCTS = 50;

function toLocalDatetimeValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(), "-",
    pad(date.getMonth() + 1), "-",
    pad(date.getDate()), "T",
    pad(date.getHours()), ":",
    pad(date.getMinutes()),
  ].join("");
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(value: number, unit: string) {
  return `${value.toLocaleString("th-TH", { maximumFractionDigits: 3 })} ${unit}`;
}

function parseQty(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ProductThumb({ product, sizeClass = "h-16 w-16" }: { product: StockProductOption; sizeClass?: string }) {
  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ${sizeClass}`}>
      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          sizes="96px"
          className="object-contain p-1.5"
        />
      ) : (
        <Package2 className="h-7 w-7 text-slate-400" strokeWidth={2.2} />
      )}
    </div>
  );
}

export function StockReceiveForm({ products, returnHref, defaultProductId = "" }: StockReceiveFormProps) {
  const router = useRouter();
  const [actionState, formAction, isPending] = useActionState(receiveStockAction, initialReceiveStockState);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(defaultProductId);
  const [unitQtys, setUnitQtys] = useState<Record<string, string>>({});
  const [mobileStep, setMobileStep] = useState<MobileStep>(defaultProductId ? "quantity" : "product");
  const [mobileQuery, setMobileQuery] = useState("");
  const [notes, setNotes] = useState("");
  const hasSubmittedRef = useRef(false);
  const [receivedAtDefault] = useState(() => toLocalDatetimeValue());
  const deferredMobileQuery = useDeferredValue(mobileQuery);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const filteredMobileProducts = useMemo(() => {
    const normalizedQuery = deferredMobileQuery.trim().toLocaleLowerCase("th");

    if (!normalizedQuery) return products.slice(0, MAX_MOBILE_PRODUCTS);

    return products
      .filter((product) => `${product.sku} ${product.name}`.toLocaleLowerCase("th").includes(normalizedQuery))
      .slice(0, MAX_MOBILE_PRODUCTS);
  }, [deferredMobileQuery, products]);

  const handleSuccess = useEffectEvent(() => {
    startTransition(() => {
      router.replace(returnHref);
      router.refresh();
    });
  });

  useEffect(() => {
    if (actionState.status === "success") handleSuccess();
  }, [actionState.status]);

  function closeModal() {
    router.replace(returnHref);
  }

  function handleProductChange(productId: string) {
    setSelectedProductId(productId);
    setUnitQtys({});
    setMobileStep(productId ? "quantity" : "product");
  }

  function handleQtyChange(unitId: string, value: string) {
    setUnitQtys((prev) => ({ ...prev, [unitId]: value }));
  }

  function adjustQty(unitId: string, delta: number) {
    setUnitQtys((prev) => {
      const current = parseQty(prev[unitId] ?? "");
      const nextValue = Math.max(0, current + delta);
      return { ...prev, [unitId]: nextValue > 0 ? String(nextValue) : "" };
    });
  }

  const baseUnitLabel = selectedProduct?.saleUnits.find((unit) => unit.isDefault)?.label ?? selectedProduct?.unit ?? "";

  const totals = useMemo(() => {
    if (!selectedProduct || selectedProduct.saleUnits.length === 0) {
      return { avgCostPerBase: 0, totalBaseQty: 0, totalCost: 0 };
    }

    let totalBaseQty = 0;
    let totalCost = 0;

    for (const unit of selectedProduct.saleUnits) {
      const qty = parseQty(unitQtys[unit.id] ?? "");
      if (qty <= 0) continue;
      totalBaseQty += qty * unit.baseUnitQuantity;
      totalCost += qty * unit.effectiveCostPrice;
    }

    return {
      avgCostPerBase: totalBaseQty > 0 ? totalCost / totalBaseQty : 0,
      totalBaseQty,
      totalCost,
    };
  }, [selectedProduct, unitQtys]);

  const availableQuantity = selectedProduct
    ? selectedProduct.onHandQuantity - selectedProduct.reservedQuantity
    : null;
  const stockAfterReceive = selectedProduct ? selectedProduct.onHandQuantity + totals.totalBaseQty : 0;
  const showFeedback = hasSubmitted && actionState.status !== "idle";
  const showFieldErrors = hasSubmitted && actionState.status === "error";
  const canSubmit = !isPending && !!selectedProductId && totals.totalBaseQty > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 md:items-center md:p-4">
      <div className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.6rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] md:rounded-[1.75rem]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 md:px-6 md:py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              รับสินค้าเข้า
            </p>
            <div className="mt-1 flex items-center gap-2 text-slate-950">
              <CirclePlus className="h-5 w-5 text-[#003366] md:h-6 md:w-6" strokeWidth={2.2} />
              <h3 className="text-xl font-semibold tracking-[-0.02em] md:text-2xl">
                บันทึกรับสินค้า
              </h3>
            </div>
            <p className="mt-1 hidden text-sm leading-6 text-slate-500 md:block">
              เลือกสินค้า กรอกจำนวนที่รับเข้า แล้วระบบจะคำนวณยอดรวมให้อัตโนมัติ
            </p>
          </div>

          <button
            type="button"
            onClick={closeModal}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <form
          id="receive-stock"
          action={formAction}
          onSubmit={() => {
            if (!hasSubmittedRef.current) {
              hasSubmittedRef.current = true;
              setHasSubmitted(true);
            }
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <input type="hidden" name="productId" value={selectedProductId} />
          <input type="hidden" name="totalQuantity" value={totals.totalBaseQty} />
          <input type="hidden" name="baseUnit" value={selectedProduct?.unit ?? ""} />
          <input type="hidden" name="avgUnitCost" value={totals.avgCostPerBase} />
          <input type="hidden" name="receivedAt" value={receivedAtDefault} />
          <input type="hidden" name="supplierName" value="โรงงานหลัก" />
          <input type="hidden" name="notes" value={notes} />

          {showFeedback ? (
            <div className="shrink-0 px-5 pt-4 md:px-6 md:pt-6">
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  actionState.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {actionState.message}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
            <div className="md:hidden">
              <div className="mb-4 grid grid-cols-3 rounded-2xl bg-slate-100 p-1 text-center text-xs font-bold text-slate-500">
                {[
                  ["product", "สินค้า"],
                  ["quantity", "จำนวน"],
                  ["review", "ตรวจสอบ"],
                ].map(([step, label]) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => {
                      if (step === "product") setMobileStep("product");
                      if (step === "quantity" && selectedProduct) setMobileStep("quantity");
                      if (step === "review" && canSubmit) setMobileStep("review");
                    }}
                    className={`rounded-xl px-2 py-2 transition ${
                      mobileStep === step ? "bg-white text-[#003366] shadow-sm" : "text-slate-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mobileStep === "product" ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" strokeWidth={2.2} />
                    <input
                      value={mobileQuery}
                      onChange={(event) => setMobileQuery(event.target.value)}
                      className="h-13 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-base font-medium text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#003366] focus:ring-4 focus:ring-[#003366]/10"
                      placeholder="ค้นหาสินค้า"
                    />
                  </div>

                  <div className="space-y-2">
                    {filteredMobileProducts.length > 0 ? (
                      filteredMobileProducts.map((product) => {
                        const productAvailableQuantity = product.onHandQuantity - product.reservedQuantity;
                        const isSelected = product.id === selectedProductId;

                        return (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => handleProductChange(product.id)}
                            className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                              isSelected
                                ? "border-[#003366] bg-blue-50"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <ProductThumb product={product} sizeClass="h-20 w-20" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-base font-bold leading-6 text-slate-950">
                                {product.name}
                              </span>
                              <span className="mt-1 block text-sm font-semibold text-[#003366]">{product.sku}</span>
                              <span className="mt-1 block text-sm text-slate-500">
                                พร้อมขาย {formatQty(productAvailableQuantity, product.unit)}
                              </span>
                            </span>
                            {isSelected ? <CheckCircle2 className="h-6 w-6 shrink-0 text-[#003366]" strokeWidth={2.2} /> : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        ไม่พบสินค้าที่ค้นหา
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {mobileStep === "quantity" && selectedProduct ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <ProductThumb product={selectedProduct} sizeClass="h-20 w-20" />
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold leading-6 text-slate-950">{selectedProduct.name}</p>
                      <p className="mt-1 text-sm font-semibold text-[#003366]">{selectedProduct.sku}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        คงเหลือ {formatQty(selectedProduct.onHandQuantity, selectedProduct.unit)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedProduct.saleUnits.map((unit) => {
                      const qty = parseQty(unitQtys[unit.id] ?? "");
                      const baseQty = qty * unit.baseUnitQuantity;

                      return (
                        <div key={unit.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-lg font-bold text-slate-950">{unit.label}</p>
                                {unit.isDefault ? (
                                  <span className="rounded-full bg-[#003366] px-2.5 py-1 text-xs font-bold text-white">
                                    หลัก
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-sm text-slate-500">
                                {formatMoney(unit.effectiveCostPrice)} บาท / {unit.label}
                              </p>
                            </div>
                            <p className="text-right text-sm font-semibold text-slate-500">
                              = {baseQty > 0 ? formatQty(baseQty, selectedProduct.unit) : `0 ${selectedProduct.unit}`}
                            </p>
                          </div>

                          <div className="mt-4 grid grid-cols-[3.25rem_1fr_3.25rem] items-center gap-3">
                            <button
                              type="button"
                              onClick={() => adjustQty(unit.id, -1)}
                              className="inline-flex h-13 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700"
                              aria-label={`ลดจำนวน ${unit.label}`}
                            >
                              <Minus className="h-5 w-5" strokeWidth={2.3} />
                            </button>
                            <input
                              id={`mobile-unit-qty-${unit.id}`}
                              type="number"
                              min="0"
                              step="0.001"
                              inputMode="decimal"
                              value={unitQtys[unit.id] ?? ""}
                              onChange={(event) => handleQtyChange(unit.id, event.target.value)}
                              className="h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-center text-xl font-bold tabular-nums text-slate-950 outline-none transition focus:border-[#003366] focus:bg-white focus:ring-4 focus:ring-[#003366]/10"
                              placeholder="0"
                            />
                            <button
                              type="button"
                              onClick={() => adjustQty(unit.id, 1)}
                              className="inline-flex h-13 items-center justify-center rounded-2xl bg-[#003366] text-white shadow-[0_10px_24px_rgba(0,51,102,0.18)]"
                              aria-label={`เพิ่มจำนวน ${unit.label}`}
                            >
                              <Plus className="h-5 w-5" strokeWidth={2.3} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {showFieldErrors && actionState.fieldErrors.totalQuantity ? (
                    <p className="text-sm text-red-600">{actionState.fieldErrors.totalQuantity}</p>
                  ) : null}

                  <div>
                    <label className={settingsFieldLabelClass} htmlFor="mobile-receive-notes">
                      หมายเหตุ
                    </label>
                    <textarea
                      id="mobile-receive-notes"
                      rows={2}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className={`${settingsInputClass} min-h-20 resize-none`}
                      placeholder="ถ้ามีหมายเหตุเพิ่มเติม"
                    />
                  </div>
                </div>
              ) : null}

              {mobileStep === "review" && selectedProduct ? (
                <div className="space-y-4">
                  <div className="rounded-[1.25rem] border border-[#003366]/15 bg-blue-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#003366]">
                      สรุปรับเข้า
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <ProductThumb product={selectedProduct} sizeClass="h-18 w-18" />
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold leading-6 text-slate-950">{selectedProduct.name}</p>
                        <p className="mt-1 text-sm font-semibold text-[#003366]">{selectedProduct.sku}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-bold text-slate-500">รับเข้า</p>
                      <p className="mt-1 text-xl font-bold text-slate-950">{formatQty(totals.totalBaseQty, baseUnitLabel)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-bold text-slate-500">หลังบันทึก</p>
                      <p className="mt-1 text-xl font-bold text-[#003366]">{formatQty(stockAfterReceive, selectedProduct.unit)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-bold text-slate-500">ต้นทุนรวม</p>
                      <p className="mt-1 text-xl font-bold text-slate-950">{formatMoney(totals.totalCost)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-bold text-slate-500">เฉลี่ย / {baseUnitLabel}</p>
                      <p className="mt-1 text-xl font-bold text-slate-950">{formatMoney(totals.avgCostPerBase)}</p>
                    </div>
                  </div>

                  {notes.trim() ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-bold text-slate-500">หมายเหตุ</p>
                      <p className="mt-1 text-sm leading-6 text-slate-700">{notes}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="hidden space-y-6 md:block">
              <SettingsPanel>
                <SettingsPanelHeader
                  icon="inventory"
                  title="เลือกรายการสินค้า"
                  description="ค้นหาจากรหัสหรือชื่อสินค้าเพื่อรับเข้าสต็อค"
                />
                <SettingsPanelBody className="space-y-5">
                  <div>
                    <label className={settingsFieldLabelClass} htmlFor="receive-product">
                      สินค้า
                    </label>
                    <StockProductSelect
                      id="receive-product"
                      products={products}
                      value={selectedProductId}
                      onChange={handleProductChange}
                    />
                    {showFieldErrors && actionState.fieldErrors.productId ? (
                      <p className="mt-2 text-sm text-red-600">{actionState.fieldErrors.productId}</p>
                    ) : null}
                  </div>

                  {selectedProduct ? (
                    <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">คงเหลือ</p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">
                          {formatQty(selectedProduct.onHandQuantity, selectedProduct.unit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">จองแล้ว</p>
                        <p className="mt-1 text-lg font-semibold text-slate-950">
                          {formatQty(selectedProduct.reservedQuantity, selectedProduct.unit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">พร้อมขาย</p>
                        <p className="mt-1 text-lg font-semibold text-[#003366]">
                          {availableQuantity !== null ? formatQty(availableQuantity, selectedProduct.unit) : "-"}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </SettingsPanelBody>
              </SettingsPanel>

              {selectedProduct ? (
                <SettingsPanel>
                  <SettingsPanelHeader
                    icon="inventory"
                    title="จำนวนรับเข้าตามหน่วย"
                    description="กรอกจำนวนเฉพาะหน่วยที่รับมา ระบบจะรวมเป็นหน่วยหลักให้อัตโนมัติ"
                  />
                  <SettingsPanelBody className="space-y-3">
                    {selectedProduct.saleUnits.map((unit) => {
                      const qty = parseQty(unitQtys[unit.id] ?? "");
                      const baseQty = qty * unit.baseUnitQuantity;
                      const hasQty = qty > 0;

                      return (
                        <div key={unit.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-4">
                          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <div className="mb-1.5 flex items-center gap-2">
                                  <label className={settingsFieldLabelClass} htmlFor={`unit-qty-${unit.id}`}>
                                    จำนวน ({unit.label})
                                  </label>
                                  {unit.isDefault ? (
                                    <span className="rounded-full bg-[#003366] px-2 py-0.5 text-[10px] font-bold leading-none text-white">
                                      หลัก
                                    </span>
                                  ) : null}
                                </div>
                                <input
                                  id={`unit-qty-${unit.id}`}
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  value={unitQtys[unit.id] ?? ""}
                                  onChange={(event) => handleQtyChange(unit.id, event.target.value)}
                                  className={settingsInputClass}
                                  placeholder="0"
                                />
                              </div>

                              <div>
                                <p className={`${settingsFieldLabelClass} mb-1.5`}>
                                  ต้นทุน / {unit.label}
                                </p>
                                <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-base font-bold text-slate-950">
                                  {formatMoney(unit.effectiveCostPrice)} บาท
                                </div>
                                {!unit.isDefault ? (
                                  <p className="mt-1 text-xs text-slate-400">
                                    1 {unit.label} = {unit.baseUnitQuantity} {selectedProduct.unit}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="min-w-[5rem] text-right">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                = {selectedProduct.unit}
                              </p>
                              <p className={`mt-0.5 text-lg font-bold tabular-nums ${hasQty ? "text-slate-950" : "text-slate-300"}`}>
                                {hasQty ? baseQty.toLocaleString("th-TH", { maximumFractionDigits: 3 }) : "-"}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {totals.totalBaseQty > 0 ? (
                      <div className="rounded-2xl border border-[#003366]/25 bg-blue-50 px-5 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#003366]">
                          ยอดรวมที่จะรับเข้า
                        </p>
                        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                          <div>
                            <p className="text-2xl font-bold text-slate-950">
                              {formatQty(totals.totalBaseQty, baseUnitLabel)}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-500">
                              ต้นทุนเฉลี่ย {formatMoney(totals.avgCostPerBase)} บาท / {baseUnitLabel}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                              ต้นทุนรวม
                            </p>
                            <p className="text-xl font-bold text-slate-950">
                              {formatMoney(totals.totalCost)} บาท
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-400">
                        กรอกจำนวนอย่างน้อยหนึ่งหน่วยเพื่อดูยอดรวม
                      </div>
                    )}

                    {showFieldErrors && actionState.fieldErrors.totalQuantity ? (
                      <p className="text-sm text-red-600">{actionState.fieldErrors.totalQuantity}</p>
                    ) : null}

                    <div>
                      <label className={settingsFieldLabelClass} htmlFor="receive-notes">
                        หมายเหตุ
                      </label>
                      <textarea
                        id="receive-notes"
                        rows={3}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        className={`${settingsInputClass} min-h-28 resize-y`}
                        placeholder="เช่น รับเข้าเพิ่มสำหรับรอบส่งวันพรุ่งนี้"
                      />
                    </div>
                  </SettingsPanelBody>
                </SettingsPanel>
              ) : null}

              <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-4 text-sm leading-6 text-sky-800">
                <div className="flex items-start gap-3">
                  <Truck className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.2} />
                  <p>
                    เมื่อบันทึกรับเข้า ระบบจะเพิ่มจำนวนคงเหลือ อัปเดตต้นทุนเฉลี่ย และเก็บประวัติการเคลื่อนไหวสต็อคให้อัตโนมัติ
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:py-4">
            <div className="flex items-center justify-between gap-3 md:hidden">
              {mobileStep === "product" ? (
                <>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={!selectedProduct}
                    onClick={() => setMobileStep("quantity")}
                    className="h-12 flex-1 rounded-xl bg-[#003366] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ถัดไป
                  </button>
                </>
              ) : null}

              {mobileStep === "quantity" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setMobileStep("product")}
                    className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="button"
                    disabled={totals.totalBaseQty <= 0}
                    onClick={() => setMobileStep("review")}
                    className="h-12 flex-1 rounded-xl bg-[#003366] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ตรวจสอบ
                  </button>
                </>
              ) : null}

              {mobileStep === "review" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setMobileStep("quantity")}
                    className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600"
                  >
                    แก้ไข
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#003366] px-5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(0,51,102,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" strokeWidth={2.2} />
                    บันทึก
                  </button>
                </>
              ) : null}
            </div>

            <div className="hidden items-center justify-end gap-3 md:flex">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-xl bg-[#003366] px-5 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(0,51,102,0.22)] transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" strokeWidth={2.2} />
                บันทึกรับเข้า
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
