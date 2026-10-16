"use client";

import { Fragment, useState, type ReactNode } from "react";
import { ProductFactoryBrandFilters } from "@/components/settings/product-factory-brand-filters";

type Props = {
  factoryName: string;
  brands: string[];
  items: { id: string; brand: string; content: ReactNode }[];
};

export function ReserveStockProductFilters({ factoryName, brands, items }: Props) {
  const [factory, setFactory] = useState("__all__");
  const [brand, setBrand] = useState("__all__");
  const availableBrands = [...new Set(items.map(item => item.brand).filter(Boolean))].sort((a, b) => {
    const first = brands.indexOf(a), second = brands.indexOf(b);
    return (first < 0 ? Infinity : first) - (second < 0 ? Infinity : second) || a.localeCompare(b, "th");
  });
  const selectedBrand = availableBrands.includes(brand) ? brand : "__all__";
  const filtered = items.filter(item => selectedBrand === "__all__" || item.brand === selectedBrand);

  return <>
    <ProductFactoryBrandFilters
      factoryOptions={items.length ? [factoryName] : []}
      brandOptions={availableBrands}
      selectedFactory={factory}
      selectedBrand={selectedBrand}
      onFactorySelect={value => { setFactory(value); if (value === "__all__") setBrand("__all__"); }}
      onBrandSelect={setBrand}
    />
    {filtered.length ? filtered.map(item => <Fragment key={item.id}>{item.content}</Fragment>) : <p role="status" className="px-4 py-6 text-center text-base text-slate-500">ไม่พบสินค้า</p>}
  </>;
}
