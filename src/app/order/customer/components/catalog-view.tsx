"use client";

import Image from "next/image";
import { Star } from "lucide-react";
import { CatalogProductGrid } from "@/app/order/customer/components/catalog-product-grid";
import type { ProductWithImage } from "@/app/order/customer/types";

type FrequentProductCard = {
  product: ProductWithImage;
};

export function CatalogView({
  cart,
  favorites,
  frequentProductCards,
  getDisplayUnit,
  gridProducts,
  onAddFrequentProduct,
  onOpenProduct,
  onToggleFavorite,
}: {
  cart: Record<string, number>;
  favorites: Record<string, boolean>;
  frequentProductCards: FrequentProductCard[];
  getDisplayUnit: (unit: string | null | undefined) => string;
  gridProducts: ProductWithImage[];
  onAddFrequentProduct: (
    productId: string,
    minOrderQty: number,
    sourceImage: HTMLImageElement | null,
  ) => void;
  onOpenProduct: (productId: string) => void;
  onToggleFavorite: (productId: string) => void;
}) {
  return (
    <>
      {gridProducts.length === 0 ? (
        <div className="py-10 text-center text-slate-500">ไม่พบสินค้าที่คุณค้นหา</div>
      ) : (
        <div>
          {frequentProductCards.length > 0 ? (
            <section className="-mx-3 space-y-2 px-3 py-0.5 md:mx-0 md:px-0">
              <div className="px-1 md:px-0">
                <h2 className="text-base font-bold text-slate-900">สินค้าที่สั่งซื้อบ่อย</h2>
              </div>
              <div className="overflow-x-auto pb-1 snap-x snap-mandatory [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
                <div className="flex gap-0">
                  {frequentProductCards.map(({ product }) => {
                    const imageUrl =
                      product.product_images?.[0]?.public_url ||
                      "/placeholders/product-placeholder.svg";

                    return (
                      <article
                        key={`frequent-${product.id}`}
                        className="-mr-5 relative flex h-[5.1rem] w-[17.5rem] shrink-0 snap-start items-center pr-0 last:mr-0"
                      >
                        <div className="absolute inset-y-0 left-[2.3rem] right-8 rounded-lg bg-slate-100/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" />
                        <div className="relative z-10 h-[5.1rem] w-[5.1rem] shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          <div className="absolute left-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-[#003366] px-1.5 py-0.5 text-[8px] font-bold text-white shadow-[0_8px_16px_rgba(0,51,102,0.22)]">
                            <Star className="h-2.5 w-2.5 fill-current" strokeWidth={2.3} />
                            ซื้อบ่อย
                          </div>
                          <Image
                            src={imageUrl}
                            alt={product.name}
                            fill
                            sizes="82px"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="relative z-10 ml-[-0.1rem] min-w-0 flex-1 self-stretch px-3 pt-2 pb-1.5">
                          <div className="flex h-full min-w-0 flex-col justify-between gap-2 pr-10">
                            <div className="min-w-0">
                              <p className="truncate pt-0.5 text-[0.82rem] font-semibold leading-[1.25rem] text-slate-900">
                                {product.name}
                              </p>
                              <p className="mt-1 text-[11px] font-medium text-slate-500">
                                หน่วย {getDisplayUnit(product.sale_unit_label)}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(event) =>
                              onAddFrequentProduct(
                                product.id,
                                product.min_order_qty ?? 1,
                                (event.currentTarget.closest("article")?.querySelector("img") as HTMLImageElement | null) ?? null,
                              )
                            }
                            aria-label={`เพิ่ม ${product.name} ใส่ตะกร้า`}
                            className="absolute bottom-2 right-11 flex h-8 w-8 items-center justify-center rounded-lg bg-[#003366] text-white shadow-[0_8px_18px_rgba(0,51,102,0.22)] transition-all hover:bg-[#0a437d] active:scale-[0.95]"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3.5 w-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M12 5v14M5 12h14" />
                            </svg>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}

          <CatalogProductGrid
            products={gridProducts}
            cart={cart}
            favorites={favorites}
            onOpenProduct={onOpenProduct}
            onToggleFavorite={onToggleFavorite}
            priorityCount={4}
          />
        </div>
      )}
    </>
  );
}
