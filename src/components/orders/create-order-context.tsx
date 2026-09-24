"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { fetchOrderModalDataAction } from "@/app/orders/incoming/actions";
import type { OrderCustomerOption, OrderProductOption, OrderVehicleOption } from "@/lib/orders/manage";

type CreateOrderData = {
  customers: OrderCustomerOption[];
  products: OrderProductOption[];
  vehicles: OrderVehicleOption[];
  today: string;
};

type CreateOrderCtx = {
  isOpen: boolean;
  open: (customerId?: string) => void;
  close: () => void;
  data: CreateOrderData | null;
  isLoading: boolean;
  initialCustomerId?: string;
};

const Ctx = createContext<CreateOrderCtx | null>(null);

export function CreateOrderProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialCustomerId, setInitialCustomerId] = useState<string | undefined>();
  const [data, setData] = useState<CreateOrderData | null>(null);
  const [isPending, startTransition] = useTransition();
  const savedScrollYRef = useRef<number>(0);

  const open = useCallback((customerId?: string) => {
    if (typeof window !== "undefined") {
      savedScrollYRef.current = window.scrollY;
    }
    setInitialCustomerId(customerId);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    const targetY = savedScrollYRef.current;
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsOpen(false);
    setInitialCustomerId(undefined);
    if (typeof window !== "undefined" && targetY > 0) {
      window.scrollTo({ top: targetY, behavior: "instant" });
      requestAnimationFrame(() => {
        window.scrollTo({ top: targetY, behavior: "instant" });
      });
    }
  }, []);

  // Pre-fetch data on mount for instant access
  useEffect(() => {
    if (!data && !isPending) {
      startTransition(async () => {
        try {
          const result = await fetchOrderModalDataAction();
          setData(result);
        } catch (error) {
          console.error("Failed to pre-fetch order modal data:", error);
        }
      });
    }
  }, [data, isPending]);

  return (
    <Ctx.Provider
      value={{
        isOpen,
        open,
        close,
        data,
        isLoading: isPending,
        initialCustomerId,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCreateOrder() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCreateOrder must be used inside CreateOrderProvider");
  return ctx;
}
