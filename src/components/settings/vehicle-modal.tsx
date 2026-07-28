"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { VehicleForm } from "@/components/settings/vehicle-form";
import type { SettingsVehicle } from "@/lib/settings/admin";

type VehicleModalState =
  | { mode: "create" }
  | { mode: "edit"; vehicle: SettingsVehicle }
  | null;

type VehicleModalCtx = {
  openCreate: () => void;
  openEdit: (vehicle: SettingsVehicle) => void;
};

const Ctx = createContext<VehicleModalCtx | null>(null);

export function useVehicleModal() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVehicleModal must be used inside VehicleModalProvider");
  return ctx;
}

/**
 * Opens/closes the vehicle form instantly with client state.
 * The ?create=1 / ?edit=<id> URL params are still honored on first render
 * (deep links) and cleaned up via history.replaceState on close — no server
 * round trip on open/close anymore.
 */
export function VehicleModalProvider({
  children,
  vehicles,
  initialCreate = false,
  initialEditId = null,
}: {
  children: React.ReactNode;
  vehicles: SettingsVehicle[];
  initialCreate?: boolean;
  initialEditId?: string | null;
}) {
  const [state, setState] = useState<VehicleModalState>(() => {
    if (initialEditId) {
      const found = vehicles.find((vehicle) => vehicle.id === initialEditId);
      if (found) return { mode: "edit", vehicle: found };
    }
    if (initialCreate) return { mode: "create" };
    return null;
  });

  const close = useCallback(() => {
    setState(null);
    window.history.replaceState(null, "", "/settings/vehicles");
  }, []);

  const value = useMemo<VehicleModalCtx>(
    () => ({
      openCreate: () => setState({ mode: "create" }),
      openEdit: (vehicle) => setState({ mode: "edit", vehicle }),
    }),
    [],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {state?.mode === "create" ? (
        <VehicleForm returnHref="/settings/vehicles" onClose={close} />
      ) : null}
      {state?.mode === "edit" ? (
        <VehicleForm
          key={state.vehicle.id}
          initialVehicle={state.vehicle}
          returnHref="/settings/vehicles"
          onClose={close}
        />
      ) : null}
    </Ctx.Provider>
  );
}

export function VehicleCreateButton({ variant }: { variant: "desktop" | "fab" }) {
  const { openCreate } = useVehicleModal();

  if (variant === "fab") {
    return (
      <button
        type="button"
        onClick={openCreate}
        aria-label="เพิ่มรถ"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#4A148C] text-white shadow-[0_14px_32px_rgba(142, 36, 170,0.32)] transition active:scale-95 lg:hidden"
      >
        <Plus className="h-7 w-7" strokeWidth={2.6} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openCreate}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#4A148C] px-4 text-sm font-black text-white shadow-[0_12px_26px_rgba(142, 36, 170,0.22)] transition hover:bg-[#4A148C] active:scale-[0.98]"
    >
      <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
      เพิ่มรถ
    </button>
  );
}
