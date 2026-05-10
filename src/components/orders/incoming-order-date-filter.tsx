"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

type Props = {
  id: string;
  name: string;
  defaultValue: string;
};

export function IncomingOrderDateFilter({ id, name, defaultValue }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isPending, startTransition] = useTransition();

  function handleChange(nextDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", nextDate);
    
    startTransition(() => {
      router.push(`/orders/incoming?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <ThaiDatePicker
      id={id}
      name={name}
      defaultValue={defaultValue}
      placeholder="เลือกวันที่"
      onChange={handleChange}
      loading={isPending}
    />
  );
}
