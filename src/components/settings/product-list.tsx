import Link from "next/link";
import { Package2, Pencil, Plus, Power, History } from "lucide-react";
import { deleteProduct, setProductActive } from "@/app/dashboard/settings/actions";
import { DeleteProductButton } from "@/components/settings/delete-product-button";
import { ProductCostHistoryButton } from "@/components/settings/product-cost-history-button";
import { ProductImagePreview } from "@/components/settings/product-image-preview";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import type { SettingsProduct } from "@/lib/settings/admin";

type ProductListProps = {
  baseListHref?: string;
  products: SettingsProduct[];
};

function formatCost(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ProductList({ products, baseListHref = "/settings/products" }: ProductListProps) {
  const createHref = `${baseListHref}${baseListHref.includes("?") ? "&" : "?"}create=1`;
  const editHref = (id: string) =>
    `${baseListHref}${baseListHref.includes("?") ? "&" : "?"}edit=${id}`;

  return (
    <>
    {/* Floating add button */}
    <Link
      href={createHref}
      scroll={false}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] left-4 z-50 inline-flex items-center gap-2 rounded-full bg-[#003366] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_8px_32px_rgba(0,51,102,0.35)] transition hover:bg-[#002244] active:scale-95 md:bottom-8 md:left-auto md:right-8"
    >
      <Plus className="h-4 w-4" strokeWidth={2.5} />
      เพิ่มสินค้า
    </Link>

    <SettingsPanel className="sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-sm rounded-none border-none shadow-none bg-transparent sm:bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-5 md:flex-row md:items-center md:justify-between sm:rounded-t-xl">
        <div>
          <h2 className="text-xl font-bold text-slate-950">รายการสินค้า</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            ดูสินค้าและจัดการสินค้าได้ที่นี่
          </p>
        </div>
      </div>

      <SettingsPanelBody className="p-0">
        {products.length > 0 ? (
          <>
            {/* Mobile cards - Full Width */}
            <div className="grid grid-cols-1 divide-y divide-slate-200 px-0 py-0 sm:hidden">
              {products.map((product) => {
                const deleteFormId = `delete-product-${product.id}`;
                const defaultUnit = product.saleUnits.find((u) => u.isDefault) || product.saleUnits[0];

                return (
                  <article
                    key={product.id}
                    className={`w-full bg-white px-4 py-6 shadow-none transition-colors ${
                      product.isActive ? "" : "opacity-70 bg-slate-50/30"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white">
                        {product.imageUrls[0] ? (
                          <ProductImagePreview src={product.imageUrls[0]} alt={product.name} thumbnailSizes="112px" />
                        ) : (
                          <Package2 className="h-9 w-9 text-slate-300" strokeWidth={1.5} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#003366]/40">
                          {product.sku}
                        </p>
                        <p className="mt-0.5 text-lg font-black leading-tight text-slate-950">
                          {product.name}
                        </p>
                        
                        <div className="mt-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 mb-1.5 ml-1">ต้นทุน / หน่วย</p>
                          {defaultUnit ? (
                            <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm bg-[#003366]/5 border border-[#003366]/10">
                              <span className="font-bold text-[#003366]">
                                {product.baseUnit}
                              </span>
                              <span className="font-black text-[#003366]">
                                {formatCost(defaultUnit.effectiveCostPrice)} บาท
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                              product.isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-500 border border-slate-200"
                            }`}
                          >
                            {product.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-100">
                      {/* 4 Buttons in one row on mobile */}
                      <div className="grid grid-cols-4 gap-2">
                        <Link
                          href={editHref(product.id)}
                          scroll={false}
                          className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
                        >
                          <Pencil className="h-4 w-4 text-[#003366]" strokeWidth={2.5} />
                          แก้ไข
                        </Link>

                        <ProductCostHistoryButton 
                          productId={product.id} 
                          productName={product.name} 
                          triggerClassName="w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
                        />

                        <form action={setProductActive}>
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="nextState" value={product.isActive ? "false" : "true"} />
                          <button
                            type="submit"
                            className="w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
                          >
                            <Power className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
                            {product.isActive ? "ปิด" : "เปิด"}
                          </button>
                        </form>

                        <div className="relative">
                          <form id={deleteFormId} className="hidden">
                            <input type="hidden" name="productId" value={product.id} />
                          </form>
                          <DeleteProductButton 
                            formId={deleteFormId} 
                            productName={product.name}
                            triggerClassName="w-full h-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50/50 py-2.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-50 active:scale-95"
                          />
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full border-collapse border border-slate-300 text-left">
                <thead>
                  <tr style={{ backgroundColor: "#003366" }}>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      รหัสสินค้า
                    </th>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      รายการสินค้า
                    </th>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      หน่วยขาย
                    </th>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      ต้นทุน / หน่วย
                    </th>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      สถานะ
                    </th>
                    <th
                      style={{ color: "white" }}
                      className="border-b border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                    >
                      จัดการ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {products.map((product) => {
                    const deleteFormId = `delete-product-table-${product.id}`;
                    const defaultUnit = product.saleUnits.find((u) => u.isDefault) || product.saleUnits[0];

                    return (
                      <tr
                        key={product.id}
                        className={product.isActive ? "hover:bg-slate-50/50" : "bg-slate-100/50 opacity-60"}
                      >
                        {/* รหัสสินค้า */}
                        <td className="border-r border-slate-300 px-6 py-5 text-center align-middle text-base font-bold text-slate-900">
                          {product.sku}
                        </td>

                        {/* รายการสินค้า */}
                        <td className="border-r border-slate-300 px-6 py-5 align-middle">
                          <div className="flex items-center gap-4">
                            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                              {product.imageUrls[0] ? (
                                <ProductImagePreview src={product.imageUrls[0]} alt={product.name} thumbnailSizes="64px" />
                              ) : (
                                <Package2 className="h-7 w-7 text-slate-300" strokeWidth={1.5} />
                              )}
                            </div>
                            <p className="text-base font-black text-slate-950 tracking-tight">{product.name}</p>
                          </div>
                        </td>

                        {/* หน่วยขาย */}
                        <td className="border-r border-slate-300 p-0 align-middle">
                          <div className="flex min-h-[3.25rem] items-center px-5 py-2.5">
                            <span className="text-base font-bold text-slate-800">{product.baseUnit}</span>
                          </div>
                        </td>

                        {/* ต้นทุน / หน่วย */}
                        <td className="border-r border-slate-300 p-0 align-middle">
                          {defaultUnit ? (
                            <div className="flex min-h-[3.25rem] items-center px-5 py-2.5">
                              <p className="text-base font-black text-slate-950">
                                {formatCost(defaultUnit.effectiveCostPrice)} บาท
                              </p>
                            </div>
                          ) : null}
                        </td>

                        {/* สถานะ */}
                        <td className="border-r border-slate-300 px-6 py-5 text-center align-middle">
                          <span
                            className={`inline-flex rounded-full px-4 py-1.5 text-xs font-black leading-none ${
                              product.isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-500 border border-slate-200"
                            }`}
                          >
                            {product.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
                          </span>
                        </td>

                        {/* จัดการ */}
                        <td className="px-6 py-5 text-center align-middle">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              href={editHref(product.id)}
                              scroll={false}
                              className="action-touch-safe inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 active:scale-95"
                            >
                              <Pencil className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.5} />
                              แก้ไข
                            </Link>

                            <ProductCostHistoryButton productId={product.id} productName={product.name} />

                            <form action={setProductActive}>
                              <input type="hidden" name="productId" value={product.id} />
                              <input type="hidden" name="nextState" value={product.isActive ? "false" : "true"} />
                              <button
                                type="submit"
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 active:scale-95"
                              >
                                <Power className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                                {product.isActive ? "ปิด" : "เปิด"}
                              </button>
                            </form>

                            <div className="ml-1">
                              <form id={deleteFormId} className="hidden">
                                <input type="hidden" name="productId" value={product.id} />
                              </form>
                              <DeleteProductButton formId={deleteFormId} productName={product.name} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-6">
            <SettingsEmptyState className="py-14">
              {'ยังไม่มีสินค้าในระบบ กดปุ่ม "เพิ่มสินค้า" เพื่อเริ่มสร้างรายการแรก'}
            </SettingsEmptyState>
          </div>
        )}
      </SettingsPanelBody>
    </SettingsPanel>
    </>
  );
}
