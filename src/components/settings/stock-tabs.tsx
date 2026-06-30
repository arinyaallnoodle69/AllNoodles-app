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
    <div className="mb-0 mt-0 w-full lg:mb-6 lg:mt-4">
      <div className="flex border-b border-slate-200 bg-white lg:grid lg:grid-cols-3 lg:rounded-xl lg:border lg:border-slate-200/50 lg:bg-slate-100/80 lg:p-1 lg:shadow-sm lg:backdrop-blur-sm">
        {tabs.map((tab) => {
          const isActive = current === tab.key;
          const isLoading = isPending && targetKey === tab.key;

          return (
            <button
              key={tab.href}
              disabled={isPending}
              onClick={() => handleTabClick(tab.href, tab.key)}
              className={`relative flex flex-1 items-center justify-center gap-1.5 px-1 py-3 text-center text-[11px] font-black transition-all duration-200 cursor-pointer disabled:opacity-85 sm:px-4 sm:py-3 sm:text-sm lg:rounded-lg lg:py-2.5 ${
                isActive
                  ? "bg-[#4A148C] text-white shadow-sm lg:scale-[1.02]"
                  : "text-slate-500 hover:text-slate-900 lg:text-slate-600"
              }`}
            >
              {isLoading && <Loader2 className={`h-3 w-3 animate-spin ${isActive ? "text-white" : "text-[#4A148C]"}`} />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
