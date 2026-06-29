"use client";

import { useMemo, useState, useTransition } from "react";
import { Warehouse } from "lucide-react";
import { updateCustomerDefaultWarehouseAction } from "@/app/settings/customers/actions";
import type { WarehouseOption } from "@/lib/warehouses";

type CustomerWarehouseSelectProps = {
  className?: string;
  customerId: string;
  currentWarehouseId: string | null;
  currentWarehouseName: string | null;
  warehouses: WarehouseOption[];
  compact?: boolean;
};

export function CustomerWarehouseSelect({
  className,
  customerId,
  currentWarehouseId,
  currentWarehouseName,
  warehouses,
  compact = false,
}: CustomerWarehouseSelectProps) {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(currentWarehouseId ?? "");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const options = useMemo(() => {
    const activeWarehouses = warehouses.filter((warehouse) => warehouse.isActive);
    if (!currentWarehouseId || activeWarehouses.some((warehouse) => warehouse.id === currentWarehouseId)) {
      return activeWarehouses;
    }

    return [
      ...activeWarehouses,
      {
        id: currentWarehouseId,
        slug: "",
        name: currentWarehouseName ?? "คลังเดิมที่ปิดใช้งาน",
        isActive: false,
        sortOrder: Number.MAX_SAFE_INTEGER,
      },
    ];
  }, [currentWarehouseId, currentWarehouseName, warehouses]);

  function handleChange(nextWarehouseId: string) {
    setSelectedWarehouseId(nextWarehouseId);
    setErrorMessage(null);

    startTransition(async () => {
      const result = await updateCustomerDefaultWarehouseAction(customerId, nextWarehouseId || null);

      if (result.error) {
        setErrorMessage(result.error);
        setSelectedWarehouseId(currentWarehouseId ?? "");
      }
    });
  }

  return (
    <div className={className}>
      <div className="relative">
        <Warehouse className={`pointer-events-none absolute ${compact ? 'left-2.5 h-3.5 w-3.5' : 'left-3 h-4 w-4'} top-1/2 -translate-y-1/2 text-[#4A148C]`} strokeWidth={2.1} />
        <select
          value={selectedWarehouseId}
          disabled={isPending}
          onChange={(event) => handleChange(event.target.value)}
          className={`w-full rounded-xl border border-slate-200 bg-white ${compact ? 'h-8 py-1 pl-9 pr-7 text-xs' : 'py-2 pl-9 pr-8 text-sm'} font-bold text-slate-700 outline-none transition focus:border-[#4A148C]/30 focus:ring-2 focus:ring-[#4A148C]/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
          aria-label="เลือกคลังประจำร้าน"
        >
          <option value="">{compact ? 'ไม่มีคลัง' : 'ยังไม่กำหนดคลังประจำร้าน'}</option>
          {options.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
      </div>
      {errorMessage ? (
        <p className="mt-1 text-xs font-medium text-red-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
