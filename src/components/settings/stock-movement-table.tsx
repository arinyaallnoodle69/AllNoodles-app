"use client";

import Image from "next/image";
import { useState } from "react";
import {
  Camera,
  FileImage,
  Package2,
  X,
  CalendarDays,
  Building2,
  Hash,
  ArrowRightLeft,
  ArrowUpCircle,
  ArrowDownCircle,
  RotateCcw,
  Settings2,
} from "lucide-react";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import type { StockMovementRow } from "@/lib/stock/admin";

type StockMovementTableProps = {
  movementRows: StockMovementRow[];
};

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", {
    maximumFractionDigits: 3,
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(date);
  const [year, month, day] = datePart.split("-");
  const timePart = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date);
  return `${day}/${month}/${Number.parseInt(year, 10) + 543} ${timePart}`;
}

function getMovementTone(movementType: string) {
  if (movementType === "receipt") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (movementType === "issue") return "bg-rose-50 text-rose-700 border-rose-100";
  if (movementType === "adjustment") return "bg-amber-50 text-amber-700 border-amber-100";
  return "bg-slate-50 text-slate-600 border-slate-100";
}

function getMovementIcon(movementType: string) {
  if (movementType === "receipt") return <ArrowDownCircle className="h-4 w-4" />;
  if (movementType === "issue") return <ArrowUpCircle className="h-4 w-4" />;
  if (movementType === "adjustment") return <RotateCcw className="h-4 w-4" />;
  return <Settings2 className="h-4 w-4" />;
}

function getMovementLabel(movementType: string) {
  if (movementType === "receipt") return "รับเข้า";
  if (movementType === "issue") return "ขาย/ตัดสต็อก";
  if (movementType === "adjustment") return "คืนสต็อก/ปรับปรุง";
  return "ปรับสต็อก";
}

function groupMovementsByDate(rows: StockMovementRow[]) {
  const groups = new Map<string, StockMovementRow[]>();
  for (const row of rows) {
    const date = formatDateTime(row.createdAt).split(' ')[0];
    const bucket = groups.get(date) ?? [];
    bucket.push(row);
    groups.set(date, bucket);
  }
  return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
}

export function StockMovementTable({ movementRows }: StockMovementTableProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const groupedMovements = groupMovementsByDate(movementRows);

  return (
    <>
      <div className="space-y-8">
        {groupedMovements.length > 0 ? (
          groupedMovements.map((group) => (
            <section key={group.date} className="overflow-hidden rounded-2xl border border-[#003366]/12 bg-white shadow-[0_4px_20px_rgba(27,27,33,0.05)]">
              {/* Daily Header Bar - Matches Report Style */}
              <div className="border-b border-[#003366]/12 bg-[#003366] px-5 py-3">
                <p className="text-sm font-bold uppercase tracking-[0.12em] text-white/90">
                  วันที่ {group.date}
                </p>
              </div>

              {/* Mobile View */}
              <div className="divide-y divide-[#003366]/10 md:hidden">
                {group.items.map((m) => (
                  <div key={m.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{m.sku}</p>
                        <p className="text-base font-bold text-slate-800 leading-tight">{m.productName}</p>
                      </div>
                      <span className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getMovementTone(m.movementType)}`}>
                        {getMovementLabel(m.movementType)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">จำนวน</p>
                        <p className={`text-base font-black ${m.quantityDelta > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {m.quantityDelta > 0 ? "+" : ""}{formatQuantity(m.quantityDelta)}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">สต็อกหลังปรับ</p>
                        <p className="text-base font-black text-slate-700">{formatQuantity(m.stockAfter)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                      <span className="text-[11px] font-medium text-slate-400 tabular-nums">
                        เวลา {formatDateTime(m.createdAt).split(' ')[1]} น.
                      </span>
                      {m.receiptUrl && (
                        <button onClick={() => setPreviewUrl(m.receiptUrl)} className="text-[11px] font-bold text-[#003366] flex items-center gap-1.5 bg-[#003366]/5 px-2.5 py-1 rounded-md active:scale-95">
                          <Camera className="h-3.5 w-3.5" />
                          ดูบิล
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View - STRICT REPORT STYLE */}
              <div className="hidden md:block">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-[#003366]/[0.04]">
                      <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 border-r border-[#003366]/10">เวลา</th>
                      <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 border-r border-[#003366]/10">รหัสสินค้า</th>
                      <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 border-r border-[#003366]/10">ชื่อสินค้า</th>
                      <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 border-r border-[#003366]/10 text-center">ประเภท</th>
                      <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 border-r border-[#003366]/10 text-center">จำนวนปรับ</th>
                      <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 border-r border-[#003366]/10 text-center">ยอดหลังปรับ</th>
                      <th className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 text-center">อ้างอิง / บิล</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#003366]/10">
                    {group.items.map((m) => (
                      <tr key={m.id} className="bg-white transition-colors hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-500 tabular-nums border-r border-[#003366]/10">
                          {formatDateTime(m.createdAt).split(' ')[1]}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-slate-400 border-r border-[#003366]/10">
                          {m.sku}
                        </td>
                        <td className="px-4 py-3 border-r border-[#003366]/10">
                          <span className="text-sm font-bold text-slate-800">{m.productName}</span>
                        </td>
                        <td className="px-4 py-3 text-center border-r border-[#003366]/10">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getMovementTone(m.movementType)}`}>
                            {getMovementLabel(m.movementType)}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-center font-bold tabular-nums border-r border-[#003366]/10 ${m.quantityDelta > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {m.quantityDelta > 0 ? "+" : ""}{formatQuantity(m.quantityDelta)}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-700 tabular-nums border-r border-[#003366]/10">
                          {formatQuantity(m.stockAfter)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-3">
                            <span className="text-xs font-bold text-[#003366] opacity-60 truncate max-w-[100px]">
                              {m.referenceNumber || m.notes || "-"}
                            </span>
                            {m.receiptUrl && (
                              <button
                                onClick={() => setPreviewUrl(m.receiptUrl)}
                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#003366]/20 bg-white text-[#003366] hover:bg-[#003366] hover:text-white transition-all active:scale-95 shadow-sm"
                                title="ดูรูปบิล"
                              >
                                <Camera className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        ) : (
          <SettingsPanel>
            <SettingsPanelBody>
              <SettingsEmptyState className="py-20">
                <Boxes className="h-12 w-12 text-slate-200 mb-4" strokeWidth={1.5} />
                ยังไม่มีข้อมูลการเคลื่อนไหวในขณะนี้
              </SettingsEmptyState>
            </SettingsPanelBody>
          </SettingsPanel>
        )}
      </div>

      {/* Modern Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/95 p-4 sm:p-10 animate-in fade-in duration-300 backdrop-blur-sm">
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute right-6 top-6 z-10 flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-white/10 text-white transition hover:bg-white/20 active:scale-90"
          >
            <X className="h-8 w-8" strokeWidth={3} />
          </button>

          <div className="relative h-full w-full max-w-5xl overflow-hidden rounded-[3rem] bg-white/5 shadow-[0_0_80px_rgba(0,0,0,0.5)] border border-white/10">
            <Image
              src={previewUrl}
              alt="Full receipt preview"
              fill
              className="object-contain p-4"
              priority
              unoptimized
            />
          </div>
          
          <button
            onClick={() => setPreviewUrl(null)}
            className="mt-8 rounded-[2rem] bg-white px-16 py-5 text-xl font-black text-slate-950 shadow-2xl transition active:scale-[0.98] hover:bg-slate-50"
          >
            ปิดหน้าต่างนี้
          </button>
        </div>
      )}
    </>
  );
}

// Sub-icons for types (added to main import list above)
import { Boxes } from "lucide-react";
