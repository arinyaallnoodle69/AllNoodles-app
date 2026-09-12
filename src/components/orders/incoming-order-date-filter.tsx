"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

type Props = {
  id: string;
  name: string;
  defaultValue: string;
  noAutoSubmit?: boolean;
  targetPath?: string;
};

export function IncomingOrderDateFilter({ id, name, defaultValue, noAutoSubmit, targetPath = "/orders/incoming" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isPending, startTransition] = useTransition();

  function handleChange(nextDate: string) {
    if (noAutoSubmit) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set(name, nextDate);
    
    startTransition(() => {
      router.push(`${targetPath}?${params.toString()}`, { scroll: false });
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
