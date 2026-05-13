"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, FileText, Loader2, RefreshCw, Search, Square } from "lucide-react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import type { BillingCandidate } from "@/lib/billing/billing-statement";

type BillingFormProps = {
  initialFromDate: string;
  initialToDate: string;
  candidates: BillingCandidate[];
};

export function BillingForm({
  initialFromDate,
  initialToDate,
  candidates,
}: BillingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    candidates.map((candidate) => candidate.customerId),
  );

  const visibleCandidates = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((candidate) => {
      const name = candidate.customerName.toLowerCase();
      const code = candidate.customerCode.toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [candidates, keyword]);

  const selectedCount = selectedIds.length;

  function reloadCandidateList() {
    const params = new URLSearchParams({
      from: fromDate,
      to: toDate,
    });
    startTransition(() => {
      router.replace(`/billing?${params.toString()}`, { scroll: false });
    });
  }

  function toggleCustomer(customerId: string) {
    setSelectedIds((current) =>
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId],
    );
  }

  function selectAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const candidate of visibleCandidates) next.add(candidate.customerId);
      return Array.from(next);
    });
  }

  function clearAllVisible() {
    const visibleIds = new Set(visibleCandidates.map((candidate) => candidate.customerId));
    setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
  }

  function openPrint() {
    if (selectedIds.length === 0) return;
    const params = new URLSearchParams({
      customers: selectedIds.join(","),
      from: fromDate,
      to: toDate,
      save: "true",
    });
    router.push(`/billing/print?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
        <div className="flex flex-col gap-2">
          <label htmlFor="billing-fromDate" className="text-sm font-bold text-slate-800">
            ตั้งแต่วันที่
          </label>
          <ThaiDatePicker
            id="billing-fromDate"
            name="billing-fromDate"
            value={fromDate}
            max={toDate}
            onChange={setFromDate}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="billing-toDate" className="text-sm font-bold text-slate-800">
            ถึงวันที่
          </label>
          <ThaiDatePicker
            id="billing-toDate"
            name="billing-toDate"
            value={toDate}
            min={fromDate}
            onChange={setToDate}
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={reloadCandidateList}
            disabled={isPending || !fromDate || !toDate}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            โหลดรายการร้านค้า
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">
              ร้านค้าที่มีใบจัดส่งยืนยันแล้วในช่วงวันที่เลือก
            </p>
            <p className="mt-1 text-xs text-slate-500">
              หน้าใบวางบิลจะดึงจากเลขใบจัดส่งที่สร้างแล้ว ไม่ดึงจากออเดอร์ดิบ
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-right shadow-sm">
            <p className="text-[11px] font-bold text-slate-500">
              เลือกแล้ว {selectedCount} / {candidates.length} ร้าน
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="relative block md:max-w-sm md:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="ค้นหารหัสร้านหรือชื่อร้าน"
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAllVisible}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <CheckSquare className="h-4 w-4" />
              เลือกทั้งหมด
            </button>
            <button
              type="button"
              onClick={clearAllVisible}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Square className="h-4 w-4" />
              ล้างที่เลือก
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {visibleCandidates.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-semibold text-slate-500">ไม่พบร้านค้าที่ตรงกับเงื่อนไข</p>
            </div>
          ) : (
            <div className="max-h-[26rem] overflow-y-auto">
              {visibleCandidates.map((candidate) => {
                const checked = selectedIds.includes(candidate.customerId);
                return (
                  <label
                    key={candidate.customerId}
                    className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-4 py-3.5 last:border-b-0 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCustomer(candidate.customerId)}
                      className="mt-1 h-4.5 w-4.5 rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#003366]">
                          {candidate.customerCode}
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {candidate.customerName}
                        </span>
                        {candidate.billingNumber ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                            วางบิลแล้ว {candidate.billingNumber}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
                        <span>{candidate.deliveryCount} ใบจัดส่ง</span>
                        <span>รวม {candidate.totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</span>
                        <span>ล่าสุด {candidate.latestDeliveryDate}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          เมื่อกดพิมพ์ ระบบจะเปิดเฉพาะร้านที่เลือก และบันทึกเลขใบวางบิลให้เฉพาะร้านเหล่านั้น
        </p>
        <button
          type="button"
          onClick={openPrint}
          disabled={selectedIds.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#003366] px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-[#003366]/20 transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileText className="h-4 w-4" />
          ดูและพิมพ์ใบวางบิล {selectedIds.length > 0 ? `${selectedIds.length} ร้าน` : ""}
        </button>
      </div>
    </div>
  );
}
