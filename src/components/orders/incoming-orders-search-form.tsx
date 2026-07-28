"use client";

import { createContext, useContext, useEffect, useRef, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMobileSearch } from "../mobile-search/mobile-search-context";

type Props = {
  children: React.ReactNode;
  className?: string;
};

const IncomingOrdersSearchPendingContext = createContext(false);

export function IncomingOrdersSearchForm({ children, className }: Props) {
  const router = useRouter();
  const { close } = useMobileSearch();
  const [isPending, startTransition] = useTransition();
  const navigationStartedRef = useRef(false);

  useEffect(() => {
    if (isPending) {
      navigationStartedRef.current = true;
      return;
    }

    if (navigationStartedRef.current) {
      navigationStartedRef.current = false;
      close();
    }
  }, [close, isPending]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      if (value) {
        params.set(key, value as string);
      }
    }

    startTransition(() => {
      router.push(`/orders/incoming?${params.toString()}`);
    });
  }

  return (
    <IncomingOrdersSearchPendingContext.Provider value={isPending}>
      <form onSubmit={handleSubmit} className={className} aria-busy={isPending}>
        {children}
      </form>
    </IncomingOrdersSearchPendingContext.Provider>
  );
}

export function IncomingOrdersSearchSubmitButton({ className }: { className: string }) {
  const isPending = useContext(IncomingOrdersSearchPendingContext);

  return (
    <button
      type="submit"
      disabled={isPending}
      className={className}
    >
      {isPending ? <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" /> : null}
      <span>{isPending ? "กำลังค้นหา..." : "ค้นหา"}</span>
    </button>
  );
}
