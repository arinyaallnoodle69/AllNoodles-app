import Link from "next/link";
import {
  PackingListLayout,
  type PackingListData,
  type PackingListLayoutMode,
  type PackingListProduct,
  type PackingListStore,
  type PackingListVehicle,
} from "@/components/print/packing-list-layout";
import { PRINT_ORGANIZATION_NAME } from "@/components/print/print-shared";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getSettingsDataFresh } from "@/lib/settings/admin";

export const metadata = { title: "Mockup ใบจัดของ A4" };

type Props = {
  searchParams: Promise<{
    layout?: string;
  }>;
};

function getThaiDateLabel(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function buildMockQuantity(productIndex: number, storeIndex: number, vehicleFirstStoreIndices: Set<number>) {
  if (vehicleFirstStoreIndices.has(storeIndex)) {
    return (productIndex % 9) + 1;
  }

  if (storeIndex % 50 === productIndex) {
    return ((storeIndex + productIndex) % 7) + 1;
  }

  const seed = (productIndex + 3) * (storeIndex + 5) + productIndex * 11 + storeIndex * 7;
  if (seed % 10 < 4) {
    return (seed % 8) + 1;
  }

  return 0;
}

export default async function PackingListMockupPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "warehouse"]);
  const params = await searchParams;
  const layout: PackingListLayoutMode = params.layout === "transposed" ? "transposed" : "standard";
  const data = await getSettingsDataFresh(session.organizationId);

  const vehicles: PackingListVehicle[] = data.vehicles.length > 0
    ? data.vehicles.map((vehicle) => ({
        id: vehicle.id,
        name: vehicle.name,
      }))
    : [{ id: "mock-vehicle", name: "รถตัวอย่าง" }];

  const stores: PackingListStore[] = data.customers.slice(0, 30).map((customer, index) => {
    const fallbackVehicle = vehicles[index % vehicles.length] ?? vehicles[0];
    const vehicleId = customer.defaultVehicleId ?? fallbackVehicle.id;
    const vehicleName =
      customer.defaultVehicleName ?? vehicles.find((vehicle) => vehicle.id === vehicleId)?.name ?? fallbackVehicle.name;

    return {
      id: customer.code || customer.id,
      name: `${customer.code} ${customer.name}`.trim(),
      vehicleId,
      vehicleName,
    };
  });

  const products: PackingListProduct[] = data.products.slice(0, 50).map((product, index) => {
    const defaultSaleUnit = product.saleUnits.find((unit) => unit.isDefault) ?? product.saleUnits[0];

    return {
      brand: product.packingListBrand || product.brand || "ไม่ระบุแบรนด์",
      category: product.categoryNames[0] ?? (product.category || "ไม่ระบุหมวด"),
      icon: product.packingListIcon,
      key: `${product.sku}-${defaultSaleUnit?.label ?? product.baseUnit}-${index}`,
      sku: product.sku,
      name: product.packingListName || product.name,
      unit: defaultSaleUnit?.label ?? product.baseUnit,
    };
  });

  const firstStoreIndexByVehicle = new Set<number>();
  const seenVehicleIds = new Set<string>();
  stores.forEach((store, index) => {
    const key = store.vehicleId ?? "__unassigned__";
    if (seenVehicleIds.has(key)) return;
    seenVehicleIds.add(key);
    firstStoreIndexByVehicle.add(index);
  });

  const qty = products.map((_, productIndex) =>
    stores.map((__, storeIndex) => buildMockQuantity(productIndex, storeIndex, firstStoreIndexByVehicle)),
  );

  const mockData: PackingListData = {
    date: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }),
    dateLabel: getThaiDateLabel(new Date()),
    organizationName: PRINT_ORGANIZATION_NAME,
    stores,
    products,
    qty,
    vehicles,
  };

  const warning =
    stores.length < 30 || products.length < 50
      ? `ข้อมูลจริงตอนนี้มี ${stores.length} ร้าน และ ${products.length} สินค้า จึงแสดงเท่าที่มี`
      : null;

  return (
    <>
      <div
        className="no-print fixed left-1/2 top-3 z-[100] flex w-[min(980px,calc(100vw-24px))] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-[#EA80FC]/30 bg-white/95 px-4 py-3 shadow-xl shadow-slate-900/10 backdrop-blur"
        style={{ fontFamily: "Sarabun, sans-serif" }}
      >
        <div className="min-w-0">
          <h1 className="truncate text-sm font-black text-[#4A148C]">
            Mockup ใบจัดของ A4 แนวนอน
          </h1>
          <p className="truncate text-xs font-bold text-slate-500">
            {products.length} สินค้า · {stores.length} ลูกค้า · ข้อมูลจริงจากระบบ
            {warning ? ` · ${warning}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/orders/packing-list/mockup?layout=${layout === "standard" ? "transposed" : "standard"}`}
            className="rounded-xl bg-[#F3E5F5] px-3 py-2 text-xs font-black text-[#4A148C] transition hover:bg-[#EA80FC]/40"
          >
            {layout === "standard" ? "สลับตาราง" : "ตารางเดิม"}
          </Link>
          <Link
            href="/orders/packing-list"
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-200"
          >
            กลับใบจริง
          </Link>
        </div>
      </div>

      {stores.length === 0 || products.length === 0 ? (
        <div
          className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center"
          style={{ fontFamily: "Sarabun, sans-serif" }}
        >
          <h2 className="text-2xl font-black text-slate-900">ยังไม่มีข้อมูลพอสำหรับ mockup</h2>
          <p className="max-w-md text-sm font-bold text-slate-500">
            ต้องมีข้อมูลลูกค้าและสินค้าอย่างน้อยอย่างละ 1 รายการก่อน ระบบถึงจะสร้างใบจัดของตัวอย่างได้
          </p>
        </div>
      ) : (
        <div className="packing-print-container">
          <PackingListLayout data={mockData} layout={layout} />
        </div>
      )}
    </>
  );
}
