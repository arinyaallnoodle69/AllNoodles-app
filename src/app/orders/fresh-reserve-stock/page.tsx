import Link from "next/link";
import { ArrowLeft, Clock3, History, Info, Layers3, Package2 } from "lucide-react";
import { ProductImagePreview } from "@/components/settings/product-image-preview";
import { SettingsShell } from "@/components/settings/settings-shell";
import { FreshReserveRefresh } from "@/components/orders/fresh-reserve-refresh";
import { ReserveStockOpeningForm } from "@/components/orders/reserve-stock-opening-form";
import { DailySpecialOrderManager } from "@/components/orders/daily-special-order-manager";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDailySpecialCatalog, getDailySpecialItems } from "@/lib/orders/daily-special-items";
import { getVehiclesForOrder } from "@/lib/orders/manage";

export const metadata = { title: "สต็อคสำรองผลิตสด" };
const quantity = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
const dateTime = (value: string) => new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));

export default async function ReserveStockPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const session = await requireAnyRole(["admin", "member"]);
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
  const setup = (await searchParams).setup === "1";
  const admin = getSupabaseAdmin();
  const [catalog, vehicles, specials, warehouse, supplier, groupResult] = await Promise.all([
    getDailySpecialCatalog(session.organizationId), getVehiclesForOrder(session.organizationId), getDailySpecialItems(session.organizationId, date),
    admin.from("warehouses").select("id").eq("organization_id", session.organizationId).eq("name", "คลังกรุงเทพ").single(),
    admin.from("suppliers").select("id").eq("organization_id", session.organizationId).eq("name", "โรงงานมังกร").single(),
    admin.from("fresh_reserve_stock_groups").select("id,warehouse_id,supplier_id,start_date").eq("organization_id", session.organizationId),
  ]);
  if (warehouse.error || supplier.error || groupResult.error) throw new Error("โหลดการตั้งค่าสต็อคสำรองไม่สำเร็จ");
  const group = groupResult.data?.find((row) => row.warehouse_id === warehouse.data.id && row.supplier_id === supplier.data.id);
  const modes = await admin.from("product_warehouse_fulfillment_modes").select("product_id").eq("organization_id", session.organizationId).eq("warehouse_id", warehouse.data.id).eq("supplier_id", supplier.data.id).eq("mode", "fresh");
  if (modes.error) throw new Error("โหลดสินค้าผลิตสดไม่สำเร็จ");
  const eligible = new Set(modes.data.map((row) => row.product_id));
  const products = catalog.filter((product) => eligible.has(product.id));
  const [balances, history] = group ? await Promise.all([
    admin.from("fresh_reserve_stock_balances").select("product_id,available,pending,pending_at").eq("organization_id", session.organizationId).eq("group_id", group.id),
    admin.from("fresh_reserve_stock_movements").select("id,product_id,quantity_delta,reason,effective_at,created_at").eq("group_id", group.id).order("created_at", { ascending: false }).limit(50),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (balances.error || history.error) throw new Error("โหลดคงเหลือและประวัติสำรองไม่สำเร็จ");
  const byId = new Map(balances.data?.map((row) => [row.product_id, row]));
  const productNames = new Map(catalog.map((product) => [product.id, product.name]));
  const total = (balances.data ?? []).reduce((sum, row) => sum + Number(row.available ?? 0), 0);
  const vehicle = vehicles.find((row) => row.name.trim() === "รถกรุงเทพ");
  return (
    <SettingsShell title="สต็อคสำรองผลิตสด" floatingSubmit={false} fullWidthDesktop edgeToEdgeDesktop fullWidthMobile hideHeader>
      <div className="min-h-[calc(100dvh-5rem)] bg-white pb-6 text-[#15154F]">
        {!setup ? <FreshReserveRefresh /> : null}
        <header className="border-b border-[#E1E5EE] px-4 py-3 lg:px-6 lg:py-5">
          <h1 className="hidden text-3xl font-black lg:block">สต็อคสำรองผลิตสด</h1>
          <p className="text-base text-[#4A5072] lg:mt-1">โรงงานมังกร · คลังกรุงเทพ</p>
        </header>
        {setup && !group ? <ReserveStockOpeningForm products={products.map(({ id, name, sku, imageUrl }) => ({ id, name, sku, imageUrl }))} date={date} /> : (
          <>
            <div className="space-y-3 px-4 py-4 lg:flex lg:items-center lg:gap-4 lg:space-y-0 lg:px-6">
              {group ? <div className="lg:order-2 lg:ml-auto lg:min-w-60"><DailySpecialOrderManager date={date} products={catalog} vehicles={vehicles} initialItems={specials} defaultVehicleId={vehicle?.id} variant="reserve" /></div> : <Link href="/orders/fresh-reserve-stock?setup=1" className="flex min-h-12 items-center justify-center rounded-xl bg-[#6D28D9] px-5 py-3 text-lg font-bold text-white">ตั้งยอดสต็อคเริ่มต้น</Link>}
              {group ? <a href="#reserve-stock-history" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#D7C8F2] px-4 text-base font-bold text-[#6D28D9] lg:order-3"><History className="h-5 w-5" />ประวัติ</a> : null}
              <div className="flex items-start gap-2 rounded-xl bg-[#F4EFFF] px-4 py-3 text-base lg:flex-1"><Info className="mt-0.5 h-5 w-5 shrink-0" /><p>ของเหลือตัดทันที · เข้าออฟฟิศรับเข้าวันถัดไป<br /><span className="text-sm text-[#4A5072]">สต็อคคงอยู่ข้ามวัน ไม่ได้เริ่มใหม่ทุกวัน</span></p></div>
            </div>
            {!group ? <div className="mx-4 mb-4 rounded-xl border border-dashed border-[#D7C8F2] p-5 text-lg">ยังไม่ได้ตั้งยอดสำรอง กรุณากรอกจำนวนของที่มีอยู่จริงก่อนเริ่มใช้</div> : <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-[#F4EFFF] p-4 lg:mx-6"><Layers3 className="h-6 w-6 text-[#6D28D9]" /><p className="text-lg font-bold">รวมใช้ได้ตอนนี้ <strong className="ml-2 text-3xl text-[#6D28D9]">{quantity(total)} กก.</strong></p></div>}
            <div className="hidden grid-cols-[2fr_1fr_1.2fr_1fr] gap-4 border-y border-[#E1E5EE] bg-[#FAFBFD] px-6 py-4 font-bold lg:grid"><span>สินค้า</span><span>คงเหลือใช้ได้</span><span>รอรับเข้า</span><span>สถานะ</span></div>
            {products.map((product) => {
              const balance = byId.get(product.id);
              const ready = Boolean(group && balance);
              const available = Number(balance?.available ?? 0), pending = Number(balance?.pending ?? 0);
              return <article key={product.id} className="border-b border-[#E1E5EE] px-4 py-5 lg:grid lg:grid-cols-[2fr_1fr_1.2fr_1fr] lg:items-center lg:gap-4 lg:px-6">
                <div className="flex items-start justify-between gap-3 lg:block"><div className="flex min-w-0 items-center gap-3"><div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50">{product.imageUrl ? <ProductImagePreview src={product.imageUrl} alt={product.name} thumbnailSizes="64px" /> : <Package2 className="h-7 w-7 text-slate-300" />}</div><div className="min-w-0"><h2 className="text-lg font-bold leading-relaxed">{product.name}</h2><p className="text-sm text-[#4A5072]">{product.sku}</p></div></div><span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold lg:hidden ${!ready ? "bg-slate-100" : available > 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{!ready ? "ยังไม่ตั้งยอด" : available > 0 ? "ปกติ" : "ไม่มีของสำรอง"}</span></div>
                <div className="mt-3 grid grid-cols-2 lg:contents"><div className="border-r border-[#E1E5EE] pr-3 lg:border-0"><p className="text-base lg:hidden">คงเหลือใช้ได้</p><p className="mt-1 text-3xl font-black text-[#6D28D9] lg:text-2xl">{ready ? `${quantity(available)} กก.` : "—"}</p></div>
                <div className="pl-4 lg:pl-0"><p className="text-base lg:hidden">รอรับเข้า</p>{pending > 0 ? <><p className="mt-1 flex items-center gap-1 text-xl font-bold text-[#6D28D9]"><Clock3 className="h-4 w-4" />{quantity(pending)} กก.</p><p className="mt-1 text-sm text-[#4A5072]">รับเข้า {balance?.pending_at ? dateTime(balance.pending_at) : "—"}</p></> : <p className="mt-1 text-lg">{group ? "ไม่มี" : "—"}</p>}</div></div>
                <div className="hidden lg:block"><span className={`rounded-full px-3 py-1 text-sm font-bold ${!ready ? "bg-slate-100" : available > 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{!ready ? "ยังไม่ตั้งยอด" : available > 0 ? "ปกติ" : "ไม่มีของสำรอง"}</span></div>
              </article>;
            })}
            <section id="reserve-stock-history" className="scroll-mt-24 px-4 py-5 lg:px-6">
              <h2 className="text-xl font-black">ประวัติรายการสำรอง</h2>
              <p className="mt-1 text-sm text-[#4A5072]">{group ? `เริ่มบันทึกตั้งแต่ ${group.start_date} · ล่าสุด 50 รายการ` : "ประวัติจะเริ่มหลังตั้งยอดสต็อค"}</p>
              {(history.data ?? []).length ? <details className="mt-3"><summary className="min-h-12 cursor-pointer py-3 text-base font-bold text-[#6D28D9]">ดูรายการล่าสุด</summary>{history.data?.map((item) => {
                const delta = Number(item.quantity_delta), waiting = Date.parse(item.effective_at) > now.getTime();
                const label = item.reason === "remaining" ? delta < 0 ? "ใช้ของสำรอง" : "คืนสำรอง" : delta < 0 ? "ลด / ยกเลิกยอดรับเข้า" : waiting ? "รอรับเข้า" : "รับเข้าสต็อค";
                return <div key={item.id} className="border-t border-[#E1E5EE] py-3"><p className="text-base font-bold">{productNames.get(item.product_id) ?? "สินค้า"}</p><p className="mt-1 text-base">{label} {delta > 0 ? "+" : ""}{quantity(delta)} กก.</p><p className="mt-1 text-sm text-[#4A5072]">บันทึก {dateTime(item.created_at)}{waiting ? ` · มีผล ${dateTime(item.effective_at)}` : ""}</p></div>;
              })}</details> : <p className="py-4 text-base text-[#4A5072]">ยังไม่มีรายการรับเข้า / ตัดออก</p>}
            </section>
          </>
        )}
        <Link href="/orders/incoming" className="mx-4 inline-flex min-h-12 items-center gap-2 text-base font-bold text-[#6D28D9]"><ArrowLeft className="h-5 w-5" />กลับหน้ารายการออเดอร์</Link>
      </div>
    </SettingsShell>
  );
}
