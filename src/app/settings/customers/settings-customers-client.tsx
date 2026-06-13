"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusCircle, Search, Upload } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { CustomerForm } from "@/components/settings/customer-form";
import { CustomerListPanel } from "@/components/settings/customer-list-panel";
import { CustomerSettingsTabs } from "@/components/settings/customer-settings-tabs";
import { SettingsShell } from "@/components/settings/settings-shell";
import { CustomerImportModal } from "@/components/settings/customer-import-modal";
import type { SettingsCustomer, SettingsVehicle } from "@/lib/settings/admin";
import type { WarehouseOption } from "@/lib/warehouses";

type SettingsCustomersPageClientProps = {
  initialCustomers: SettingsCustomer[];
  vehicles: SettingsVehicle[];
  warehouses: WarehouseOption[];
  nextCustomerCode: string;
  editingCustomer: SettingsCustomer | null;
  createParam?: string;
};

type CustomerSearchBoxProps = {
  onSearch: (value: string) => void;
  value: string;
};

function CustomerSearchBox({ onSearch, value }: CustomerSearchBoxProps) {
  return (
    <label className="relative block">
      <span className="sr-only">ค้นหาร้านค้า</span>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
        strokeWidth={2.2}
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="ค้นหาชื่อร้าน รหัส หรือที่อยู่..."
        className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#AA00FF]/50 focus:ring-4 focus:ring-[#AA00FF]/10"
      />
    </label>
  );
}

export function SettingsCustomersPageClient({
  initialCustomers,
  vehicles,
  warehouses,
  nextCustomerCode,
  editingCustomer,
  createParam,
}: SettingsCustomersPageClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);

  return (
    <SettingsShell
      current="customers"
      title="จัดการร้านค้า"
      description="เพิ่มร้านค้า กำหนดที่อยู่ ผูกราคาขายเฉพาะราย และเลือกรถประจำร้านได้จากหน้านี้"
      floatingSubmit={false}
      hideHeader
      >
	      <div className="sticky top-0 z-40 -mx-3 mb-4 hidden border-b border-[#E1BEE7] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(31,42,68,0.08)] backdrop-blur lg:block">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-black text-[#8E24AA]">จัดการร้านค้า</p>
            <p className="text-xs font-semibold text-[#667085]">
              แสดง {initialCustomers.length.toLocaleString("th-TH")} ร้านค้า
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] lg:w-[48rem]">
            <CustomerSearchBox value={searchTerm} onSearch={setSearchTerm} />
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#AA00FF]/30 bg-white px-4 text-sm font-black text-[#8E24AA] transition hover:bg-slate-50 active:scale-[0.98]"
            >
              <Upload className="h-4.5 w-4.5 text-[#8E24AA]" strokeWidth={2.4} />
              นำเข้าข้อมูล
            </button>
            <Link
              href="/settings/customers?create=1"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#AA00FF] to-[#8E24AA] px-4 text-sm font-black text-[#8E24AA] shadow-[0_12px_26px_rgba(170, 0, 255,0.3)] transition hover:brightness-105 active:scale-[0.98]"
            >
              <PlusCircle className="h-4.5 w-4.5 text-[#8E24AA]" strokeWidth={2.4} />
              เพิ่มร้านค้า
            </Link>
          </div>
        </div>
	      </div>

        <MobileSearchDrawer title="ค้นหาร้านค้า">
          <div className="space-y-4 p-4">
            <CustomerSearchBox value={searchTerm} onSearch={setSearchTerm} />
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="w-full flex h-12 items-center justify-center gap-2 rounded-lg border border-[#AA00FF]/30 bg-white px-4 text-sm font-black text-[#8E24AA] active:scale-95 transition-all"
            >
              <Upload className="h-4.5 w-4.5" strokeWidth={2.4} />
              นำเข้าข้อมูลจาก CSV
            </button>
          </div>
        </MobileSearchDrawer>

        <Link
          href="/settings/customers?create=1"
          aria-label="เพิ่มร้านค้า"
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-[#AA00FF] to-[#8E24AA] text-[#8E24AA] shadow-[0_14px_32px_rgba(170, 0, 255,0.4)] transition hover:brightness-105 active:scale-95 lg:hidden"
        >
          <PlusCircle className="h-7 w-7 text-[#8E24AA]" strokeWidth={2.4} />
        </Link>

		      <div className="-mx-4 flex w-[calc(100%+2rem)] flex-col gap-6 md:mx-0 md:w-full">
	        <CustomerSettingsTabs current="customers" />

	        <CustomerListPanel 
	          customers={initialCustomers} 
	          vehicles={vehicles} 
	          warehouses={warehouses}
	          searchTerm={searchTerm}
	        />
	      </div>

      {createParam === "1" ? (
        <CustomerForm
          defaultCode={nextCustomerCode}
          returnHref="/settings/customers"
          vehicles={vehicles}
          warehouses={warehouses}
        />
      ) : null}
      {editingCustomer ? (
        <CustomerForm
          initialCustomer={editingCustomer}
          returnHref="/settings/customers"
          vehicles={vehicles}
          warehouses={warehouses}
        />
      ) : null}
      <CustomerImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
    </SettingsShell>
  );
}
