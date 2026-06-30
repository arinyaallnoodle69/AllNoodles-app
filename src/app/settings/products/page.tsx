import { ProductSettingsTabs } from "@/components/settings/product-settings-tabs";
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
      : params.tab === "brands" && params.create !== "1" && !params.edit
      ? "brands"
      : "products";
  const editingProduct = data.products.find((product) => product.id === params.edit) ?? null;

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

      <ProductSettingsTabs
        products={data.products}
        categories={data.productCategories}
        brands={data.productBrands}
        suppliers={data.suppliers}
        nextSku={data.nextProductSku}
        initialTab={activeTab}
        initialCreate={params.create === "1"}
        initialEditProduct={editingProduct}
      />
    </SettingsShell>
  );
}
