import Link from "next/link";
import { FolderTree, Package2 } from "lucide-react";
import { ProductCategoryManager } from "@/components/settings/product-category-manager";
import { ProductFilterClient } from "@/components/settings/product-filter-client";
import { ProductForm } from "@/components/settings/product-form";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSettingsProductsData } from "@/lib/settings/admin";

export const metadata = {
  title: "จัดการสินค้า",
};

type SettingsProductsPageProps = {
  searchParams: Promise<{
    create?: string;
    edit?: string;
    tab?: string;
  }>;
};

export default async function SettingsProductsPage({
  searchParams,
}: SettingsProductsPageProps) {
  const session = await requireAppRole("admin");
  const data = await getSettingsProductsData(session.organizationId);
  const params = await searchParams;
  const activeTab =
    params.tab === "categories" && params.create !== "1" && !params.edit
      ? "categories"
      : "products";
  const editingProduct = data.products.find((product) => product.id === params.edit) ?? null;
  const shouldShowForm =
    activeTab === "products" && (params.create === "1" || editingProduct !== null);

  return (
    <SettingsShell
      current="products"
      title="จัดการสินค้า"
      description="จัดการข้อมูลสินค้าและสต็อกทั้งหมดของคุณ"
      floatingSubmit={false}
      hideHeader
    >
      {data.setupHint ? (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {data.setupHint} กรุณารัน migration `202603160004_catalog_settings.sql`,
          `202603160005_product_inventory_fields.sql` และ
          `202604051200_product_categories.sql` ก่อนใช้งานหน้านี้
        </div>
      ) : null}

      {activeTab === "categories" ? (
        <>
          <div className="mb-4 inline-flex rounded-lg border border-[#E1BEE7] bg-white p-1 shadow-sm">
            <Link
              href="/settings/products"
              scroll={false}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition text-[#4A148C] hover:bg-slate-50"
            >
              <Package2 className="h-4 w-4" strokeWidth={2.1} />
              จัดการสินค้า
            </Link>
            <Link
              href="/settings/products?tab=categories"
              scroll={false}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition bg-[#4A148C] text-white shadow-[0_10px_24px_rgba(142, 36, 170,0.18)]"
            >
              <FolderTree className="h-4 w-4" strokeWidth={2.1} />
              เพิ่มหมวดหมู่
            </Link>
          </div>
          <ProductCategoryManager categories={data.productCategories} products={data.products} />
        </>
      ) : (
        <>
          <ProductFilterClient
            allProducts={data.products}
            baseListHref="/settings/products"
          >
            <div className="mb-4 inline-flex rounded-lg border border-[#E1BEE7] bg-white p-1 shadow-sm">
              <Link
                href="/settings/products"
                scroll={false}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition bg-[#4A148C] text-white shadow-[0_10px_24px_rgba(142, 36, 170,0.18)]"
              >
                <Package2 className="h-4 w-4" strokeWidth={2.1} />
                จัดการสินค้า
              </Link>
              <Link
                href="/settings/products?tab=categories"
                scroll={false}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition text-[#4A148C] hover:bg-slate-50"
              >
                <FolderTree className="h-4 w-4" strokeWidth={2.1} />
                เพิ่มหมวดหมู่
              </Link>
            </div>
          </ProductFilterClient>
          {shouldShowForm ? (
            <ProductForm
              categories={data.productCategories}
              editingProduct={editingProduct}
              nextSku={data.nextProductSku}
              productList={data.products}
              returnHref="/settings/products"
            />
          ) : null}
        </>
      )}
    </SettingsShell>
  );
}
