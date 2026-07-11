"use client";

import Image from "next/image";
import { Boxes, Package, PackageSearch, Store, Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type PackingListSummaryProduct = {
  key: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  imageUrl?: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  display_order?: number;
};

export type PackingListSummaryStore = {
  id: string;
  customerId?: string;
  customerCode: string;
  customerName: string;
  date: string;
  dateLabel: string;
  itemCount: number;
  totalQuantity: number;
  vehicleId: string | null;
  vehicleName: string | null;
  items: Array<{
    key: string;
    sku: string;
    name: string;
    unit: string;
    quantity: number;
    display_order?: number;
  }>;
};

type VehicleProductGroup = {
  vehicleKey: string;
  vehicleName: string;
  products: PackingListSummaryProduct[];
};

type VehicleStoreGroup = {
  vehicleKey: string;
  vehicleName: string;
  stores: PackingListSummaryStore[];
};

function formatQty(quantity: number, unit: string) {
  return `${quantity.toLocaleString("th-TH")} ${unit}`;
}

function resolveVehicleName(vehicleName: string | null) {
  return vehicleName?.trim() || "ยังไม่กำหนดรถ";
}

function buildVehicleKey(vehicleId: string | null, vehicleName: string | null) {
  return `${vehicleId ?? "unassigned"}::${resolveVehicleName(vehicleName)}`;
}

function VehicleTabs({
  groups,
  activeKey,
  onSelect,
}: {
  groups: Array<{ vehicleKey: string; vehicleName: string }>;
  activeKey: string | null;
  onSelect: (vehicleKey: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 md:gap-2">
      {groups.map((group) => {
        const active = group.vehicleKey === activeKey;
        return (
          <button
            key={group.vehicleKey}
            type="button"
            onClick={() => onSelect(group.vehicleKey)}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold transition md:gap-2 md:px-3.5 md:py-2 md:text-sm ${
              active ? "bg-[#4A148C] text-white shadow-sm" : "bg-slate-100 text-slate-700"
            }`}
          >
            <Truck className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2.2} />
            {group.vehicleName}
          </button>
        );
      })}
    </div>
  );
}

export function PackingListSummaryButton({
  dateLabel,
  products,
  stores,
}: {
  dateLabel: string;
  products: PackingListSummaryProduct[];
  stores: PackingListSummaryStore[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"products" | "stores">("products");
  const [activeProductVehicleKey, setActiveProductVehicleKey] = useState<string | null>(null);
  const [activeStoreVehicleKey, setActiveStoreVehicleKey] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(stores[0]?.id ?? null);
  const [mobileStoreId, setMobileStoreId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen && !mobileStoreId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, mobileStoreId]);

  const productGroups = useMemo<VehicleProductGroup[]>(() => {
    const map = new Map<string, VehicleProductGroup>();
    for (const product of products) {
      const vehicleKey = buildVehicleKey(product.vehicleId, product.vehicleName);
      const current = map.get(vehicleKey) ?? {
        vehicleKey,
        vehicleName: resolveVehicleName(product.vehicleName),
        products: [],
      };
      current.products.push(product);
      map.set(vehicleKey, current);
    }

    return Array.from(map.values()).map((group) => ({
      ...group,
      products: [...group.products].sort((a, b) => {
        const orderA = a.display_order ?? 0;
        const orderB = b.display_order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name, "th") || a.sku.localeCompare(b.sku, "th");
      }),
    }));
  }, [products]);

  const storeGroups = useMemo<VehicleStoreGroup[]>(() => {
    const map = new Map<string, VehicleStoreGroup>();
    for (const store of stores) {
      const vehicleKey = buildVehicleKey(store.vehicleId, store.vehicleName);
      const current = map.get(vehicleKey) ?? {
        vehicleKey,
        vehicleName: resolveVehicleName(store.vehicleName),
        stores: [],
      };
      current.stores.push(store);
      map.set(vehicleKey, current);
    }

    const storeIndexMap = new Map(stores.map((s, index) => [s.id, index]));

    return Array.from(map.values()).map((group) => ({
      ...group,
      stores: [...group.stores].sort((a, b) => {
        const idxA = storeIndexMap.get(a.id) ?? Infinity;
        const idxB = storeIndexMap.get(b.id) ?? Infinity;
        return idxA - idxB;
      }),
    }));
  }, [stores]);

  const resolvedProductVehicleKey =
    activeProductVehicleKey && productGroups.some((group) => group.vehicleKey === activeProductVehicleKey)
      ? activeProductVehicleKey
      : (productGroups[0]?.vehicleKey ?? null);

  const resolvedStoreVehicleKey =
    activeStoreVehicleKey && storeGroups.some((group) => group.vehicleKey === activeStoreVehicleKey)
      ? activeStoreVehicleKey
      : (storeGroups[0]?.vehicleKey ?? null);

  const activeProductGroup = useMemo(
    () => productGroups.find((group) => group.vehicleKey === resolvedProductVehicleKey) ?? productGroups[0] ?? null,
    [productGroups, resolvedProductVehicleKey],
  );

  const activeStoreGroup = useMemo(
    () => storeGroups.find((group) => group.vehicleKey === resolvedStoreVehicleKey) ?? storeGroups[0] ?? null,
    [resolvedStoreVehicleKey, storeGroups],
  );

  const selectedStore = useMemo(() => {
    return activeStoreGroup?.stores.find((store) => store.id === selectedStoreId) ?? activeStoreGroup?.stores[0] ?? null;
  }, [activeStoreGroup, selectedStoreId]);

  const mobileStore = useMemo(() => {
    return activeStoreGroup?.stores.find((store) => store.id === mobileStoreId) ?? null;
  }, [activeStoreGroup, mobileStoreId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#4A148C]/15 bg-[#F3E5F5] px-3.5 py-1.5 text-[13px] font-bold text-[#4A148C] shadow-sm transition hover:bg-[#EA80FC] active:scale-[0.98] md:gap-2 md:px-6 md:py-2.5 md:text-sm"
      >
        <PackageSearch className="h-4 w-4" strokeWidth={2.4} />
        สรุปสินค้า
      </button>

      {isOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[600] flex items-center justify-center">
          <button
            type="button"
            aria-label="ปิดสรุปสินค้า"
            className="absolute inset-0 bg-[#001D3F]/70 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute inset-0 flex flex-col overflow-hidden bg-slate-50 shadow-2xl md:inset-x-[8%] md:inset-y-[6%] md:rounded-[2.5rem] md:border-2 md:border-[#EA80FC]/35 md:shadow-[0_24px_70px_rgba(142, 36, 170,0.25)] animate-in fade-in zoom-in-95 duration-300">
            <div className="flex h-full flex-col">
              {/* Modern & Compact Header */}
              <div className="relative overflow-hidden border-b border-[#EA80FC]/30 bg-[#4A148C] text-white">
                {/* Top thin gold edge */}
                <div className="h-1 w-full bg-gradient-to-r from-[#EA80FC] via-[#F3E5AB] to-[#EA80FC]" />
                
                {/* Main Header Content - Reduced padding */}
                <div className="px-4 py-3 md:px-6 md:py-4">
                  {/* Mobile Drag Indicator */}
                  <div className="mb-2 flex justify-center md:hidden">
                    <div className="h-1 w-10 rounded-full bg-white/20" />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    {/* Title & Info Group */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded bg-[#EA80FC]/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#F3E5AB]">
                          สรุปยอดสินค้า
                        </span>
                        <p className="font-mono text-[11px] font-black text-[#F3E5AB]/85">
                          {dateLabel}
                        </p>
                      </div>
                      <h2 className="mt-0.5 text-[1.2rem] font-black tracking-tight text-white leading-tight md:text-xl">
                        สรุปสินค้าตามวันจัดส่ง
                      </h2>
                      
                      {/* Compact Stats Row - Replaces bulky cards */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] font-bold text-white/70">
                        <span>{stores.length} ร้านค้า</span>
                        <span className="h-2 w-px bg-white/25" />
                        <span>{products.length} ชนิดสินค้า</span>
                        <span className="h-2 w-px bg-white/25" />
                        <span className="text-[#F3E5AB]">{products.reduce((acc, p) => acc + p.quantity, 0).toLocaleString("th-TH")} ชิ้น</span>
                      </div>
                    </div>

                    {/* Close Button on Right */}
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white active:scale-95"
                      aria-label="ปิดหน้าต่าง"
                    >
                      <X className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                  </div>

                  {/* Compact Tabs Row */}
                  <div className="mt-3.5 flex items-center justify-between border-t border-white/10 pt-2.5">
                    <div className="w-full sm:max-w-xs md:max-w-sm">
                      <div className="relative flex rounded-xl bg-black/25 p-0.5 border border-white/5">
                        <button
                          type="button"
                          onClick={() => setActiveTab("products")}
                          className={`flex-grow flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                            activeTab === "products"
                              ? "bg-[#EA80FC] text-[#4A148C] shadow-sm font-extrabold"
                              : "text-slate-300 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <Boxes className="h-3.5 w-3.5" strokeWidth={2.4} />
                          สรุปยอดสินค้า
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => setActiveTab("stores")}
                          className={`flex-grow flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                            activeTab === "stores"
                              ? "bg-[#EA80FC] text-[#4A148C] shadow-sm font-extrabold"
                              : "text-slate-300 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <Store className="h-3.5 w-3.5" strokeWidth={2.4} />
                          แยกรายร้านค้า
                        </button>
                      </div>
                    </div>
                    
                    <p className="hidden md:block text-[10px] font-bold text-[#F3E5AB]/65">
                      * จัดเรียงแยกตามสายส่งรถยนต์แต่ละคัน
                    </p>
                  </div>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 overflow-hidden bg-slate-50">
                {activeTab === "products" ? (
                  <div className="h-full overflow-y-auto px-4 py-5 md:px-6">
                    <div className="space-y-5">
                      <VehicleTabs
                        groups={productGroups}
                        activeKey={activeProductGroup?.vehicleKey ?? null}
                        onSelect={setActiveProductVehicleKey}
                      />

                      {activeProductGroup ? (
                        <section className="rounded-2xl border border-[#EA80FC]/25 bg-white p-4 shadow-sm md:p-5 animate-in fade-in duration-200">
                          <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3">
                            <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[#EA80FC]/30 bg-[#F3E5F5] text-[#4A148C]">
                              <Truck className="h-5 w-5" strokeWidth={2.2} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-base font-black text-[#4A148C]">{activeProductGroup.vehicleName}</p>
                              <p className="text-xs font-bold text-slate-500">
                                {activeProductGroup.products.length.toLocaleString("th-TH")} สินค้า
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                            {activeProductGroup.products.map((product) => (
                              <article
                                key={product.key}
                                className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#EA80FC]/20 bg-white p-3 shadow-sm transition-all duration-200 hover:border-[#EA80FC]/60 hover:shadow-md"
                              >
                                <div className="flex flex-col items-center text-center">
                                  <div className="relative mb-3 h-20 w-full overflow-hidden rounded-xl bg-slate-50/70 p-1 group-hover:scale-102 transition-transform duration-200">
                                    {product.imageUrl ? (
                                      <Image
                                        src={product.imageUrl}
                                        alt={product.name}
                                        fill
                                        unoptimized
                                        sizes="(max-width: 768px) 40vw, 180px"
                                        className="object-contain p-1"
                                      />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center">
                                        <Package className="h-8 w-8 text-slate-300" strokeWidth={1.8} />
                                      </div>
                                    )}
                                  </div>

                                  <p className="line-clamp-2 min-h-[2.35rem] text-[13px] font-bold leading-tight text-slate-900 md:min-h-[2.6rem] md:text-[14px]">
                                    {product.name}
                                  </p>

                                  <div className="mt-3 w-full border-t border-dashed border-[#EA80FC]/25 pt-2">
                                    <p className="font-mono text-xl font-black text-[#4A148C]">
                                      {formatQty(product.quantity, product.unit)}
                                    </p>
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Stores Tab - Mobile view */}
                    <div className="h-full overflow-y-auto px-4 py-5 md:hidden">
                      <div className="space-y-4">
                        <VehicleTabs
                          groups={storeGroups}
                          activeKey={activeStoreGroup?.vehicleKey ?? null}
                          onSelect={(vehicleKey) => {
                            const group = storeGroups.find((entry) => entry.vehicleKey === vehicleKey);
                            setActiveStoreVehicleKey(vehicleKey);
                            setSelectedStoreId(group?.stores[0]?.id ?? null);
                            setMobileStoreId(null);
                          }}
                        />

                        {activeStoreGroup ? (
                          <section className="space-y-3 px-1">
                            <div className="flex items-center gap-3 border-b border-slate-100 pb-2">
                              <span className="inline-flex size-9 items-center justify-center rounded-xl border border-[#EA80FC]/30 bg-[#F3E5F5] text-[#4A148C]">
                                <Truck className="h-4.5 w-4.5" strokeWidth={2.2} />
                              </span>
                              <p className="text-base font-black text-[#4A148C]">{activeStoreGroup.vehicleName}</p>
                            </div>

                            <div className="space-y-2.5">
                              {activeStoreGroup.stores.map((store) => (
                                <button
                                  key={store.id}
                                  type="button"
                                  onClick={() => setMobileStoreId(store.id)}
                                  className="w-full rounded-2xl border border-[#EA80FC]/20 bg-white px-4 py-3.5 text-left shadow-sm transition-all duration-200 hover:border-[#EA80FC]/60 active:scale-[0.99]"
                                >
                                  <p className="text-[15px] font-bold leading-tight text-slate-900">
                                    <span translate="no" className="font-mono text-[#4A148C] font-black">{store.customerCode}</span> - {store.customerName}
                                  </p>
                                  <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                                    <span>{store.itemCount.toLocaleString("th-TH")} รายการ</span>
                                    <span className="text-[#4A148C] font-bold">{store.totalQuantity.toLocaleString("th-TH")} หน่วย</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </section>
                        ) : null}
                      </div>
                    </div>

                    {/* Stores Tab - Desktop view */}
                    <div className="hidden h-full min-h-0 md:grid md:grid-cols-[340px_minmax(0,1fr)]">
                      <div className="overflow-y-auto border-r border-slate-200 bg-white">
                        <div className="space-y-5 px-4 py-5">
                          <VehicleTabs
                            groups={storeGroups}
                            activeKey={activeStoreGroup?.vehicleKey ?? null}
                            onSelect={(vehicleKey) => {
                              const group = storeGroups.find((entry) => entry.vehicleKey === vehicleKey);
                              setActiveStoreVehicleKey(vehicleKey);
                              setSelectedStoreId(group?.stores[0]?.id ?? null);
                              setMobileStoreId(null);
                            }}
                          />

                          {activeStoreGroup ? (
                            <section className="space-y-3">
                              <div className="flex items-center gap-3 rounded-xl border border-[#EA80FC]/25 bg-[#F3E5F5] px-3 py-2">
                                <span className="inline-flex size-8 items-center justify-center rounded-full bg-white text-[#4A148C] shadow-sm">
                                  <Truck className="h-4.5 w-4.5" strokeWidth={2.2} />
                                </span>
                                <p className="text-sm font-black text-[#4A148C]">{activeStoreGroup.vehicleName}</p>
                              </div>

                              <div className="space-y-2">
                                {activeStoreGroup.stores.map((store) => {
                                  const active = selectedStore?.id === store.id;

                                  return (
                                    <button
                                      key={store.id}
                                      type="button"
                                      onClick={() => setSelectedStoreId(store.id)}
                                      className={`w-full rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 ${
                                        active
                                          ? "border-[#EA80FC] bg-[#F3E5F5] shadow-sm"
                                          : "border-slate-200 bg-white hover:border-[#EA80FC]/35 hover:bg-slate-50"
                                      }`}
                                    >
                                      <p className="text-[15px] font-bold leading-tight text-slate-900">
                                        <span translate="no" className="font-mono text-[#4A148C] font-black">{store.customerCode}</span> - {store.customerName}
                                      </p>
                                      <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                                        <span>{store.itemCount.toLocaleString("th-TH")} รายการ</span>
                                        <span className="text-[#4A148C] font-bold">{store.totalQuantity.toLocaleString("th-TH")} หน่วย</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </section>
                          ) : null}
                        </div>
                      </div>

                      <div className="overflow-y-auto px-6 py-5">
                        {selectedStore ? (
                          <div className="animate-in fade-in duration-200">
                            <div className="rounded-2xl border border-[#EA80FC]/35 bg-[#F3E5F5] px-5 py-4 shadow-sm">
                              <p className="text-[1.1rem] font-black text-[#4A148C]">
                                <span translate="no" className="font-mono text-[#4A148C]">{selectedStore.customerCode}</span> - {selectedStore.customerName}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-slate-500">
                                <span>{selectedStore.dateLabel}</span>
                                <span className="text-[#EA80FC]">|</span>
                                <span>รถ: {resolveVehicleName(selectedStore.vehicleName)}</span>
                              </div>
                            </div>

                            <div className="mt-5 overflow-hidden rounded-2xl border border-[#EA80FC]/20 bg-white shadow-sm">
                              <table className="w-full border-collapse">
                                <thead>
                                  <tr className="bg-[#F3E5F5] border-b border-[#EA80FC]/20">
                                    <th className="px-5 py-3.5 text-left text-[12px] font-black uppercase tracking-wider text-[#4A148C]">ชื่อสินค้า</th>
                                    <th className="px-5 py-3.5 text-right text-[12px] font-black uppercase tracking-wider text-[#4A148C]">จำนวน</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {selectedStore.items.map((item) => (
                                    <tr key={item.key} className="hover:bg-slate-50/60 transition-colors">
                                      <td className="px-5 py-3 text-[14px] font-semibold text-slate-950">{item.name}</td>
                                      <td className="px-5 py-3 text-right font-mono text-[14px] font-black text-[#4A148C]">
                                        {formatQty(item.quantity, item.unit)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
                            ยังไม่มีร้านค้าในช่วงวันที่เลือก
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Store Detail Mobile Drawer/Sheet */}
          {mobileStore ? (
            <div className="absolute inset-0 z-[610] md:hidden animate-in fade-in duration-200">
              <button
                type="button"
                aria-label="ปิดรายละเอียดร้านค้า"
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
                onClick={() => setMobileStoreId(null)}
              />

              <div className="absolute inset-x-0 bottom-0 top-[15dvh] overflow-hidden rounded-t-[2rem] border-t-2 border-[#EA80FC]/45 bg-white shadow-[0_-20px_50px_rgba(0,29,63,0.25)] animate-in slide-in-from-bottom duration-300">
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3 border-b border-[#EA80FC]/25 bg-[#F3E5F5] px-4 pb-3 pt-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[1.05rem] font-black text-[#4A148C] leading-tight">
                        <span translate="no" className="font-mono">{mobileStore.customerCode}</span> - {mobileStore.customerName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
                        <span>{mobileStore.dateLabel}</span>
                        <span className="text-[#EA80FC]">|</span>
                        <span>รถ: {resolveVehicleName(mobileStore.vehicleName)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobileStoreId(null)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#EA80FC]/30 bg-white text-slate-600 shadow-sm active:scale-95"
                      aria-label="ปิด"
                    >
                      <X className="h-4.5 w-4.5" strokeWidth={2.5} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    <div className="overflow-hidden rounded-2xl border border-[#EA80FC]/20 bg-white shadow-sm">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-[#F3E5F5] border-b border-[#EA80FC]/20">
                            <th className="px-4 py-3 text-left text-[12px] font-black uppercase tracking-wider text-[#4A148C]">ชื่อสินค้า</th>
                            <th className="px-4 py-3 text-right text-[12px] font-black uppercase tracking-wider text-[#4A148C]">จำนวน</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {mobileStore.items.map((item) => (
                            <tr key={item.key}>
                              <td className="px-4 py-3.5 text-[14px] font-semibold leading-snug text-slate-900">{item.name}</td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-[14px] font-black text-[#4A148C]">
                                {formatQty(item.quantity, item.unit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>,
        document.body
      ) : null}
    </>
  );
}
