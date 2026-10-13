"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustReserveBalanceAction } from "@/app/orders/fresh-reserve-stock/actions";

export function ReserveStockBalanceEditor({ groupId, productId, productName, available, scope = "bangkok" }: {
  groupId: string; productId: string; productName: string; available: number; scope?: "bangkok" | "province";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [expected, setExpected] = useState(available);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("ตรวจนับสต็อค");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (quantity.trim() === "") { setError("กรอกยอดคงเหลือที่นับได้จริง"); return; }
    startTransition(async () => {
      try {
        const result = await adjustReserveBalanceAction({ groupId, productId, expectedAvailable: expected, quantity: Number(quantity), notes }, scope);
        if (!result.ok) { setError(result.error); router.refresh(); return; }
        setEditing(false);
        setSaved(true);
        router.refresh();
      } catch {
        setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }

  if (!editing) return <div className="mt-2">
    <button type="button" onClick={() => { setExpected(available); setQuantity(String(available)); setError(null); setSaved(false); setEditing(true); }} aria-label={`แก้ไขคงเหลือ ${productName}`} className="min-h-11 rounded-lg border border-[#D7C8F2] px-3 py-2 text-base font-bold text-[#6D28D9]">แก้ไขคงเหลือ</button>
    {saved ? <p role="status" className="mt-1 text-sm text-emerald-700">ปรับยอดแล้ว</p> : null}
  </div>;

  return <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-[#D7C8F2] bg-white p-3">
    <p className="text-base">ยอดเดิม <strong>{expected.toLocaleString("th-TH", { maximumFractionDigits: 3 })} กก.</strong></p>
    <label className="block text-base font-bold" htmlFor={`reserve-balance-${productId}`}>คงเหลือที่นับได้จริง (กก.)</label>
    <input id={`reserve-balance-${productId}`} type="number" inputMode="decimal" min="0" max="1000000000" step="0.001" required disabled={pending} value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-14 w-full min-w-0 rounded-xl border border-[#D7C8F2] px-3 text-2xl font-bold text-[#15154F]" />
    <label className="block text-base" htmlFor={`reserve-note-${productId}`}>เหตุผล</label>
    <input id={`reserve-note-${productId}`} maxLength={500} disabled={pending} value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-12 w-full min-w-0 rounded-lg border border-[#D7C8F2] px-3 text-base" />
    <p className="text-sm text-[#4A5072]">{scope === "province" ? "ปรับเฉพาะคงเหลือ ไม่เปลี่ยนออเดอร์หรือใบสั่งโรงงาน" : "ปรับเฉพาะยอดใช้ได้ตอนนี้ ไม่เปลี่ยนยอดรอรับเข้าหรือใบสั่งโรงงาน"}</p>
    {error ? <p role="alert" className="text-base font-bold text-red-700">{error}</p> : null}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={pending} onClick={() => setEditing(false)} className="min-h-12 rounded-lg border border-[#D7C8F2] px-3 text-base font-bold">ยกเลิก</button>
      <button type="submit" disabled={pending} className="min-h-12 rounded-lg bg-[#6D28D9] px-3 text-base font-bold text-white disabled:opacity-50">{pending ? "กำลังบันทึก…" : "บันทึกยอดคงเหลือ"}</button>
    </div>
  </form>;
}
