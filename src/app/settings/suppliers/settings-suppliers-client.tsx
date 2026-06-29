"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Search, MapPin, PencilLine, Trash2, Factory } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { SettingsShell } from "@/components/settings/settings-shell";
import { SupplierForm } from "@/components/settings/supplier-form";
import { deleteSupplierAction } from "@/components/settings/suppliers-delete-action";
import type { SettingsSupplier } from "@/lib/settings/admin";

type Props = {
  initialSuppliers: SettingsSupplier[];
  nextSupplierCode: string;
  editingSupplier: SettingsSupplier | null;
  createParam?: string;
};

export function SettingsSuppliersPageClient({
  initialSuppliers,
  nextSupplierCode,
  editingSupplier,
  createParam,
}: Props) {
  const [isDeleting, startDeleteTransition] = useTransition();

  async function handleDelete(id: string, name: string) {
    if (!confirm(`คุณต้องการลบผู้ขาย "${name}" ใช่หรือไม่?`)) return;
    startDeleteTransition(async () => {
      const res = await deleteSupplierAction(id);
      if (!res.success) alert(res.error ?? "ลบไม่สำเร็จ");
    });
  }

  const [searchTerm, setSearchTerm] = useState("");
  const showCreateForm = createParam !== undefined;

  const filteredSuppliers = initialSuppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <SettingsShell
      current="suppliers"
      title="จัดการผู้ขาย"
      description="เพิ่ม แก้ไข และจัดการข้อมูลผู้ขาย (Suppliers)"
      titleIcon={Factory}
      floatingSubmit={false}
      hideHeader
    >
      <div className="sticky top-0 z-40 -mx-3 mb-4 hidden border-b border-[#E1BEE7] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(31,42,68,0.08)] backdrop-blur lg:block">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-black text-[#4A148C]">จัดการผู้ขาย</p>
            <p className="text-xs font-semibold text-[#667085]">
              แสดง {filteredSuppliers.length.toLocaleString("th-TH")} จาก {initialSuppliers.length.toLocaleString("th-TH")} รายการ
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(14rem,1fr)_auto] lg:w-[42rem]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="ค้นหาชื่อผู้ขายหรือรหัส"
                className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-semibold text-[#4A148C] outline-none transition placeholder:text-[#667085] focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
              />
            </label>

            <Link
              href="/settings/suppliers?create"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#4A148C] px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(142, 36, 170,0.22)] transition hover:bg-[#4A148C] active:scale-[0.98]"
            >
              <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
              เพิ่มผู้ขาย
            </Link>
          </div>
        </div>
      </div>

      <MobileSearchDrawer title="ค้นหาผู้ขาย">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="ค้นหาชื่อผู้ขายหรือรหัส"
            className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-semibold text-[#4A148C] outline-none transition placeholder:text-[#667085] focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
          />
        </label>
      </MobileSearchDrawer>

      <Link
        href="/settings/suppliers?create"
        aria-label="เพิ่มผู้ขาย"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#4A148C] text-white shadow-[0_14px_32px_rgba(142, 36, 170,0.32)] transition active:scale-95 lg:hidden"
      >
        <Plus className="h-7 w-7" strokeWidth={2.6} />
      </Link>

      <div className="space-y-6">
        {/* Suppliers Grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredSuppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white transition-all hover:border-[#4A148C]/30 hover:shadow-xl hover:shadow-slate-200/50"
            >
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-500">
                        {supplier.code}
                      </span>
                    </div>
                    <h3 className="mt-1 truncate text-lg font-bold text-slate-900 group-hover:text-[#4A148C]">
                      {supplier.name}
                    </h3>
                  </div>
                  
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-100">
                    <Link
                      href={`/settings/suppliers?edit=${supplier.id}`}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition hover:bg-[#4A148C]/20 hover:text-[#4A148C]"
                      title="แก้ไข"
                    >
                      <PencilLine className="h-4.5 w-4.5" />
                    </Link>
                    <button
                      onClick={() => handleDelete(supplier.id, supplier.name)}
                      disabled={isDeleting}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      title="ลบ"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 text-sm text-slate-500">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                  <p className="line-clamp-2 leading-relaxed">
                    {supplier.address || "ไม่ได้ระบุที่อยู่"}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {initialSuppliers.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                <Factory className="h-10 w-10" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">ยังไม่มีข้อมูลผู้ขาย</h3>
              <p className="mt-1 text-slate-500">เพิ่มผู้ขายเพื่อเริ่มบันทึกการรับซื้อสินค้า</p>
            </div>
          )}
        </div>
      </div>

      {/* Forms */}
      {showCreateForm && (
        <SupplierForm
          defaultCode={nextSupplierCode}
          returnHref="/settings/suppliers"
        />
      )}
      {editingSupplier && (
        <SupplierForm
          initialSupplier={editingSupplier}
          returnHref="/settings/suppliers"
        />
      )}
    </SettingsShell>
  );
}
