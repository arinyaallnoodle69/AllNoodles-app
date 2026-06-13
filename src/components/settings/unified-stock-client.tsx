"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StockList } from "@/components/settings/stock-list";
import { StockHistoryClient } from "@/app/stock/history/stock-history-client";
import { StockIssuesClient } from "@/app/stock/issues/stock-issues-client";
import { loadMoreStockHistoryAction, loadMoreStockIssuesAction } from "@/app/stock/pagination-actions";
import type { StockProductOption, StockSupplierOption, StockHistoryRow } from "@/lib/stock/admin";
import type { StockIssueRow } from "@/lib/stock/issues";

type UnifiedStockClientProps = {
  products: StockProductOption[];
  suppliers: StockSupplierOption[];
  warehouses: { id: string; name: string; slug: string }[];
  initialTab: "stock" | "history" | "issues";
  initialHistory: StockHistoryRow[];
  initialIssues: StockIssueRow[];
  initialWarehouseId: string;
  initialDate: string;
};

export function UnifiedStockClient({
  products,
  suppliers,
  warehouses,
  initialTab,
  initialHistory,
  initialIssues,
  initialWarehouseId,
  initialDate,
}: UnifiedStockClientProps) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"stock" | "history" | "issues">(initialTab);

  // Lazy loaded states
  const [historyData, setHistoryData] = useState<StockHistoryRow[] | null>(
    initialTab === "history" ? initialHistory : null
  );
  const [issuesData, setIssuesData] = useState<StockIssueRow[] | null>(
    initialTab === "issues" ? initialIssues : null
  );

  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);

  // Sync tab from searchParams on load/history changes
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "stock" || tabParam === "history" || tabParam === "issues") {
      setActiveTab(tabParam as "stock" | "history" | "issues");
    }
  }, [searchParams]);

  // Load history client-side if needed
  useEffect(() => {
    if (activeTab === "history" && !historyData) {
      const fetchHistory = async () => {
        setIsLoadingHistory(true);
        try {
          const warehouse = searchParams.get("warehouse") || "all";
          const res = await loadMoreStockHistoryAction(0, 50, warehouse);
          setHistoryData(res);
        } catch (e) {
          console.error("Failed client-side history fetch", e);
        } finally {
          setIsLoadingHistory(false);
        }
      };
      fetchHistory();
    }
  }, [activeTab, historyData, searchParams]);

  // Load issues client-side if needed
  useEffect(() => {
    if (activeTab === "issues" && !issuesData) {
      const fetchIssues = async () => {
        setIsLoadingIssues(true);
        try {
          const warehouse = searchParams.get("warehouse") || "all";
          const date = searchParams.get("date") || initialDate;
          const res = await loadMoreStockIssuesAction(0, 50, warehouse, date);
          setIssuesData(res);
        } catch (e) {
          console.error("Failed client-side issues fetch", e);
        } finally {
          setIsLoadingIssues(false);
        }
      };
      fetchIssues();
    }
  }, [activeTab, issuesData, initialDate, searchParams]);

  const handleTabChange = (key: "stock" | "history" | "issues") => {
    setActiveTab(key);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", key);
    window.history.pushState({}, "", `/stock?${params.toString()}`);
  };

  const selectedWarehouseId = searchParams.get("warehouse") || initialWarehouseId;
  const selectedDate = searchParams.get("date") || initialDate;

  if (activeTab === "stock") {
    return (
      <StockList
        products={products}
        suppliers={suppliers}
        warehouses={warehouses}
        baseHref="/stock"
        onChangeTab={handleTabChange}
      />
    );
  }

  if (activeTab === "history") {
    if (isLoadingHistory || !historyData) {
      return (
        <div className="flex flex-col items-center justify-center py-20 min-h-[400px]">
          <Loader2 className="h-10 w-10 animate-spin text-[#8E24AA]" strokeWidth={2.5} />
          <p className="mt-4 text-sm font-black uppercase tracking-widest text-[#8E24AA] animate-pulse">กำลังโหลดประวัติรับเข้า...</p>
        </div>
      );
    }

    return (
      <StockHistoryClient
        history={historyData}
        suppliers={suppliers}
        warehouses={warehouses}
        initialWarehouseId={selectedWarehouseId}
        onChangeTab={handleTabChange}
      />
    );
  }

  if (activeTab === "issues") {
    if (isLoadingIssues || !issuesData) {
      return (
        <div className="flex flex-col items-center justify-center py-20 min-h-[400px]">
          <Loader2 className="h-10 w-10 animate-spin text-[#8E24AA]" strokeWidth={2.5} />
          <p className="mt-4 text-sm font-black uppercase tracking-widest text-[#8E24AA] animate-pulse">กำลังโหลดประวัติเบิกออก...</p>
        </div>
      );
    }

    return (
      <StockIssuesClient
        issues={issuesData}
        initialDate={selectedDate}
        warehouses={warehouses}
        initialWarehouseId={selectedWarehouseId}
        onChangeTab={handleTabChange}
      />
    );
  }

  return null;
}
