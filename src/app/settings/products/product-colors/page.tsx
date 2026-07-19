import { ProductPrintBackgroundColorSettings } from "@/components/settings/product-print-background-color-settings";
import type {
  ProductPrintColorCategory,
  ProductPrintColorProduct,
} from "@/components/settings/product-print-background-color-settings";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { DEFAULT_CATEGORY_PRINT_COLORS } from "@/lib/products/category-print-colors";
import { sortProductsByCategory } from "@/lib/products/sort-by-category";
import { getPackingListProductMeta } from "@/lib/orders/packing-list-product-meta";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const metadata = {
  title: "สีพื้นหลังสินค้าในใบออเดอร์",
};

type DbProductRow = {
  display_order: number | string | null;
  id: string;
  metadata: unknown;
  name: string;
  print_background_color: string | null;
  sku: string;
};

type DbCategoryRow = {
  id: string;
  is_active: boolean;
  name: string;
  print_color: string | null;
  sort_order: number | string | null;
};

type DbCategoryItemRow = {
  product_category_id: string;
  product_id: string;
};

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export default async function ProductPrintBackgroundColorsPage() {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const [productsResult, categoriesResult, categoryItemsResult] = await Promise.all([
    admin
      .from("products")
      .select("id, sku, name, metadata, display_order, print_background_color")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("sku", { ascending: true }),
    admin
      .from("product_categories")
      .select("id, name, sort_order, is_active, print_color")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("product_category_items")
      .select("product_category_id, product_id")
      .eq("organization_id", session.organizationId),
  ]);

  if (productsResult.error) {
    throw new Error(productsResult.error.message ?? "Failed to load products.");
  }
  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message ?? "Failed to load categories.");
  }
  if (categoryItemsResult.error) {
    throw new Error(categoryItemsResult.error.message ?? "Failed to load product category items.");
  }

  const productsRaw = (productsResult.data ?? []) as unknown as DbProductRow[];
  const categoriesRaw = (categoriesResult.data ?? []) as unknown as DbCategoryRow[];
  const categoryItems = (categoryItemsResult.data ?? []) as unknown as DbCategoryItemRow[];
  const categoryById = new Map(categoriesRaw.map((category) => [category.id, category]));
  const categoryIdsByProductId = new Map<string, string[]>();
  const productIdsByCategoryId = new Map<string, string[]>();

  for (const item of categoryItems) {
    const productCategoryIds = categoryIdsByProductId.get(item.product_id) ?? [];
    productCategoryIds.push(item.product_category_id);
    categoryIdsByProductId.set(item.product_id, productCategoryIds);

    const categoryProductIds = productIdsByCategoryId.get(item.product_category_id) ?? [];
    categoryProductIds.push(item.product_id);
    productIdsByCategoryId.set(item.product_category_id, categoryProductIds);
  }

  const categories: ProductPrintColorCategory[] = categoriesRaw.map((category, index) => ({
    id: category.id,
    name: category.name,
    printColor: category.print_color,
    defaultColor:
      category.print_color ??
      DEFAULT_CATEGORY_PRINT_COLORS[index % DEFAULT_CATEGORY_PRINT_COLORS.length] ??
      DEFAULT_CATEGORY_PRINT_COLORS[0],
    productCount: productIdsByCategoryId.get(category.id)?.length ?? 0,
    sortOrder: Number(category.sort_order ?? 0),
  }));

  const categoryRankById = new Map(categories.map((category) => [category.id, category.sortOrder]));
  const mappedProducts = productsRaw
    .filter((product) => !getRecord(product.metadata).deleted)
    .map((product) => {
      const metadata = getRecord(product.metadata);
      const categoryIds = (categoryIdsByProductId.get(product.id) ?? []).toSorted(
        (left, right) => (categoryRankById.get(left) ?? Infinity) - (categoryRankById.get(right) ?? Infinity),
      );
      const primaryCategory = categoryIds.length > 0 ? categoryById.get(categoryIds[0]) ?? null : null;
      const primaryCategoryIndex = primaryCategory
        ? categories.findIndex((category) => category.id === primaryCategory.id)
        : 0;
      const fallbackCategoryColor =
        primaryCategory?.print_color ??
        DEFAULT_CATEGORY_PRINT_COLORS[primaryCategoryIndex % DEFAULT_CATEGORY_PRINT_COLORS.length] ??
        DEFAULT_CATEGORY_PRINT_COLORS[0];
      const meta = getPackingListProductMeta({
        categoryNames: categoryIds.map((categoryId) => categoryById.get(categoryId)?.name).filter(Boolean) as string[],
        metadata: product.metadata,
        name: product.name,
      });

      return {
        brand: getText(metadata.brand),
        categoryIds,
        categoryName: primaryCategory?.name ?? "ไม่ระบุหมวด",
        defaultCategoryColor: fallbackCategoryColor,
        display_order: Number(product.display_order ?? 0),
        displayName: meta.name || product.name,
        id: product.id,
        name: product.name,
        printBackgroundColor: product.print_background_color,
        sku: product.sku,
        sortOrder: 0,
      };
    });
  const products: ProductPrintColorProduct[] = sortProductsByCategory(
    mappedProducts,
    categories.map((category) => ({ id: category.id, sortOrder: category.sortOrder })),
  ).map((product, index) => ({
    brand: product.brand,
    categoryIds: product.categoryIds,
    categoryName: product.categoryName,
    defaultCategoryColor: product.defaultCategoryColor,
    displayName: product.displayName,
    id: product.id,
    printBackgroundColor: product.printBackgroundColor,
    sku: product.sku,
    sortOrder: index,
  }));

  return (
    <SettingsShell
      current="products"
      title="สีพื้นหลังสินค้าในใบออเดอร์"
      description="กำหนดสีพื้นหลังรายสินค้าในใบออเดอร์ โดยยังใช้สีหมวดหมู่เป็นค่าเริ่มต้นได้"
      floatingSubmit={false}
      hideHeader
      fullWidthMobile
    >
      <ProductPrintBackgroundColorSettings categories={categories} products={products} />
    </SettingsShell>
  );
}
