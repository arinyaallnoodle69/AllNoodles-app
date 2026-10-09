"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Info, Layers3, Package2 } from "lucide-react";
import { ProductImagePreview } from "@/components/settings/product-image-preview";
import { initializeReserveStockAction } from "@/app/orders/fresh-reserve-stock/actions";

export function ReserveStockOpeningForm({ products, date }: { products: { id: string; name: string; sku: string; imageUrl: string | null }[]; date: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const complete = products.length > 0 && products.every((product) => values[product.id]?.trim() !== "" && values[product.id] !== undefined && Number.isFinite(Number(values[product.id])) && Number(values[product.id]) >= 0);
  const total = products.reduce((sum, product) => sum + (Number(values[product.id]) || 0), 0);
  const format = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
  const dateLabel = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00+07:00`));
  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!complete) { setError("กรอกยอดให้ครบทุกสินค้า ใส่ 0 หากไม่มีของ"); return; }
    if (!review) { setReview(true); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    startTransition(async () => {
      const result = await initializeReserveStockAction(date, products.map((product) => ({ productId: product.id, quantity: Number(values[product.id]) })));
      if (!result.ok) { setError(result.error); return; }
      router.replace("/orders/fresh-reserve-stock");router.refresh();
    });
  }
  return <form onSubmit={submit} className="pb-5">
    <div className="space-y-4 px-4 py-5 lg:px-6"><div className="flex items-center gap-3"><Link href="/orders/fresh-reserve-stock" aria-label="กลับหน้าสต็อคสำรอง" className="grid h-12 w-12 place-items-center text-[#6D28D9]"><ArrowLeft /></Link><h2 className="text-xl font-black">{review ? "ตรวจสอบยอดก่อนบันทึก" : "ตั้งยอดสต็อคเริ่มต้น"}</h2></div>
      <div className="flex gap-2 rounded-xl bg-[#F4EFFF] p-4 text-base"><Info className="h-5 w-5 shrink-0" /><p>กรอกของที่มีอยู่จริงในคลังกรุงเทพ<br /><span className="text-sm">ตั้งครั้งแรก · ใส่ 0 หากไม่มีของ</span></p></div>
      <p className="text-base font-bold">เริ่มใช้งานวันนี้ {dateLabel}</p>
      {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-base font-bold text-red-700">{error}</p> : null}
      {review ? <p className="text-base font-bold text-[#6D28D9]">ตรวจให้ตรงกับของจริง บันทึกยอดเริ่มต้นได้เพียงครั้งเดียว</p> : null}
    </div>
    <div className="hidden grid-cols-[2fr_1fr_1.2fr] gap-4 border-y border-[#E1E5EE] bg-[#FAFBFD] px-6 py-4 font-bold lg:grid"><span>สินค้า</span><span>รหัสสินค้า</span><span>จำนวนที่มีอยู่จริง (กก.)</span></div>
    {products.map((product) => <div key={product.id} className="border-b border-[#E1E5EE] px-4 py-5 lg:grid lg:grid-cols-[2fr_1fr_1.2fr] lg:items-center lg:gap-4 lg:px-6"><div className="flex min-w-0 items-center gap-3"><div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50">{product.imageUrl ? <ProductImagePreview src={product.imageUrl} alt={product.name} thumbnailSizes="64px" /> : <Package2 className="h-7 w-7 text-slate-300" />}</div><label htmlFor={`opening-${product.id}`} className="block min-w-0 text-lg font-bold">{product.name}<span className="mt-1 block text-sm font-normal text-[#4A5072] lg:hidden">{product.sku}</span></label></div><span className="hidden text-base lg:block">{product.sku}</span>
      <div className="mt-3 flex items-center gap-3 lg:mt-0">{review ? <p className="text-2xl font-black text-[#6D28D9]">{format(Number(values[product.id]))} กก.</p> : <><input id={`opening-${product.id}`} type="number" inputMode="decimal" min="0" max="1000000000" step="0.001" required value={values[product.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [product.id]: event.target.value }))} placeholder="ยังไม่ได้กรอก" className="h-14 min-w-0 flex-1 rounded-xl border border-[#D7C8F2] px-4 text-xl font-bold outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#EDE5FF]" /><span className="text-base">กก.</span></>}</div>
    </div>)}
    <div className="sticky bottom-[76px] z-10 space-y-3 border-t border-[#E1E5EE] bg-white px-4 py-4 lg:bottom-0 lg:flex lg:items-center lg:justify-between lg:gap-4 lg:space-y-0 lg:px-6"><div className="flex items-center gap-2 rounded-xl bg-[#F4EFFF] p-3 text-lg font-bold"><Layers3 className="h-6 w-6 text-[#6D28D9]" /><p>{Object.values(values).filter((value) => value.trim() !== "").length} / {products.length} สินค้า · รวม {format(total)} กก.</p></div><div className="flex gap-2">{review ? <button type="button" disabled={pending} onClick={() => setReview(false)} className="min-h-12 rounded-xl border border-[#D7C8F2] px-5 text-base font-bold text-[#6D28D9]">กลับไปแก้</button> : null}<button type="submit" disabled={pending || !products.length} className="min-h-12 flex-1 rounded-xl bg-[#6D28D9] px-5 py-3 text-lg font-bold text-white disabled:opacity-50">{pending ? "กำลังบันทึก…" : review ? "ยืนยันยอดเริ่มต้น" : "ตรวจสอบยอดก่อนบันทึก"}</button></div></div>
  </form>;
}
