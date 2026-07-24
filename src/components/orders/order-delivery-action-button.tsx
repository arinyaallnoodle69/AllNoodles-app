"use client";

import { useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { createPortal } from "react-dom";
import { getDeliveryFormDataAction } from "@/app/orders/delivery-actions";
import { StoreDeliveryModal } from "@/components/orders/pending-orders-section";
import type { DeliveryFormData } from "@/lib/delivery/admin";

type OrderDeliveryActionButtonProps = {
  customerId: string;
  customerName?: string;
  date: string;
  iconOnly?: boolean;
  label?: string;
  orderId?: string;
  vehicles?: { id: string; name: string }[];
  defaultVehicleId?: string | null;
  defaultVehicleName?: string | null;
};

export function OrderDeliveryActionButton({
  customerName = "ร้านค้าไม่ทราบชื่อ",
  iconOnly = false,
  label = "พิมพ์บิลส่งของ",
  vehicles = [],
  defaultVehicleId = null,
  defaultVehicleName = null,
  orderId,
}: OrderDeliveryActionButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<DeliveryFormData[] | null>(null);

  async function handleOpen() {
    if (loading || !orderId) return;
    setLoading(true);
    try {
      const data = await getDeliveryFormDataAction(orderId);
      if (data) {
        setOrders([data]);
        setOpen(true);
      } else {
        alert("ไม่พบข้อมูลออเดอร์สำหรับจัดส่ง");
      }
    } catch (err) {
      console.error("[OrderDeliveryActionButton] error:", err);
      alert("ไม่สามารถดึงข้อมูลบิลจัดส่งได้");
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
        aria-label={label}
        title={label}
        className={[
          "inline-flex items-center justify-center border border-[#4A148C] bg-[#4A148C] text-white transition hover:bg-[#4A148C] active:scale-95 disabled:opacity-50",
          iconOnly
            ? "size-10 shrink-0 rounded-full p-0 leading-none"
            : "min-h-9 w-full gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
        ].join(" ")}
      >
        {loading ? (
          <Loader2 className="h-4.5 w-4.5 animate-spin" strokeWidth={2.2} />
        ) : (
          <Truck className="h-4.5 w-4.5" strokeWidth={2.2} />
        )}
        {iconOnly ? null : loading ? "กำลังโหลด..." : label}
      </button>

      {open && orders && orders.length > 0 && typeof document !== "undefined"
        ? createPortal(
            <StoreDeliveryModal
              customerName={customerName}
              orders={orders}
              defaultVehicleId={defaultVehicleId}
              defaultVehicleName={defaultVehicleName}
              vehicles={vehicles}
              onClose={() => {
                setOpen(false);
                setOrders(null);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
