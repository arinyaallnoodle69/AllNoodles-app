"use client";

import React, { useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import {
  BadgeDollarSign,
  ChevronDown,
  ChevronRight,
  Package,
  ShoppingCart,
  Store,
  Wallet,
  X,
} from "lucide-react";
import type { ProductSalesRow } from "@/lib/reports/product-sales";
import { formatDisplayUnit } from "@/app/order/customer/unit-label";

// Helpers
function fmt(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function fmtMoney(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtPercent(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "%";
}

function RankBadge({ rank }: { rank: number }) {
  const base =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white shadow-md";
  if (rank === 1)
    return (
      <span className={base} style={{ background: "linear-gradient(135deg,#FFD700 0%,#B8860B 100%)" }}>
        1
      </span>
    );
  if (rank === 2)
    return (
      <span className={base} style={{ background: "linear-gradient(135deg,#C0C0C0 0%,#708090 100%)" }}>
        2
      </span>
    );
  if (rank === 3)
    return (
      <span className={base} style={{ background: "linear-gradient(135deg,#CD7F32 0%,#8B4513 100%)" }}>
        3
      </span>
    );
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-500">
      {rank}
    </span>
  );
}

// ─── Desktop Interactive Table ──────────────────────────────────────────────────

export function ProductSalesDesktopTable({
  rows,
  startRank,
  summary,
  totalMarginPercent,
}: {
  rows: ProductSalesRow[];
  startRank: number;
  summary?: {
    totalQty: number;
    totalCost: number;
    totalRevenue: number;
    netProfit: number;
  };
  totalMarginPercent?: number;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="hidden overflow-x-auto lg:block">
      <table className="w-full table-fixed border-collapse text-left">
        <colgroup>
          <col style={{ width: "7%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "27%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "9%" }} />
        </colgroup>
        <thead>
          <tr className="bg-slate-50/80">
            <th className="whitespace-nowrap px-4 py-4 pl-5 text-center text-xs font-black uppercase tracking-widest text-slate-400">
              ลำดับ
            </th>
            <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-black uppercase tracking-widest text-slate-400">
              รหัสสินค้า
            </th>
            <th className="whitespace-nowrap px-4 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-400">
              สินค้า
            </th>
            <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-black uppercase tracking-widest text-slate-400">
              จำนวน
            </th>
            <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-black uppercase tracking-widest text-slate-400">
              หน่วย
            </th>
            <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-black uppercase tracking-widest text-slate-400">
              ต้นทุน
            </th>
            <th
              className="whitespace-nowrap px-4 py-4 text-center text-xs font-black uppercase tracking-widest text-[#4A148C]"
              style={{ background: "rgba(212,163,115,0.03)" }}
            >
              จำนวนเงิน
            </th>
            <th className="whitespace-nowrap px-4 py-4 text-center text-xs font-black uppercase tracking-widest text-slate-400">
              กำไรสุทธิ
            </th>
            <th className="whitespace-nowrap px-4 py-4 pr-5 text-center text-xs font-black uppercase tracking-widest text-slate-400">
              กำไร (%)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#4A148C]/24">
          {rows.map((row, index) => {
            const globalRank = startRank + index;
            const isExpanded = expandedIds.has(row.productId);
            const netProfit = row.totalRevenue - row.totalCost;
            const profitColor = netProfit >= 0 ? "text-emerald-600" : "text-red-500";
            const margin = row.totalRevenue > 0 ? (netProfit / row.totalRevenue) * 100 : 0;
            const storeCount = row.stores?.length ?? 0;

            return (
              <React.Fragment key={row.productId}>
                {/* Main Product Row */}
                <tr
                  onClick={() => toggleExpand(row.productId)}
                  className={`group cursor-pointer transition-colors ${
                    isExpanded ? "bg-[#FBF7FC]" : "hover:bg-slate-50/60"
                  }`}
                >
                  <td className="px-3 py-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        aria-label={isExpanded ? "ย่อรายละเอียดร้านค้า" : "ขยายดูรายละเอียดร้านค้า"}
                        className={`flex h-6 w-6 items-center justify-center rounded-lg border text-slate-400 transition ${
                          isExpanded
                            ? "border-[#4A148C]/30 bg-[#4A148C] text-white"
                            : "border-slate-200 bg-white group-hover:border-[#4A148C]/40 group-hover:text-[#4A148C]"
                        }`}
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          strokeWidth={2.5}
                        />
                      </button>
                      <RankBadge rank={globalRank} />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center font-mono text-sm text-slate-400">
                    {row.sku}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      {row.imageUrl ? (
                        <Image
                          src={row.imageUrl}
                          alt={row.name}
                          width={44}
                          height={44}
                          className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-slate-100"
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                          <Package className="h-5 w-5 text-slate-400" strokeWidth={1.5} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="break-words whitespace-normal text-base font-black text-slate-800 group-hover:text-[#4A148C] transition-colors leading-snug">
                          {row.name}
                        </p>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#4A148C] mt-0.5">
                          <Store className="h-3 w-3" />
                          {storeCount} ร้านค้า
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center text-base font-bold text-slate-800 tabular-nums whitespace-nowrap">
                    {fmt(row.totalQty)}
                  </td>
                  <td className="px-4 py-4 text-center text-base font-bold text-slate-500 whitespace-nowrap">
                    {formatDisplayUnit(row.unit)}
                  </td>
                  <td className="px-4 py-4 text-center text-base font-bold text-slate-500 tabular-nums whitespace-nowrap">
                    {fmtMoney(row.totalCost)}
                  </td>
                  <td
                    className="px-4 py-4 text-center tabular-nums whitespace-nowrap"
                    style={{ background: "rgba(212,163,115,0.03)" }}
                  >
                    <span className="whitespace-nowrap text-base font-bold text-[#4A148C]">
                      {fmtMoney(row.totalRevenue)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center tabular-nums whitespace-nowrap">
                    <span className={`inline-flex items-center justify-center whitespace-nowrap text-base font-bold ${profitColor}`}>
                      {fmtMoney(netProfit)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center tabular-nums whitespace-nowrap">
                    <span className={`inline-flex items-center justify-center whitespace-nowrap text-base font-bold ${profitColor}`}>
                      {fmtPercent(margin)}
                    </span>
                  </td>
                </tr>

                {/* Expandable Sub-table for Stores Breakdown */}
                {isExpanded ? (
                  <tr className="bg-[#FAF5FC]">
                    <td colSpan={9} className="p-0">
                      <div className="border-y border-[#EA80FC]/30 bg-gradient-to-b from-[#FBF7FC] to-[#F5EEF9] px-6 py-5 shadow-inner animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="mb-3.5 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="h-4.5 w-1.5 rounded-full bg-[#4A148C]" />
                            <h4 className="text-sm font-black uppercase tracking-wide text-[#4A148C]">
                              ยอดขายแยกตามร้านค้า ({row.name}) · รวม {storeCount} ร้านค้า
                            </h4>
                          </div>
                          <span className="text-sm font-bold text-slate-600">
                            รวม {fmt(row.totalQty)} {formatDisplayUnit(row.unit)} · ยอดขาย{" "}
                            <strong className="text-[#4A148C] font-black">{fmtMoney(row.totalRevenue)} บาท</strong>
                          </span>
                        </div>

                        {storeCount === 0 ? (
                          <p className="py-5 text-center text-sm font-semibold text-slate-400">
                            ไม่พบข้อมูลร้านค้า
                          </p>
                        ) : (
                          <div className="overflow-hidden rounded-xl border border-[#EA80FC]/30 bg-white shadow-sm">
                            <table className="w-full table-fixed border-collapse text-left">
                              <colgroup>
                                <col style={{ width: "7%" }} />
                                <col style={{ width: "9%" }} />
                                <col style={{ width: "27%" }} />
                                <col style={{ width: "8%" }} />
                                <col style={{ width: "6%" }} />
                                <col style={{ width: "12%" }} />
                                <col style={{ width: "12%" }} />
                                <col style={{ width: "10%" }} />
                                <col style={{ width: "9%" }} />
                              </colgroup>
                              <thead>
                                <tr className="border-b border-slate-200 bg-[#F3E5F5]/70 text-sm font-black text-[#4A148C]">
                                  <th className="py-3 pl-4 pr-2 text-center">ลำดับ</th>
                                  <th className="px-3 py-3 text-center">รหัสร้านค้า</th>
                                  <th className="px-3 py-3">ชื่อร้านค้า</th>
                                  <th className="px-3 py-3 text-center">จำนวนที่ซื้อ</th>
                                  <th className="px-3 py-3 text-center">หน่วย</th>
                                  <th className="px-3 py-3 text-center">ต้นทุนรวม</th>
                                  <th className="px-3 py-3 text-center bg-[#4A148C]/10 text-[#4A148C]">ยอดขายรวม</th>
                                  <th className="px-3 py-3 text-center">กำไรสุทธิ</th>
                                  <th className="py-3 pl-3 pr-4 text-center">กำไร (%)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-[15px]">
                                {row.stores.map((store, sIdx) => {
                                  const sProfit = store.totalRevenue - store.totalCost;
                                  const sProfitColor = sProfit >= 0 ? "text-emerald-600" : "text-red-500";
                                  const sMargin = store.totalRevenue > 0 ? (sProfit / store.totalRevenue) * 100 : 0;
                                  const isEven = sIdx % 2 === 1;

                                  return (
                                    <tr
                                      key={`${row.productId}-${store.customerId}-${sIdx}`}
                                      className={isEven ? "bg-slate-50/60" : "bg-white"}
                                    >
                                      <td className="py-3 pl-4 pr-2 text-center font-bold text-slate-400 tabular-nums text-sm">
                                        {sIdx + 1}
                                      </td>
                                      <td className="px-3 py-3 text-center font-mono text-sm font-bold text-slate-500">
                                        {store.customerCode}
                                      </td>
                                      <td className="px-3 py-3 font-black text-slate-900">
                                        {store.customerName}
                                      </td>
                                      <td className="px-3 py-3 text-center font-bold text-slate-900 tabular-nums">
                                        {fmt(store.totalQty)}
                                      </td>
                                      <td className="px-3 py-3 text-center font-medium text-slate-500 text-sm">
                                        {formatDisplayUnit(store.unit || row.unit)}
                                      </td>
                                      <td className="px-3 py-3 text-center font-bold text-slate-600 tabular-nums">
                                        {fmtMoney(store.totalCost)}
                                      </td>
                                      <td className="px-3 py-3 text-center font-black text-[#4A148C] tabular-nums bg-[#4A148C]/[0.03]">
                                        {fmtMoney(store.totalRevenue)}
                                      </td>
                                      <td className="px-3 py-3 text-center font-bold tabular-nums">
                                        <span className={sProfitColor}>{fmtMoney(sProfit)}</span>
                                      </td>
                                      <td className="py-3 pl-3 pr-4 text-center font-bold tabular-nums">
                                        <span className={sProfitColor}>{fmtPercent(sMargin)}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
          {summary && (
            <tr className="bg-slate-50/90">
              <td colSpan={3} className="px-5 py-4 text-right text-base font-black tracking-[0.02em] text-slate-600 whitespace-nowrap">
                ยอดรวมทั้งหมด
              </td>
              <td className="px-4 py-4 text-center text-base font-black text-slate-800 tabular-nums whitespace-nowrap">
                {fmt(summary.totalQty)}
              </td>
              <td className="px-4 py-4 text-center text-base font-black text-slate-500 whitespace-nowrap">
                —
              </td>
              <td className="px-4 py-4 text-center text-base font-black text-slate-700 tabular-nums whitespace-nowrap">
                {fmtMoney(summary.totalCost)}
              </td>
              <td
                className="px-4 py-4 text-center tabular-nums whitespace-nowrap"
                style={{ background: "rgba(212,163,115,0.05)" }}
              >
                <span className="whitespace-nowrap text-base font-black text-[#4A148C]">
                  {fmtMoney(summary.totalRevenue)}
                </span>
              </td>
              <td
                className={`px-5 py-4 text-center tabular-nums whitespace-nowrap ${
                  summary.netProfit >= 0 ? "text-emerald-600" : "text-red-500"
                }`}
              >
                <span className="inline-flex items-center justify-center whitespace-nowrap text-base font-black">
                  {fmtMoney(summary.netProfit)}
                </span>
              </td>
              <td
                className={`px-5 py-4 text-center tabular-nums whitespace-nowrap ${
                  summary.netProfit >= 0 ? "text-emerald-600" : "text-red-500"
                }`}
              >
                <span className="inline-flex items-center justify-center whitespace-nowrap text-base font-black">
                  {fmtPercent(totalMarginPercent ?? 0)}
                </span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Mobile Interactive List & Bottom Sheet Drawer (รูปแบบที่ 2) ──────────────────

function InfoBlockReport({
  label,
  value,
  icon,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">{label}</p>
      <div className="mt-1.5 flex items-center gap-2 text-[15px] font-semibold text-slate-950">
        {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

export function ProductSalesMobileList({
  rows,
  startRank,
}: {
  rows: ProductSalesRow[];
  startRank: number;
}) {
  const [selectedProduct, setSelectedProduct] = useState<ProductSalesRow | null>(null);

  return (
    <>
      <div className="divide-y divide-[#4A148C]/20 px-2 sm:px-4 lg:hidden">
        {rows.map((row, index) => {
          const globalRank = startRank + index;
          const netProfit = row.totalRevenue - row.totalCost;
          const profitPositive = netProfit >= 0;
          const margin = row.totalRevenue > 0 ? (netProfit / row.totalRevenue) * 100 : 0;
          const rankBadgeStyle =
            globalRank === 1
              ? { background: "linear-gradient(135deg,#FFD700 0%,#B8860B 100%)" }
              : globalRank === 2
                ? { background: "linear-gradient(135deg,#C0C0C0 0%,#708090 100%)" }
                : globalRank === 3
                  ? { background: "linear-gradient(135deg,#CD7F32 0%,#8B4513 100%)" }
                  : undefined;
          const storeCount = row.stores?.length ?? 0;

          return (
            <article
              key={row.productId}
              className="border-b border-slate-200 bg-white px-5 py-5 shadow-sm last:border-b-0"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200">
                  {row.imageUrl ? (
                    <Image
                      src={row.imageUrl}
                      alt={row.name}
                      width={48}
                      height={48}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-5 w-5 text-slate-300" strokeWidth={2.2} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[1.1rem] font-bold leading-tight text-slate-950">
                    {row.name}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <p className="truncate font-mono text-[13px] font-semibold text-slate-500" translate="no">
                      {row.sku}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-black text-white shadow-md ${
                      rankBadgeStyle ? "" : "bg-[#4A148C]"
                    }`}
                    style={rankBadgeStyle}
                  >
                    {globalRank}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
                <InfoBlockReport
                  label="จำนวนที่ขาย"
                  icon={<ShoppingCart className="h-4 w-4" strokeWidth={2.2} />}
                  value={`${fmt(row.totalQty)} ${formatDisplayUnit(row.unit)}`}
                />
                <div className="min-w-0 border-l border-slate-300 pl-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">ยอดขาย</p>
                  <p className="mt-1.5 text-[1.05rem] font-bold leading-none text-[#4A148C]">
                    {fmtMoney(row.totalRevenue)}
                  </p>
                </div>

                <InfoBlockReport
                  label="ต้นทุนรวม"
                  icon={<Wallet className="h-4 w-4" strokeWidth={2.2} />}
                  value={fmtMoney(row.totalCost)}
                />
                <div className="min-w-0 border-l border-slate-300 pl-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">กำไรสุทธิ</p>
                  <p className={`mt-1.5 text-[1.05rem] font-bold leading-none ${profitPositive ? "text-emerald-600" : "text-red-500"}`}>
                    {fmtMoney(netProfit)}
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">กำไร (%)</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <BadgeDollarSign className={`h-4 w-4 shrink-0 ${profitPositive ? "text-emerald-500" : "text-red-400"}`} strokeWidth={2.2} />
                    <span className={`text-[14px] font-bold ${profitPositive ? "text-emerald-600" : "text-red-500"}`}>
                      {fmtPercent(margin)}
                    </span>
                  </div>
                </div>

                {/* Button to open Bottom Sheet (รูปแบบที่ 2) */}
                <button
                  type="button"
                  onClick={() => setSelectedProduct(row)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#EA80FC]/50 bg-[#FBF7FC] px-3 py-2 text-xs font-black text-[#4A148C] shadow-sm transition hover:bg-[#F3E5F5] active:scale-95"
                >
                  <Store className="h-3.5 w-3.5" />
                  ดูรายชื่อร้าน ({storeCount})
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Bottom Sheet Drawer Modal (รูปแบบที่ 2) */}
      {selectedProduct ? (
        <ProductSalesStoreDrawer
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      ) : null}
    </>
  );
}

// ─── Bottom Sheet Drawer Component (Mobile) ──────────────────────────────────

function ProductSalesStoreDrawer({
  product,
  onClose,
}: {
  product: ProductSalesRow;
  onClose: () => void;
}) {
  const stores = product.stores ?? [];
  const netProfit = product.totalRevenue - product.totalCost;

  return typeof document !== "undefined"
    ? createPortal(
        <div
          className="fixed inset-0 z-[500] flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={onClose}
        >
          <div
            className="relative flex max-h-[88vh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200" />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      width={40}
                      height={40}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-5 w-5 text-slate-300" strokeWidth={2} />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-slate-900">
                    {product.name}
                  </h3>
                  <p className="text-xs font-bold text-slate-400">
                    SKU: {product.sku} · แยก {stores.length} ร้านค้า
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 active:scale-95"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>

            {/* Total Summary Strip */}
            <div className="grid grid-cols-3 gap-2 bg-[#FBF7FC] border-b border-[#EA80FC]/20 px-5 py-3 text-center">
              <div>
                <span className="block text-[10px] font-bold text-slate-400">จำนวนรวม</span>
                <strong className="text-sm font-black text-slate-900">
                  {fmt(product.totalQty)} {formatDisplayUnit(product.unit)}
                </strong>
              </div>
              <div className="border-x border-slate-200">
                <span className="block text-[10px] font-bold text-slate-400">ยอดขายรวม</span>
                <strong className="text-sm font-black text-[#4A148C]">
                  ฿{fmtMoney(product.totalRevenue)}
                </strong>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-slate-400">กำไรสุทธิ</span>
                <strong
                  className={`text-sm font-black ${
                    netProfit >= 0 ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  ฿{fmtMoney(netProfit)}
                </strong>
              </div>
            </div>

            {/* Store List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-8 [scrollbar-width:thin]">
              {stores.length === 0 ? (
                <p className="py-12 text-center text-sm font-semibold text-slate-400">
                  ไม่มีข้อมูลร้านค้า
                </p>
              ) : (
                stores.map((store, idx) => {
                  const sProfit = store.totalRevenue - store.totalCost;
                  const sProfitColor = sProfit >= 0 ? "text-emerald-600" : "text-red-500";
                  const sMargin = store.totalRevenue > 0 ? (sProfit / store.totalRevenue) * 100 : 0;

                  return (
                    <div
                      key={`${product.productId}-${store.customerId}-${idx}`}
                      className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#4A148C]/10 text-xs font-black text-[#4A148C]">
                            {idx + 1}
                          </span>
                          <span className="truncate text-sm font-black text-slate-900">
                            {store.customerName}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] font-bold text-slate-400">
                          {store.customerCode}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-50 p-2 text-center text-xs">
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400">จำนวน</span>
                          <strong className="font-bold text-slate-800">
                            {fmt(store.totalQty)} {formatDisplayUnit(store.unit || product.unit)}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400">ต้นทุน</span>
                          <strong className="font-bold text-slate-600">
                            ฿{fmtMoney(store.totalCost)}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-[#4A148C]">ยอดขาย</span>
                          <strong className="font-black text-[#4A148C]">
                            ฿{fmtMoney(store.totalRevenue)}
                          </strong>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-slate-400">กำไร (%)</span>
                          <strong className={`font-black ${sProfitColor}`}>
                            {fmtPercent(sMargin)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;
}
