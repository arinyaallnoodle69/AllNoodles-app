"use client";

import { useEffect, useRef, useState } from "react";
import { FolderTree, Package2, Tag } from "lucide-react";
import { ProductCategoryManager } from "@/components/settings/product-category-manager";
import { ProductBrandManager } from "@/components/settings/product-brand-manager";
import { ProductFilterClient } from "@/components/settings/product-filter-client";
import type {
  SettingsProduct,
  SettingsProductCategory,
  SettingsProductBrand,
  SettingsSupplier,
} from "@/lib/settings/admin";

type ProductSettingsTab = "products" | "categories" | "brands";

type ProductSettingsTabsProps = {
  products: SettingsProduct[];
  categories: SettingsProductCategory[];
  brands: SettingsProductBrand[];
  suppliers: SettingsSupplier[];
  nextSku: string;
  initialTab: ProductSettingsTab;
  initialCreate?: boolean;
  initialEditProduct?: SettingsProduct | null;
};

const tabs: Array<{
  key: ProductSettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { key: "products", label: "ตารางสินค้า", icon: Package2 },
  { key: "categories", label: "จัดการหมวดหมู่", icon: FolderTree },
  { key: "brands", label: "จัดการแบรนด์", icon: Tag },
];

function getTabFromLocation() {
  if (typeof window === "undefined") return "products";

  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab === "categories" && params.get("create") !== "1" && !params.get("edit")) {
    return "categories";
  }
  if (tab === "brands" && params.get("create") !== "1" && !params.get("edit")) {
    return "brands";
  }
  return "products";
}

export function ProductSettingsTabs({
  products,
  categories,
  brands,
  suppliers,
  nextSku,
  initialTab,
  initialCreate,
  initialEditProduct,
}: ProductSettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<ProductSettingsTab>(initialTab);
  const [contentTab, setContentTab] = useState<ProductSettingsTab>(initialTab);
  const switchFrameRef = useRef<number | null>(null);

  useEffect(() => {
    function handlePopState() {
      const nextTab = getTabFromLocation();
      setActiveTab(nextTab);
      setContentTab(nextTab);
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (switchFrameRef.current !== null) {
        window.cancelAnimationFrame(switchFrameRef.current);
      }
    };
  }, []);

  function selectTab(nextTab: ProductSettingsTab) {
    if (nextTab === activeTab) return;

    setActiveTab(nextTab);

    const href =
      nextTab === "products"
        ? "/settings/products"
        : `/settings/products?tab=${nextTab}`;
    window.history.pushState({}, "", href);
    window.scrollTo({ top: 0, behavior: "auto" });

    if (switchFrameRef.current !== null) {
      window.cancelAnimationFrame(switchFrameRef.current);
    }

    switchFrameRef.current = window.requestAnimationFrame(() => {
      setContentTab(nextTab);
      switchFrameRef.current = null;
    });
  }

  const tabSwitcher = (
    <div className="mx-4 hidden rounded-lg border border-[#E1BEE7] bg-white p-1 shadow-sm sm:mx-0 lg:inline-flex">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => selectTab(tab.key)}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
              isActive
                ? "bg-[#4A148C] text-white shadow-[0_10px_24px_rgba(142,36,170,0.18)]"
                : "text-[#4A148C] hover:bg-slate-50"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2.1} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="flex border-b border-slate-200 bg-white lg:hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition active:scale-[0.98] ${
                isActive ? "text-[#4A148C]" : "text-slate-500"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
              <span className="text-[11px] font-black leading-tight">{tab.label}</span>
              <span
                className={`absolute inset-x-0 bottom-0 mx-auto h-0.5 w-full bg-[#4A148C] transition-transform duration-200 ${
                  isActive ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="pt-0">
        {contentTab === "categories" ? (
          <div key="categories" className="animate-[productSettingsTabIn_160ms_ease-out]">
            <div className="mx-4 mb-4 sm:mx-0">{tabSwitcher}</div>
            <div className="px-0 sm:px-0">
              <ProductCategoryManager categories={categories} products={products} />
            </div>
          </div>
        ) : contentTab === "brands" ? (
          <div key="brands" className="animate-[productSettingsTabIn_160ms_ease-out]">
            <div className="mx-4 mb-4 sm:mx-0">{tabSwitcher}</div>
            <div className="px-0 sm:px-0">
              <ProductBrandManager brands={brands} />
            </div>
          </div>
        ) : (
          <div key="products" className="animate-[productSettingsTabIn_160ms_ease-out]">
            <ProductFilterClient
              allProducts={products}
              baseListHref="/settings/products"
              categories={categories}
              brands={brands}
              suppliers={suppliers}
              nextSku={nextSku}
              initialCreate={initialCreate}
              initialEditProduct={initialEditProduct}
            >
              {tabSwitcher}
            </ProductFilterClient>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes productSettingsTabIn {
          from {
            opacity: 0.72;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
