import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type DailySpecialItemType = "office" | "claim";

export type DailySpecialCatalogProduct = {
  id: string;
  imageUrl: string | null;
  name: string;
  sku: string;
  unit: string;
};

export type DailySpecialItem = {
  date: string;
  id: string;
  productId: string;
  quantity: number;
  type: DailySpecialItemType;
  vehicleId: string;
};

export type DailySpecialPrintItem = DailySpecialItem & {
  product: DailySpecialCatalogProduct;
  vehicleName: string;
};

type SpecialItemsAdmin = {
  from(table: "daily_order_special_items"): any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

function specialItemsTable() {
  return (getSupabaseAdmin() as unknown as SpecialItemsAdmin).from("daily_order_special_items");
}

export async function getDailySpecialCatalog(organizationId: string): Promise<DailySpecialCatalogProduct[]> {
  "use cache";
  cacheLife("max");
  cacheTag(`settings-${organizationId}`);
  const admin = getSupabaseAdmin();
  const [productsResult, imagesResult] = await Promise.all([
    admin
      .from("products")
      .select("id, sku, name, unit, display_order, metadata")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("product_images")
      .select("product_id, public_url, sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true }),
  ]);

  if (productsResult.error) throw new Error(productsResult.error.message);
  if (imagesResult.error) throw new Error(imagesResult.error.message);

  const firstImageByProductId = new Map<string, string>();
  for (const image of imagesResult.data ?? []) {
    if (!firstImageByProductId.has(image.product_id)) {
      firstImageByProductId.set(image.product_id, image.public_url);
    }
  }

  return (productsResult.data ?? [])
    .filter((product) => {
      const metadata = product.metadata && typeof product.metadata === "object"
        ? product.metadata as Record<string, unknown>
        : null;
      return !metadata?.deleted;
    })
    .map((product) => ({
      id: product.id,
      imageUrl: firstImageByProductId.get(product.id) ?? null,
      name: product.name,
      sku: product.sku,
      unit: product.unit || "-",
    }));
}

export async function getDailySpecialItems(
  organizationId: string,
  date: string,
): Promise<DailySpecialItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`orders-${organizationId}`);
  const { data, error } = await specialItemsTable()
    .select("id, entry_date, entry_type, vehicle_id, product_id, quantity")
    .eq("organization_id", organizationId)
    .eq("entry_date", date)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message ?? "โหลดรายการพิเศษไม่สำเร็จ");

  return (data ?? []).map((row: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    date: row.entry_date,
    id: row.id,
    productId: row.product_id,
    quantity: Number(row.quantity ?? 0),
    type: row.entry_type === "claim" ? "claim" : "office",
    vehicleId: row.vehicle_id,
  }));
}

export async function getDailySpecialPrintItems(
  organizationId: string,
  date: string,
  endDate: string,
): Promise<DailySpecialPrintItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`orders-${organizationId}`);
  const { data, error } = await specialItemsTable()
    .select("id, entry_date, entry_type, vehicle_id, product_id, quantity, vehicles(name), products(sku, name, unit, product_images(public_url, sort_order))")
    .eq("organization_id", organizationId)
    .gte("entry_date", date)
    .lte("entry_date", endDate)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message ?? "โหลดรายการพิเศษสำหรับเอกสารไม่สำเร็จ");

  return (data ?? []).map((row: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const images = Array.isArray(row.products?.product_images)
      ? [...row.products.product_images].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
      : [];

    return {
      date: row.entry_date,
      id: row.id,
      productId: row.product_id,
      quantity: Number(row.quantity ?? 0),
      type: row.entry_type === "claim" ? "claim" : "office",
      vehicleId: row.vehicle_id,
      vehicleName: row.vehicles?.name ?? "ยังไม่กำหนดรถ",
      product: {
        id: row.product_id,
        imageUrl: images[0]?.public_url ?? null,
        name: row.products?.name ?? "ไม่พบสินค้า",
        sku: row.products?.sku ?? "",
        unit: row.products?.unit || "-",
      },
    } satisfies DailySpecialPrintItem;
  });
}
