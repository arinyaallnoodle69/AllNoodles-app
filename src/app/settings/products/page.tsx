import Link from "next/link";
import { FolderTree, Package2 } from "lucide-react";
import { ProductCategoryManager } from "@/components/settings/product-category-manager";
import { ProductFilterClient } from "@/components/settings/product-filter-client";
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

  const tabSwitcher = (
    <div className="mx-4 sm:mx-0 hidden lg:inline-flex rounded-lg border border-[#E1BEE7] bg-white p-1 shadow-sm">
      <Link
        href="/settings/products"
        scroll={false}
        className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition ${
          activeTab === "products"
            ? "bg-[#4A148C] text-white shadow-[0_10px_24px_rgba(142, 36, 170,0.18)]"
            : "text-[#4A148C] hover:bg-slate-50"
        }`}
      >
        <Package2 className="h-4 w-4" strokeWidth={2.1} />
        ตารางสินค้า
      </Link>
      <Link
        href="/settings/products?tab=categories"
        scroll={false}
        className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition ${
          activeTab === "categories"
            ? "bg-[#4A148C] text-white shadow-[0_10px_24px_rgba(142, 36, 170,0.18)]"
            : "text-[#4A148C] hover:bg-slate-50"
        }`}
      >
        <FolderTree className="h-4 w-4" strokeWidth={2.1} />
        จัดการหมวดหมู่
      </Link>
    </div>
  );

  return (
    <SettingsShell
      current="products"
      title="จัดการสินค้า"
      description="จัดการข้อมูลสินค้าและสต็อกทั้งหมดของคุณ"
      floatingSubmit={false}
      hideHeader
      fullWidthMobile={true}
    >
      {data.setupHint ? (
        <div className="mb-8 mx-4 sm:mx-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {data.setupHint} กรุณารัน migration `202603160004_catalog_settings.sql`,
          `202603160005_product_inventory_fields.sql` และ
          `202604051200_product_categories.sql` ก่อนใช้งานหน้านี้
        </div>
      ) : null}

      {/* Mobile Top Tabs (sits directly under the header on mobile, scrolls naturally) */}
      <div className="border-b border-slate-200 bg-white flex lg:hidden">
        <Link
          href="/settings/products"
          scroll={false}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 border-b-2 py-2 transition-colors ${
            activeTab === "products"
              ? "border-[#4A148C] text-[#4A148C]"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Package2 className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          <span className="text-[11px] font-black leading-tight">ตารางสินค้า</span>
        </Link>
        <Link
          href="/settings/products?tab=categories"
          scroll={false}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 border-b-2 py-2 transition-colors ${
            activeTab === "categories"
              ? "border-[#4A148C] text-[#4A148C]"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <FolderTree className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          <span className="text-[11px] font-black leading-tight">จัดการหมวดหมู่</span>
        </Link>
      </div>

      <div className="pt-0">
        {activeTab === "categories" ? (
          <>
            <div className="mb-4 mx-4 sm:mx-0">
              {tabSwitcher}
            </div>
            <div className="px-4 sm:px-0">
              <ProductCategoryManager categories={data.productCategories} products={data.products} />
            </div>
          </>
        ) : (
          <>
            <ProductFilterClient
              allProducts={data.products}
              baseListHref="/settings/products"
              categories={data.productCategories}
              suppliers={data.suppliers}
              nextSku={data.nextProductSku}
              initialCreate={params.create === "1"}
              initialEditProduct={editingProduct}
            >
              {tabSwitcher}
            </ProductFilterClient>
          </>
        )}
      </div>
    </SettingsShell>
  );
}
