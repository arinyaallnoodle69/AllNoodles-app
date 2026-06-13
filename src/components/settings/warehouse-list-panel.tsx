"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PencilLine, Power, PowerOff, Store, Warehouse, Trash2, MapPin, Box, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { toggleWarehouseAction, deleteWarehouseAction } from "@/app/settings/warehouses/actions";
import type { WarehouseFormItem } from "@/components/settings/warehouse-form";
import { Button } from "@/components/ui/button";

type WarehouseWithCustomerCount = WarehouseFormItem & {
  customerCount: number;
  customers: Array<{ id: string; name: string; code: string }>;
};

type WarehouseListPanelProps = {
  warehouses: WarehouseWithCustomerCount[];
};

function ToggleButton({
  isActive,
  warehouseId,
}: {
  isActive: boolean;
  warehouseId: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleToggle() {
    setIsPending(true);
    await toggleWarehouseAction(warehouseId, !isActive);
    router.refresh();
    setIsPending(false);
  }

  return (
    <Button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      variant="outline"
      size="sm"
      className={`rounded-md h-9 px-3.5 font-bold text-xs tracking-[0.5px] uppercase border transition-all duration-200 ${
        isActive
          ? "border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-100/50"
          : "border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100/50"
      }`}
    >
      {isActive ? (
        <>
          <PowerOff className="size-3.5 mr-1.5" strokeWidth={2.4} />
          ปิดใช้งาน
        </>
      ) : (
        <>
          <Power className="size-3.5 mr-1.5" strokeWidth={2.4} />
          เปิดใช้งาน
        </>
      )}
    </Button>
  );
}

function DeleteButton({
  warehouseId,
  name,
  isMain,
}: {
  warehouseId: string;
  name: string;
  isMain: boolean;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  if (isMain) {
    return null;
  }

  async function handleDelete() {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบคลัง "${name}"?`)) {
      return;
    }
    setIsPending(true);
    const result = await deleteWarehouseAction(warehouseId);
    if (result && result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
    setIsPending(false);
  }

  return (
    <Button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      variant="outline"
      size="sm"
      className="rounded-md h-9 px-3.5 font-bold text-xs tracking-[0.5px] uppercase border border-red-200 bg-red-50/50 text-red-600 hover:bg-red-100/50 transition-all duration-200"
    >
      <Trash2 className="size-3.5 mr-1.5" strokeWidth={2.4} />
      ลบ
    </Button>
  );
}

export function WarehouseListPanel({ warehouses }: WarehouseListPanelProps) {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(
    warehouses.length > 0 ? warehouses[0].id : null
  );

  const activeWarehouse = warehouses.find((w) => w.id === selectedWarehouseId) || warehouses[0] || null;

  // Compute metrics
  const totalWarehouses = warehouses.length;
  const activeWarehousesCount = warehouses.filter((w) => w.isActive).length;
  const totalStores = warehouses.reduce((sum, w) => sum + w.customerCount, 0);

  function formatFullAddress(w: WarehouseWithCustomerCount) {
    if (!w.address && !w.subdistrict && !w.district && !w.province) {
      return "ไม่ได้ระบุที่อยู่คลังสินค้า";
    }
    const parts = [];
    if (w.address) parts.push(w.address);
    if (w.subdistrict) parts.push(`ต.${w.subdistrict}`);
    if (w.district) parts.push(`อ.${w.district}`);
    if (w.province) parts.push(`จ.${w.province}`);
    if (w.postalCode) parts.push(w.postalCode);
    return parts.join(" ");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Metrics Section: bold titles and dark black numbers (#1a1a1a) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {/* Card 1: Total Warehouses (col-span-2 on mobile, col-span-1 on desktop) */}
        <div className="col-span-2 sm:col-span-1 relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(26,26,26,0.08)]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F3E5F5] text-[#8E24AA]">
              <Box className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs font-bold text-[#1a1a1a] uppercase tracking-[0.5px]">คลังทั้งหมด</p>
              <h3 className="mt-0.5 text-lg sm:text-2xl font-bold text-[#1a1a1a] whitespace-nowrap">{totalWarehouses} คลัง</h3>
            </div>
          </div>
        </div>

        {/* Card 2: Active Warehouses */}
        <div className="col-span-1 relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(26,26,26,0.08)]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs font-bold text-[#1a1a1a] uppercase tracking-[0.5px]">เปิดใช้งานอยู่</p>
              <h3 className="mt-0.5 text-lg sm:text-2xl font-bold text-emerald-700 whitespace-nowrap">{activeWarehousesCount} คลัง</h3>
            </div>
          </div>
        </div>

        {/* Card 3: Connected Stores */}
        <div className="col-span-1 relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(26,26,26,0.08)]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#AA00FF]/5 text-[#AA00FF]">
              <Store className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs font-bold text-[#1a1a1a] uppercase tracking-[0.5px]">ร้านค้าเชื่อมโยง</p>
              <h3 className="mt-0.5 text-lg sm:text-2xl font-bold text-[#1a1a1a] whitespace-nowrap">{totalStores} ร้านค้า</h3>
            </div>
          </div>
        </div>
      </div>

      {warehouses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 py-16 text-center text-sm text-[#1a1a1a] font-semibold">
          ยังไม่มีคลังสินค้าในระบบ กดปุ่ม &ldquo;เพิ่มคลังสินค้า&rdquo; เพื่อสร้างรายการแรก
        </div>
      ) : (
        /* HP Split-screen Dashboard Layout */
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Left Column: Warehouse Select List */}
          <div className="md:col-span-5 flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.7px] text-[#1a1a1a] px-1">เลือกคลังเพื่อดูรายละเอียด</p>
            <div className="flex flex-col gap-2.5">
              {warehouses.map((w) => {
                const isSelected = w.id === selectedWarehouseId;
                return (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWarehouseId(w.id)}
                    className={`w-full text-left flex items-center justify-between p-4 rounded-2xl border transition-all duration-200 ${
                      isSelected
                        ? "border-[#8E24AA] bg-[#F3E5F5]/50 shadow-sm"
                        : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition ${
                        w.isActive
                          ? isSelected
                            ? "bg-[#8E24AA] text-white"
                            : "bg-[#F3E5F5] text-[#8E24AA]"
                          : "bg-slate-100 text-slate-400"
                      }`}>
                        <Warehouse className="h-5 w-5" strokeWidth={2.2} />
                      </div>
                      <div>
                        <h4 className={`text-sm font-bold tracking-tight transition-colors ${
                          isSelected ? "text-[#8E24AA]" : "text-[#1a1a1a]"
                        }`}>
                          {w.name}
                        </h4>
                        <code className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider">
                          {w.slug.toUpperCase()}
                        </code>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${w.isActive ? "bg-emerald-500" : "bg-slate-300"}`} />
                      <ChevronRight className={`h-4 w-4 transition-transform text-slate-400 ${
                        isSelected ? "translate-x-0.5 text-[#8E24AA]" : ""
                      }`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Warehouse Details & Linked Stores */}
          <div className="md:col-span-7">
            {activeWarehouse && (
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(26,26,26,0.08)] overflow-hidden flex flex-col h-full min-h-[420px] animate-fade-in">
                {/* Panel Header */}
                <div className="border-b border-slate-100 p-6 bg-slate-50/40">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-[0.5px] uppercase ${
                        activeWarehouse.isActive
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}>
                        {activeWarehouse.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                      </span>
                      <h3 className="mt-2.5 text-xl font-bold text-[#1a1a1a]">{activeWarehouse.name}</h3>
                      <code className="mt-1 inline-block text-[11px] font-mono font-bold text-slate-600 uppercase tracking-wider">
                        รหัสคลัง: {activeWarehouse.slug.toUpperCase()}
                      </code>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="rounded-md h-9 px-3.5 font-bold text-xs tracking-[0.5px] uppercase border-slate-200 text-slate-700 bg-white hover:border-[#8E24AA]/30 hover:text-[#8E24AA] transition duration-200"
                      >
                        <Link href={`/settings/warehouses?edit=${activeWarehouse.id}`}>
                          <PencilLine className="size-3.5 mr-1.5" strokeWidth={2} />
                          แก้ไข
                        </Link>
                      </Button>
                      <ToggleButton warehouseId={activeWarehouse.id} isActive={activeWarehouse.isActive} />
                      <DeleteButton
                        warehouseId={activeWarehouse.id}
                        name={activeWarehouse.name}
                        isMain={activeWarehouse.slug === "main"}
                      />
                    </div>
                  </div>
                </div>

                {/* Panel Body */}
                <div className="p-6 flex-1 flex flex-col gap-6">
                  {/* Address Section */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.7px] text-[#1a1a1a] flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-[#1a1a1a]" />
                      ที่อยู่คลังสินค้า
                    </span>
                    <div className="rounded-md bg-slate-50 border border-slate-100 p-4 text-sm text-[#1a1a1a] leading-relaxed font-semibold">
                      {formatFullAddress(activeWarehouse)}
                    </div>
                  </div>

                  {/* Linked Stores Section */}
                  <div className="flex-1 flex flex-col gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.7px] text-[#1a1a1a] flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 text-[#1a1a1a]" />
                      ร้านค้าที่เชื่อมโยง ({activeWarehouse.customerCount} ร้านค้า)
                    </span>

                    {activeWarehouse.customers.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-md p-8 text-center bg-slate-50/30">
                        <Info className="h-8 w-8 text-slate-400 mb-2" />
                        <p className="text-xs text-[#1a1a1a] font-bold">ยังไม่มีร้านค้าผูกกับคลังนี้</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">สามารถเลือกคลังนี้ให้เป็นคลังประจำได้ในหน้าจัดการร้านค้า</p>
                      </div>
                    ) : (
                      <div className="max-h-[220px] overflow-y-auto border border-slate-150 rounded-md divide-y divide-slate-100">
                        {activeWarehouse.customers.map((c) => (
                          <div key={c.id} className="flex items-center justify-between p-3.5 bg-white hover:bg-slate-50/50 transition">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F3E5F5] text-[#8E24AA]">
                                <Store className="h-4 w-4" strokeWidth={2.2} />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-[#1a1a1a]">{c.name}</p>
                                <p className="text-[10px] font-mono font-bold text-slate-600">{c.code}</p>
                              </div>
                            </div>

                            <Link
                              href={`/settings/customers?edit=${c.id}`}
                              className="text-[11px] font-bold tracking-[0.5px] uppercase text-[#8E24AA] hover:underline"
                            >
                              จัดการร้านค้า
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
