"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

type StockTabsProps = {
  current: "stock" | "history" | "issues";
  onChangeTab?: (key: "stock" | "history" | "issues") => void;
};

const tabs = [
  {
    href: "/stock",
    key: "stock",
    label: "สต็อกคงเหลือ",
  },
  {
    href: "/stock/history",
    key: "history",
    label: "ประวัติการรับเข้า",
  },
  {
    href: "/stock/issues",
    key: "issues",
    label: "เบิกออก",
  },
] as const;

export function StockTabs({ current, onChangeTab }: StockTabsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [targetKey, setTargetKey] = useState<string | null>(null);

  const handleTabClick = (href: string, key: "stock" | "history" | "issues") => {
    if (onChangeTab) {
      onChangeTab(key);
    } else {
      setTargetKey(key);
      startTransition(() => {
        router.push(href);
      });
    }
  };

  return (
    <div className="mt-4 mb-6">
      <div className="grid grid-cols-3 rounded-xl bg-slate-100/80 p-1 backdrop-blur-sm border border-slate-200/50 shadow-sm">
        {tabs.map((tab) => {
          const isActive = current === tab.key;
          const isLoading = isPending && targetKey === tab.key;

          return (
            <button
              key={tab.href}
              disabled={isPending}
              onClick={() => handleTabClick(tab.href, tab.key)}
              className={`rounded-lg px-1 py-2.5 text-center text-[11px] font-black transition-all duration-200 sm:px-4 sm:py-2.5 sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-85 ${
                isActive
                  ? "bg-[#8E24AA] text-white shadow-sm scale-[1.02]"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {isLoading && <Loader2 className="h-3 w-3 animate-spin text-[#8E24AA]" />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
