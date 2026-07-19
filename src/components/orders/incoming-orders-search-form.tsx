"use client";

import { useRouter } from "next/navigation";
import { useMobileSearch } from "../mobile-search/mobile-search-context";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export function IncomingOrdersSearchForm({ children, className }: Props) {
  const router = useRouter();
  const { close } = useMobileSearch();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      if (value) {
        params.set(key, value as string);
      }
    }

    // Close the mobile search drawer if open
    close();

    // Client-side navigation (soft routing) - instant feedback, triggers loading.tsx
    router.push(`/orders/incoming?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      {children}
    </form>
  );
}
