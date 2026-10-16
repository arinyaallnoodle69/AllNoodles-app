import Link from "next/link";
import { ArrowLeft, ChevronRight, Info, Layers3, Package2 } from "lucide-react";
import { ProductImagePreview } from "@/components/settings/product-image-preview";
import { SettingsShell } from "@/components/settings/settings-shell";
import { FreshReserveRefresh } from "@/components/orders/fresh-reserve-refresh";
import { ReserveStockOpeningForm } from "@/components/orders/reserve-stock-opening-form";
import { ReserveWarehouseHistory } from "@/components/orders/reserve-warehouse-history";
import { ReserveProductHistory } from "@/components/orders/reserve-product-history";
import { ReserveStockBalanceEditor } from "@/components/orders/reserve-stock-balance-editor";
import { ReserveStockProductFilters } from "@/components/orders/reserve-stock-product-filters";
import { DailySpecialOrderManager } from "@/components/orders/daily-special-order-manager";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDailySpecialCatalog, getDailySpecialItems } from "@/lib/orders/daily-special-items";
import { getVehiclesForOrder } from "@/lib/orders/manage";

export const metadata = { title: "สต็อคสำรองผลิตสด" };
const quantity = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
const dateTime = (value: string) => new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));

export default async function ReserveStockPage({ searchParams }: { searchParams: Promise<{ setup?: string; scope?: string }> }) {
  const session = await requireAnyRole(["admin", "member"]);
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
  const params = await searchParams;
  const setup = params.setup === "1";
  const provincial = params.scope === "province";
  const warehouseName = provincial ? "คลังต่างจังหวัด" : "คลังกรุงเทพ";
  const supplierName = provincial ? "A.ดอกบัว" : "โรงงานมังกร";
  const reserveHref = provincial ? "/orders/fresh-reserve-stock?scope=province" : "/orders/fresh-reserve-stock";
  const setupHref = provincial ? `${reserveHref}&setup=1` : `${reserveHref}?setup=1`;
  const admin = getSupabaseAdmin();
  const [catalog, vehicles, specials, warehouse, supplier, groupResult, brandsResult] = await Promise.all([
    getDailySpecialCatalog(session.organizationId), getVehiclesForOrder(session.organizationId), getDailySpecialItems(session.organizationId, date),
    admin.from("warehouses").select("id").eq("organization_id", session.organizationId).eq("name", warehouseName).single(),
    admin.from("suppliers").select("id").eq("organization_id", session.organizationId).eq("name", supplierName).single(),
    admin.from("fresh_reserve_stock_groups").select("id,warehouse_id,supplier_id,start_date").eq("organization_id", session.organizationId),
    admin.from("product_brands").select("name").eq("organization_id", session.organizationId).order("sort_order", { ascending: true }),
  ]);
  if (warehouse.error || supplier.error || groupResult.error || brandsResult.error) throw new Error("โหลดการตั้งค่าสต็อคสำรองไม่สำเร็จ");
  const group = groupResult.data?.find((row) => row.warehouse_id === warehouse.data.id && row.supplier_id === supplier.data.id);
  const modes = await admin.from("product_warehouse_fulfillment_modes").select("product_id").eq("organization_id", session.organizationId).eq("warehouse_id", warehouse.data.id).eq("supplier_id", supplier.data.id).eq("mode", "fresh");
  if (modes.error) throw new Error("โหลดสินค้าผลิตสดไม่สำเร็จ");
  const eligible = new Set(modes.data.map((row) => row.product_id));
  const products = catalog.filter((product) => eligible.has(product.id));
  const balances = group ? await admin.from(provincial ? "provincial_fresh_reserve_stock_balances" : "fresh_reserve_stock_balances").select("product_id,available,pending,pending_at").eq("organization_id", session.organizationId).eq("group_id", group.id) : { data: [], error: null };
  if (balances.error) throw new Error("โหลดคงเหลือสำรองไม่สำเร็จ");
  const byId = new Map(balances.data?.map((row) => [row.product_id, row]));
  const total = (balances.data ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.available ?? 0)), 0);
  const shortage = (balances.data ?? []).reduce((sum, row) => sum + Math.max(0, -Number(row.available ?? 0)), 0);
  const vehicle = vehicles.find((row) => row.name.trim() === "รถกรุงเทพ");
  const reserveVehicles = provincial ? vehicles.filter((row) => !row.name.trim().startsWith("รถกรุงเทพ")) : vehicles;
  return (
    <SettingsShell title="สต็อคสำรองผลิตสด" floatingSubmit={false} fullWidthDesktop edgeToEdgeDesktop fullWidthMobile hideHeader>
      <div className="min-h-[calc(100dvh-5rem)] bg-white pb-6 text-[#15154F]">
        {!setup ? <FreshReserveRefresh /> : null}
        <header className="border-b border-[#E1E5EE] px-4 pt-2 lg:px-6">
          <h1 className="mb-2 hidden text-2xl font-bold lg:block">สต็อคสำรองผลิตสด</h1>
          <div className="flex items-center justify-between gap-2">
            <nav aria-label="เลือกคลังสำรอง" className="flex gap-5">
              <Link href={`/orders/fresh-reserve-stock${setup ? "?setup=1" : ""}`} aria-current={!provincial ? "page" : undefined} className={`inline-flex min-h-11 items-center border-b-2 px-1 text-base font-bold ${!provincial ? "border-[#6D28D9] text-[#6D28D9]" : "border-transparent text-[#4A5072]"}`}>กรุงเทพ</Link>
              <Link href={`/orders/fresh-reserve-stock?scope=province${setup ? "&setup=1" : ""}`} aria-current={provincial ? "page" : undefined} className={`inline-flex min-h-11 items-center border-b-2 px-1 text-base font-bold ${provincial ? "border-[#6D28D9] text-[#6D28D9]" : "border-transparent text-[#4A5072]"}`}>ต่างจังหวัด</Link>
            </nav>
            <p className="text-sm text-[#4A5072]">{supplierName}</p>
          </div>
        </header>
        {provincial && products.length === 0 ? <p role="status" className="mx-4 mt-4 rounded-xl bg-[#F4EFFF] p-4 text-base">ยังไม่มีสินค้าที่ตั้งเป็นผลิตสดของดอกบัวในคลังต่างจังหวัด สินค้าที่ใช้สต็อคทั่วไปจะไม่แสดงในหน้านี้</p> : null}
        {setup && !group ? <ReserveStockOpeningForm key={reserveHref} products={products.map(({ id, name, sku, imageUrl }) => ({ id, name, sku, imageUrl }))} date={date} scope={provincial ? "province" : "bangkok"} /> : (
          <>
            <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-2 px-4 py-2 lg:flex lg:px-6">
              {group ? <><div className="lg:min-w-60"><DailySpecialOrderManager key={reserveHref} date={date} products={provincial ? products : catalog} vehicles={reserveVehicles} initialItems={specials} defaultVehicleId={provincial ? reserveVehicles[0]?.id : vehicle?.id} variant="reserve" restrictToSelection={provincial} /></div><ReserveWarehouseHistory groupId={group.id} asOf={now.toISOString()} warehouseName={warehouseName} supplierName={supplierName} /></> : products.length > 0 ? <Link href={setupHref} className="col-span-2 flex min-h-11 items-center justify-center rounded-xl bg-[#6D28D9] px-3 text-base font-bold text-white">ตั้งยอดสต็อคเริ่มต้น</Link> : null}
            </div>
            {!group ? <p className="mx-4 mb-3 rounded-lg border border-dashed border-[#D7C8F2] p-3 text-base">ยังไม่ได้ตั้งยอดสำรอง กรุณากรอกจำนวนของที่มีอยู่จริงก่อนเริ่มใช้</p> : <div className="mx-4 mb-2 flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-[#F4EFFF] px-3 lg:mx-6">
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-base font-bold"><Layers3 className="h-5 w-5 shrink-0 text-[#6D28D9]" />ใช้ได้ตอนนี้ <strong className="whitespace-nowrap text-2xl text-[#6D28D9]">{quantity(total)} <span className="text-base">กก.</span></strong></p>
              <details className="relative shrink-0"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-bold text-[#4A148C]" aria-label="วิธีนับสต็อค"><span className="hidden sm:inline">วิธีนับสต็อค</span><Info className="h-5 w-5" /><ChevronRight className="h-4 w-4" /></summary><div className="absolute right-0 top-full z-20 w-64 rounded-xl border border-[#D7C8F2] bg-white p-4 text-base leading-relaxed shadow-lg">{provincial ? "จันทร์ / พฤหัสบดี สั่งโรงงาน = ออเดอร์ + เข้าออฟฟิศ · วันอื่นใช้สำรอง · เข้าออฟฟิศเพิ่มทันที · เลือกหักสำรองไม่สั่งโรงงาน" : "ของเหลือตัดทันที · เข้าออฟฟิศรับเข้าวันถัดไป · สต็อคคงอยู่ข้ามวัน ไม่ได้เริ่มใหม่ทุกวัน"}</div></details>
            </div>}
            {shortage > 0 ? <details className="mx-4 mb-2 rounded-lg bg-red-50 px-3 text-red-700 lg:mx-6"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-base font-bold"><span>ขาดสำรอง {quantity(shortage)} กก.</span><span className="inline-flex items-center whitespace-nowrap text-sm">ดูรายละเอียด<ChevronRight className="h-4 w-4" /></span></summary><p className="pb-3 text-base">กรุณาตรวจสอบยอดสำรองและปรับออเดอร์ตามของที่มีจริง ระบบไม่สั่งโรงงานเพิ่มอัตโนมัติ</p></details> : null}
            <ReserveStockProductFilters key={reserveHref} factoryName={supplierName} brands={(brandsResult.data ?? []).map(row => row.name.trim())} items={products.map((product) => {
              const balance = byId.get(product.id);
              const ready = Boolean(group && balance);
              const available = Number(balance?.available ?? 0), pending = Number(balance?.pending ?? 0);
              return { id: product.id, brand: product.brand?.trim() ?? "", content: <article className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 border-b border-[#E1E5EE] px-4 py-2 lg:grid-cols-[3.5rem_minmax(0,1fr)] lg:px-6">
                <div className="relative row-span-2 mt-1 h-16 w-11 self-center lg:h-20 lg:w-14">{product.imageUrl ? <ProductImagePreview src={product.imageUrl} alt={product.name} thumbnailSizes="64px" /> : <Package2 className="h-full w-full p-1 text-slate-300" />}</div>
                <h2 className="min-w-0 whitespace-normal text-[17px] font-bold leading-6 [overflow-wrap:anywhere] lg:text-lg">{product.name}</h2>
                <div className="col-start-2 min-w-0">
                  <div className="pt-1"><p className="text-sm text-[#4A5072]">{product.sku}</p>{!provincial && pending > 0 ? <p title={balance?.pending_at ? `รับเข้า ${dateTime(balance.pending_at)}` : undefined} className="mt-0.5 text-sm font-bold text-[#6D28D9]">รอเข้า {quantity(pending)} กก.</p> : null}</div>
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2"><p className={`min-w-0 break-words text-2xl font-bold leading-8 tabular-nums ${available < 0 ? "text-red-700" : "text-[#6D28D9]"}`}>{ready ? <>{available < 0 ? <span className="text-base">ขาด </span> : null}{quantity(Math.abs(available))} <span className="text-base">กก.</span></> : <span className="text-base text-[#4A5072]">ยังไม่ตั้งยอด</span>}</p>
                    {group && ready ? <div className="ml-auto flex flex-wrap items-center justify-end"><ReserveStockBalanceEditor groupId={group.id} productId={product.id} productName={product.name} available={available} scope={provincial ? "province" : "bangkok"} /><ReserveProductHistory groupId={group.id} productId={product.id} name={product.name} sku={product.sku} imageUrl={product.imageUrl} warehouseName={warehouseName} supplierName={supplierName} /></div> : null}
                  </div>
                </div>
              </article> };
            })} />
          </>
        )}
        <Link href="/orders/incoming" className="mx-4 inline-flex min-h-12 items-center gap-2 text-base font-bold text-[#6D28D9]"><ArrowLeft className="h-5 w-5" />กลับหน้ารายการออเดอร์</Link>
      </div>
    </SettingsShell>
  );
}
