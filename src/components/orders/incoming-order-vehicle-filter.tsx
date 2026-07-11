"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { OrderVehicleOption } from "@/lib/orders/manage";

type Props = {
  vehicles: OrderVehicleOption[];
  activeVehicleId?: string;
  onVehicleChange?: (id: string) => void;
};

export function IncomingOrderVehicleFilter({ vehicles, activeVehicleId, onVehicleChange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectedVehicleId = activeVehicleId !== undefined ? activeVehicleId : (searchParams.get("vehicle") || "__all__");
  const [localActiveId, setLocalActiveId] = useState(selectedVehicleId);
  const vehicleTabsContainerRef = useRef<HTMLDivElement>(null);
  const [vehicleUnderlineStyle, setVehicleUnderlineStyle] = useState<React.CSSProperties | null>(null);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  const vehicleOptions = useMemo(() => {
    return vehicles;
  }, [vehicles]);

  useEffect(() => {
    setLocalActiveId(selectedVehicleId);
  }, [selectedVehicleId]);

  useEffect(() => {
    const container = vehicleTabsContainerRef.current;
    if (!container) return;

    const activeBtn = container.querySelector(
      `button[data-active="true"]`
    ) as HTMLButtonElement | null;

    if (activeBtn) {
      const nextLeft = activeBtn.offsetLeft;
      const nextWidth = activeBtn.offsetWidth;

      // Scroll active tab into view instantly on mount/props load to avoid scrolling jitter
      activeBtn.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });

      // Disable animation for server sync
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
  }, [localActiveId, vehicleOptions]);

  const handleVehicleSelect = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    const activeBtn = e.currentTarget;
    
    // Immediately scroll selected tab into center view smoothly on user click
    activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    
    setShouldAnimate(true); // Enable animation for immediate sliding transition
    setLocalActiveId(id);
    
    const nextLeft = activeBtn.offsetLeft;
    const nextWidth = activeBtn.offsetWidth;
    setVehicleUnderlineStyle((prev) => {
      if (prev && prev.left === nextLeft && prev.width === nextWidth) {
        return prev;
      }
      return { left: nextLeft, width: nextWidth };
    });

    if (onVehicleChange) {
      // 1. Silent URL update (0ms, no server roundtrip, keeps url & refresh working)
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (id === "__all__") {
          params.delete("vehicle");
        } else {
          params.set("vehicle", id);
        }
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl);
      }
      
      // 2. Client-side state update (0ms, instant React re-render)
      onVehicleChange(id);
    } else {
      // Fallback: router query transition (server roundtrip)
      const params = new URLSearchParams(searchParams.toString());
      if (id === "__all__") {
        params.delete("vehicle");
      } else {
        params.set("vehicle", id);
      }
      startTransition(() => {
        router.replace(`/orders/incoming?${params.toString()}`, { scroll: false });
      });
    }
  };

  if (vehicleOptions.length === 0) return null;

  return (
    <div className="relative bg-transparent overflow-hidden mt-3 mb-1 w-full">
      <div
        ref={vehicleTabsContainerRef}
        className="relative flex gap-6 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar scroll-smooth -mx-4 px-4"
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
          data-active={localActiveId === "__all__"}
          onClick={(e) => handleVehicleSelect("__all__", e)}
          className={`pb-2.5 text-sm font-black transition-all whitespace-nowrap tracking-wide ${
            localActiveId === "__all__"
              ? "text-[#4A148C] scale-[1.03]"
              : "text-slate-500 hover:text-slate-800"
          } ${isPending && localActiveId === "__all__" ? "animate-pulse opacity-85" : ""}`}
        >
          ทั้งหมด
        </button>

        <button
          type="button"
          data-active={localActiveId === "__none__"}
          onClick={(e) => handleVehicleSelect("__none__", e)}
          className={`pb-2.5 text-sm font-black transition-all whitespace-nowrap tracking-wide ${
            localActiveId === "__none__"
              ? "text-[#4A148C] scale-[1.03]"
              : "text-slate-500 hover:text-slate-800"
          } ${isPending && localActiveId === "__none__" ? "animate-pulse opacity-85" : ""}`}
        >
          ไม่ระบุรถประจำร้าน
        </button>

        {vehicleOptions.map((v) => (
          <button
            key={v.id}
            type="button"
            data-active={localActiveId === v.id}
            onClick={(e) => handleVehicleSelect(v.id, e)}
            className={`pb-2.5 text-sm font-black transition-all whitespace-nowrap tracking-wide ${
              localActiveId === v.id
                ? "text-[#4A148C] scale-[1.03]"
                : "text-slate-500 hover:text-slate-800"
            } ${isPending && localActiveId === v.id ? "animate-pulse opacity-85" : ""}`}
          >
            {v.name}
          </button>
        ))}
      </div>
    </div>
  );
}
