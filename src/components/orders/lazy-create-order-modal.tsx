"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { fetchOrderModalDataAction } from "@/app/orders/incoming/actions";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import type {
  OrderCustomerOption,
  OrderProductOption,
  OrderVehicleOption,
} from "@/lib/orders/manage";

type CreateOrderModalData = {
  customers: OrderCustomerOption[];
  products: OrderProductOption[];
  vehicles: OrderVehicleOption[];
  today: string;
};

type Props = {
  autoOpen?: boolean;
  customerOrderCountsToday?: Record<string, number>;
};

/**
 * Same trigger + modal as CreateOrderModal, but the heavy catalog payload
 * (products/sale units/images/stock) is fetched only when the user actually
 * opens the modal, instead of being serialized into every page load.
 */
export function LazyCreateOrderModal({ autoOpen, customerOrderCountsToday = {} }: Props) {
  const [data, setData] = useState<CreateOrderModalData | null>(null);
  const [openRequested, setOpenRequested] = useState(Boolean(autoOpen));
  const [loadFailed, setLoadFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    if (data) return;
    startTransition(async () => {
      try {
        const result = await fetchOrderModalDataAction();
        setData(result);
        setLoadFailed(false);
      } catch (error) {
        console.error("Failed to load create-order modal data:", error);
        setLoadFailed(true);
      }
    });
  }, [data]);

  const open = useCallback(() => {
    setOpenRequested(true);
    load();
  }, [load]);

  useEffect(() => {
    if (autoOpen) {
      load();
    }
  }, [autoOpen, load]);

  const loadingVisible = openRequested && !data;

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="action-touch-safe inline-flex items-center justify-center gap-2 rounded-full border border-[#EA80FC]/80 bg-[#4A148C] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_40px_rgba(142, 36, 170,0.35)] transition-all hover:scale-105 hover:bg-[#4A148C] active:scale-95 md:h-14 md:px-7 md:text-[15px]"
      >
        <Plus className="h-4.5 w-4.5 md:h-5 md:w-5" strokeWidth={3} />
        สร้างออเดอร์
      </button>

      {loadingVisible ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="ปิดหน้าต่างสร้างออเดอร์"
            onClick={() => setOpenRequested(false)}
          />
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
            {loadFailed && !isPending ? (
              <>
                <p className="text-base font-bold text-slate-950">โหลดข้อมูลไม่สำเร็จ</p>
                <p className="mt-1 text-sm font-medium text-slate-600">กรุณาลองใหม่อีกครั้ง</p>
                <button
                  type="button"
                  onClick={load}
                  className="mt-4 inline-flex items-center justify-center rounded-full border border-[#EA80FC]/80 bg-[#4A148C] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95"
                >
                  ลองใหม่
                </button>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#4A148C]" />
                <p className="text-base font-bold text-slate-950">กำลังเตรียมข้อมูลสร้างออเดอร์</p>
                <p className="mt-1 text-sm font-medium text-slate-600">กรุณารอสักครู่</p>
              </>
            )}
          </div>
        </div>
      ) : null}

      {data ? (
        <CreateOrderModal
          open={openRequested}
          onOpenChange={(nextOpen) => setOpenRequested(nextOpen)}
          customers={data.customers}
          products={data.products}
          vehicles={data.vehicles}
          today={data.today}
          customerOrderCountsToday={customerOrderCountsToday}
          hideTrigger
        />
      ) : null}
    </>
  );
}
