"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowUpRight, ChevronRight, Gauge, KeyRound, Save, Search, X, Clock, Factory, Package2, Store, Truck, Warehouse } from "lucide-react";
import { LineAppIcon } from "@/components/icons/line-app-icon";
import { AppSidebarLayout } from "@/components/app-sidebar";

type SettingsSection = "customerData" | "customers" | "loginPin" | "performance" | "products" | "vehicles" | "suppliers" | "orderWindow" | "stock" | "warehouses";

function getSectionIcon(current?: SettingsSection) {
  if (!current) return null;
  switch (current) {
    case "products":
      return Package2;
    case "customers":
      return Store;
    case "suppliers":
      return Factory;
    case "customerData":
      return LineAppIcon;
    case "vehicles":
      return Truck;
    case "warehouses":
      return Warehouse;
    case "orderWindow":
      return Clock;
    case "loginPin":
      return KeyRound;
    case "performance":
      return Gauge;
    default:
      return null;
  }
}

type Props = {
  title: string;
  description?: string;
  titleIcon?: LucideIcon;
  current?: SettingsSection;
  children: React.ReactNode;
  showSearch?: boolean;
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  initialSearchTerm?: string;
  floatingSubmit?: boolean;
  headerContent?: React.ReactNode;
  headerContentPlacement?: "row" | "below";
  hideHeader?: boolean;
  fullWidthMobile?: boolean;
};

function getSwitchLink(current: SettingsSection) {
  switch (current) {
    case "customers":
      return { href: "/settings/customers/pricing", label: "ตั้งค่าราคาสินค้าร้านค้า" };
    default:
      return null;
  }
}

function getSubmitFormId(current: SettingsSection) {
  switch (current) {
    case "products":
      return "product-form";
    case "customers":
      return "customer-form";
    case "suppliers":
      return "supplier-form";
    case "vehicles":
      return "vehicle-form";
    case "warehouses":
      return "warehouse-form";
    case "orderWindow":
      return "order-window-form";
    default:
      return null;
  }
}

function getSubmitLabel(current: SettingsSection) {
  switch (current) {
    case "orderWindow":
      return "บันทึกเวลา";
    default:
      return "บันทึก";
  }
}

export function SettingsShell({
  title,
  description,
  titleIcon: TitleIcon,
  current,
  children,
  showSearch = false,
  searchPlaceholder = "ค้นหา...",
  onSearch,
  initialSearchTerm = "",
  floatingSubmit = true,
  headerContent,
  headerContentPlacement = "below",
  hideHeader = false,
  fullWidthMobile = false,
}: Props) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const switchLink = current ? getSwitchLink(current) : null;
  const submitFormId = current ? getSubmitFormId(current) : null;
  const submitLabel = current ? getSubmitLabel(current) : null;
  const resolvedIcon = TitleIcon || (current ? getSectionIcon(current) : null);

  const handleSearchToggle = () => {
    setIsSearchOpen(!isSearchOpen);
    if (isSearchOpen) {
      setSearchTerm("");
      if (onSearch) onSearch("");
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (onSearch) onSearch(value);
  };

  const handleOpenMobileSettingsMenu = () => {
    window.dispatchEvent(new CustomEvent("open-mobile-settings-menu"));
  };

  const inner = (
    <div className="min-h-screen bg-background font-[family:var(--font-sarabun)] text-slate-900">
      {!hideHeader ? (
      <div className="relative z-20 hidden overflow-hidden border-b border-[#E1BEE7] bg-white text-[#4A148C] lg:block">
        <div className="relative z-10 mx-auto w-full max-w-[88rem] px-4 py-1.5 lg:px-8 lg:py-4">
          <div className="flex flex-col gap-0.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-2 lg:gap-4">
              {resolvedIcon ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E1BEE7] bg-white ring-1 ring-[#EA80FC]/15 lg:h-14 lg:w-14 lg:rounded-2xl">
                  {React.createElement(resolvedIcon as React.ComponentType<{ className?: string; strokeWidth?: number | string }>, {
                    className: "h-3.5 w-3.5 text-[#4A148C] lg:h-6 lg:w-6",
                    strokeWidth: 2,
                  })}
                </span>
              ) : null}
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#EA80FC] lg:text-xs">
                  {current ? "เมนูตั้งค่า" : "ระบบจัดการ"}
                </p>
                <h1 className="mt-0 text-base font-bold tracking-tight text-[#4A148C] lg:mt-1 lg:text-3xl">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-0 break-words text-[10px] leading-tight text-[#667085] lg:mt-1.5 lg:text-sm">
                    {description}
                  </p>
                ) : null}
                <div className="mt-3 hidden h-px w-52 max-w-full bg-gradient-to-r from-[#EA80FC] via-[#EA80FC] to-transparent lg:block" />
              </div>
            </div>

            <div className="flex items-center gap-2 self-start lg:self-auto lg:gap-3">
              {showSearch && (
                <button
                  onClick={handleSearchToggle}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border border-[#E1BEE7] bg-white transition ${
                    isSearchOpen ? "text-[#4A148C] ring-2 ring-[#EA80FC]/25" : "text-[#667085] hover:bg-slate-50 hover:text-[#4A148C]"
                }`}
                >
                  {isSearchOpen ? <X className="h-5 w-5" strokeWidth={2.5} /> : <Search className="h-5 w-5" strokeWidth={2.2} />}
                </button>
              )}

              {switchLink ? (
                <Link
                  href={switchLink.href}
                  className="inline-flex items-center gap-2 rounded-full border border-[#E1BEE7] bg-white px-4 py-2 text-sm font-medium text-[#4A148C] transition hover:border-[#EA80FC]/60 hover:bg-slate-50"
                >
                  <span className="hidden sm:inline">{switchLink.label}</span>
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
                </Link>
              ) : null}
              {headerContentPlacement === "row" ? headerContent : null}
            </div>
          </div>

          {/* Search Bar Slide Down */}
          {showSearch && (
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isSearchOpen ? "mt-6 max-h-20 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#667085]" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full rounded-2xl border border-[#E1BEE7] bg-white py-4 pl-12 pr-4 text-base text-[#4A148C] placeholder:text-[#667085] outline-none focus:border-[#EA80FC] focus:ring-2 focus:ring-[#EA80FC]/15"
                  autoFocus={isSearchOpen}
                />
              </div>
            </div>
          )}

          {headerContentPlacement === "below" && headerContent ? <div className="mt-6">{headerContent}</div> : null}
        </div>
      </div>
      ) : null}

      <main className={`mx-auto min-w-0 w-full max-w-[88rem] ${fullWidthMobile ? "px-0 sm:px-4" : "px-4"} pb-28 lg:px-3 lg:pb-32 ${hideHeader ? "py-0 lg:py-0" : "py-3 lg:py-4"}`}>
        {current ? (
          <div className={`${fullWidthMobile ? "" : "-mx-4"} sticky top-[68px] z-30 border-b border-[#E1BEE7]/35 bg-white/95 backdrop-blur px-3 pb-2.5 pt-2.5 lg:hidden`}>
            <button
              type="button"
              onClick={handleOpenMobileSettingsMenu}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] font-black text-[#4A148C] transition active:scale-[0.98]"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.7} />
              <span>กลับหน้าตั้งค่า</span>
            </button>
          </div>
        ) : null}
        {/* Mobile Breadcrumb */}
        {current && !hideHeader ? (
          <nav className="hidden">
            <Link href="/settings" className="text-slate-400 transition hover:text-[#4A148C]">ตั้งค่า</Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" strokeWidth={3} />
            <span className="text-[#4A148C]">{title}</span>
          </nav>
        ) : null}
        {children}
      </main>

      {floatingSubmit && submitFormId && submitLabel ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-end p-4 lg:bottom-0 lg:p-6">
          <button
            type="submit"
            form={submitFormId}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#4A148C] px-5 py-3 text-sm font-medium text-white shadow-[0_18px_40px_rgba(142, 36, 170,0.32)] transition hover:bg-[#4A148C] lg:px-6"
          >
            <Save className="h-4 w-4" strokeWidth={2.2} />
            {submitLabel}
          </button>
        </div>
      ) : null}
    </div>
  );

  return <AppSidebarLayout>{inner}</AppSidebarLayout>;
}
