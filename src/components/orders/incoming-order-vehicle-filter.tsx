"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { OrderVehicleOption } from "@/lib/orders/manage";

type Props = {
  vehicles: OrderVehicleOption[];
};

export function IncomingOrderVehicleFilter({ vehicles }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectedVehicleId = searchParams.get("vehicle") || "__all__";
  const vehicleTabsContainerRef = useRef<HTMLDivElement>(null);
  const [vehicleUnderlineStyle, setVehicleUnderlineStyle] = useState<React.CSSProperties | null>(null);

  const vehicleOptions = useMemo(() => {
    return vehicles;
  }, [vehicles]);

  useEffect(() => {
    const container = vehicleTabsContainerRef.current;
    if (!container) return;

    const activeBtn = container.querySelector(
      `button[data-active="true"]`
    ) as HTMLButtonElement | null;

    if (activeBtn) {
      setVehicleUnderlineStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
    } else {
      setVehicleUnderlineStyle(null);
    }
  }, [selectedVehicleId, vehicleOptions]);

  const handleVehicleSelect = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    const activeBtn = e.currentTarget;
    setVehicleUnderlineStyle({
      left: activeBtn.offsetLeft,
      width: activeBtn.offsetWidth,
    });

    const params = new URLSearchParams(searchParams.toString());
    if (id === "__all__") {
      params.delete("vehicle");
    } else {
      params.set("vehicle", id);
    }

    startTransition(() => {
      router.push(`/orders/incoming?${params.toString()}`, { scroll: false });
    });
  };

  if (vehicleOptions.length === 0) return null;

  return (
    <div className="relative bg-transparent overflow-hidden mt-3 mb-1 w-full">
      <div
        ref={vehicleTabsContainerRef}
        className="relative flex gap-6 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar scroll-smooth"
      >
        {/* Underline indicator */}
        <span
          className="absolute bottom-0 h-[3px] rounded-full bg-[#4A148C]"
          style={{
            ...(vehicleUnderlineStyle ?? { left: 0, width: 0 }),
            opacity: vehicleUnderlineStyle ? 1 : 0,
            transition: "left 300ms cubic-bezier(0.16, 1, 0.3, 1), width 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-in-out",
          }}
        />

        <button
          type="button"
          data-active={selectedVehicleId === "__all__"}
          onClick={(e) => handleVehicleSelect("__all__", e)}
          disabled={isPending}
          className={`pb-2.5 text-sm font-black transition-all whitespace-nowrap tracking-wide disabled:opacity-70 ${
            selectedVehicleId === "__all__"
              ? "text-[#4A148C] scale-[1.03]"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          ทั้งหมด
        </button>

        <button
          type="button"
          data-active={selectedVehicleId === "__none__"}
          onClick={(e) => handleVehicleSelect("__none__", e)}
          disabled={isPending}
          className={`pb-2.5 text-sm font-black transition-all whitespace-nowrap tracking-wide disabled:opacity-70 ${
            selectedVehicleId === "__none__"
              ? "text-[#4A148C] scale-[1.03]"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          ไม่ระบุรถประจำร้าน
        </button>

        {vehicleOptions.map((v) => (
          <button
            key={v.id}
            type="button"
            data-active={selectedVehicleId === v.id}
            onClick={(e) => handleVehicleSelect(v.id, e)}
            disabled={isPending}
            className={`pb-2.5 text-sm font-black transition-all whitespace-nowrap tracking-wide disabled:opacity-70 ${
              selectedVehicleId === v.id
                ? "text-[#4A148C] scale-[1.03]"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {v.name}
          </button>
        ))}
      </div>
    </div>
  );
}
