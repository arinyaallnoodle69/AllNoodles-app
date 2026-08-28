import { ProductCategoryColorSettings } from "@/components/settings/product-category-color-settings";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { DEFAULT_CATEGORY_PRINT_COLORS } from "@/lib/products/category-print-colors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const metadata = {
  title: "สีหมวดหมู่ในใบออเดอร์",
};

type DbCategoryColorRow = {
  id: string;
  name: string;
  print_color: string | null;
  sort_order: number | string | null;
};

type DbCategoryItemRow = {
  product_category_id: string;
  product_id: string;
};

type SupabaseReadResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

type SupabaseSelectQuery<T> = PromiseLike<SupabaseReadResult<T>> & {
  eq(column: string, value: boolean | string): SupabaseSelectQuery<T>;
  order(column: string, options?: { ascending?: boolean }): SupabaseSelectQuery<T>;
};

type ProductCategoryPrintColorTable = {
  select(columns: string): SupabaseSelectQuery<DbCategoryColorRow>;
};

export default async function ProductCategoryColorsPage() {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const productCategories = admin.from("product_categories") as unknown as ProductCategoryPrintColorTable;

  const [categoriesResult, categoryItemsResult] = await Promise.all([
    productCategories
      .select("id, name, sort_order, print_color")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("product_category_items")
      .select("product_category_id, product_id")
      .eq("organization_id", session.organizationId),
  ]);

  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message ?? "Failed to load categories.");
  }

  if (categoryItemsResult.error) {
    throw new Error(categoryItemsResult.error.message ?? "Failed to load category items.");
  }

  const productIdsByCategory = new Map<string, Set<string>>();
  for (const item of (categoryItemsResult.data ?? []) as DbCategoryItemRow[]) {
    if (!productIdsByCategory.has(item.product_category_id)) {
      productIdsByCategory.set(item.product_category_id, new Set());
    }
    productIdsByCategory.get(item.product_category_id)?.add(item.product_id);
  }

  const categories = ((categoriesResult.data ?? []) as DbCategoryColorRow[]).map((category, index) => ({
    id: category.id,
    name: category.name,
    printColor: category.print_color,
    defaultColor:
      DEFAULT_CATEGORY_PRINT_COLORS[index % DEFAULT_CATEGORY_PRINT_COLORS.length] ??
      DEFAULT_CATEGORY_PRINT_COLORS[0],
    productCount: productIdsByCategory.get(category.id)?.size ?? 0,
    sortOrder: Number(category.sort_order ?? 0),
  }));

  return (
    <SettingsShell
      current="products"
      title="สีหมวดหมู่ในใบออเดอร์"
      description="กำหนดสีสำหรับแยกหมวดหมู่ในใบออเดอร์"
      floatingSubmit={false}
      hideHeader
      fullWidthMobile
    >
      <ProductCategoryColorSettings
        key={categories.map((category) => `${category.id}:${category.printColor ?? "category"}`).join("|")}
        categories={categories}
      />
    </SettingsShell>
  );
}
