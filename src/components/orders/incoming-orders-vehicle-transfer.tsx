"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowRightLeft, CalendarDays, Loader2, Truck, X } from "lucide-react";

import { moveIncomingOrdersVehicleAction } from "@/app/orders/incoming/actions";
import type { VehicleTransferDateOption } from "@/lib/orders/vehicle-transfer";

type Props = {
  dateOptions: VehicleTransferDateOption[];
  variant?: "desktop" | "mobile";
};

function formatThaiDate(value: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

export function IncomingOrdersVehicleTransfer({ dateOptions, variant = "desktop" }: Props) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]?.date ?? "");
  const selectedDateOption = useMemo(
    () => dateOptions.find((option) => option.date === selectedDate) ?? dateOptions[0],
    [dateOptions, selectedDate],
  );
  const [fromVehicleId, setFromVehicleId] = useState(selectedDateOption?.vehicles[0]?.id ?? "");
  const [toVehicleId, setToVehicleId] = useState(selectedDateOption?.vehicles[1]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sourceVehicle = selectedDateOption?.vehicles.find((vehicle) => vehicle.id === fromVehicleId);
  const destinationVehicles = selectedDateOption?.vehicles.filter(
    (vehicle) => vehicle.id !== fromVehicleId,
  ) ?? [];
  const canSubmit = Boolean(
    selectedDateOption && sourceVehicle && toVehicleId && fromVehicleId !== toVehicleId && !pending,
  );

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, pending]);

  if (dateOptions.length === 0) return null;

  function resetVehicles(date: string) {
    const option = dateOptions.find((item) => item.date === date) ?? dateOptions[0];
    setFromVehicleId(option?.vehicles[0]?.id ?? "");
    setToVehicleId(option?.vehicles[1]?.id ?? "");
    setError(null);
  }

  function handleSourceChange(nextSourceId: string) {
    setFromVehicleId(nextSourceId);
    setError(null);
    if (nextSourceId === toVehicleId) {
      setToVehicleId(
        selectedDateOption?.vehicles.find((vehicle) => vehicle.id !== nextSourceId)?.id ?? "",
      );
    }
  }

  function handleSubmit() {
    if (!selectedDateOption || !canSubmit) return;
    setError(null);

    startTransition(async () => {
      const result = await moveIncomingOrdersVehicleAction({
        date: selectedDateOption.date,
        fromVehicleId,
        toVehicleId,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetVehicles(selectedDateOption?.date ?? dateOptions[0].date);
          setOpen(true);
        }}
        className={[
          "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#4A148C]/25 bg-[#F3E5F5] font-black text-[#4A148C] transition hover:border-[#4A148C]/40 hover:bg-[#EA80FC]/20 active:scale-[0.98]",
          variant === "mobile" ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm",
        ].join(" ")}
      >
        <ArrowRightLeft className="h-4 w-4" strokeWidth={2.4} />
        ย้ายรถ
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:p-5"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !pending) setOpen(false);
              }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl"
              >
                <header className="flex items-center justify-between bg-[#4A148C] px-4 py-4 text-white sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/15">
                      <ArrowRightLeft className="h-5 w-5" strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0">
                      <h2 id={titleId} className="text-lg font-black">ย้ายออเดอร์ทั้งรถ</h2>
                      <p className="mt-0.5 text-xs font-semibold text-white/75">ใช้เฉพาะวันที่เลือก ไม่เปลี่ยนรถประจำร้าน</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    aria-label="ปิด"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10 transition hover:bg-white/20 disabled:opacity-50"
                  >
                    <X className="h-5 w-5" strokeWidth={2.4} />
                  </button>
                </header>

                <div className="overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                  <div className="grid gap-4">
                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-2 text-sm font-black text-slate-800">
                        <CalendarDays className="h-4 w-4 text-[#4A148C]" strokeWidth={2.3} />
                        วันที่ส่งของ
                      </span>
                      {dateOptions.length > 1 ? (
                        <select
                          value={selectedDateOption?.date ?? ""}
                          onChange={(event) => {
                            setSelectedDate(event.target.value);
                            resetVehicles(event.target.value);
                          }}
                          disabled={pending}
                          className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#4A148C] focus:ring-2 focus:ring-[#EA80FC]/20"
                        >
                          {dateOptions.map((option) => (
                            <option key={option.date} value={option.date}>{formatThaiDate(option.date)}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex h-12 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900">
                          {formatThaiDate(selectedDateOption?.date ?? "")}
                        </div>
                      )}
                    </label>

                    <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                      <label className="block min-w-0">
                        <span className="mb-1.5 block text-sm font-black text-slate-800">ย้ายจากรถ</span>
                        <select
                          value={fromVehicleId}
                          onChange={(event) => handleSourceChange(event.target.value)}
                          disabled={pending}
                          className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#4A148C] focus:ring-2 focus:ring-[#EA80FC]/20"
                        >
                          {selectedDateOption?.vehicles.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>{vehicle.name} ({vehicle.orderCount})</option>
                          ))}
                        </select>
                      </label>

                      <span className="hidden h-12 items-center justify-center text-[#4A148C] sm:flex">
                        <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
                      </span>

                      <label className="block min-w-0">
                        <span className="mb-1.5 block text-sm font-black text-slate-800">ไปรวมกับรถ</span>
                        <select
                          value={toVehicleId}
                          onChange={(event) => {
                            setToVehicleId(event.target.value);
                            setError(null);
                          }}
                          disabled={pending}
                          className="h-12 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#4A148C] focus:ring-2 focus:ring-[#EA80FC]/20"
                        >
                          {destinationVehicles.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="flex items-start gap-3 rounded-lg border border-[#EA80FC]/30 bg-[#F3E5F5]/70 px-3 py-3">
                      <Truck className="mt-0.5 h-5 w-5 shrink-0 text-[#4A148C]" strokeWidth={2.3} />
                      <p className="text-sm font-bold leading-6 text-[#4A148C]">
                        ออเดอร์ {sourceVehicle?.orderCount ?? 0} รายการจะย้ายไปอยู่รถคันใหม่ และเอกสารพิมพ์ทั้งหมดจะอ้างอิงรถใหม่ทันที
                      </p>
                    </div>

                    {error ? (
                      <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700">{error}</p>
                    ) : null}
                  </div>
                </div>

                <footer className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-5">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    className="h-12 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#4A148C] px-4 text-sm font-black text-white transition hover:bg-[#5c1a9e] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" strokeWidth={2.4} />}
                    {pending ? "กำลังย้าย..." : `ย้าย ${sourceVehicle?.orderCount ?? 0} ออเดอร์`}
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
