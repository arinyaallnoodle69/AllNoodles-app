export type PackingListProductMetaInput = {
  categoryNames?: string[];
  metadata: unknown;
  name: string;
};

export type PackingListProductMeta = {
  brand: string;
  category: string;
  icon: string;
  name: string;
};

type PackingListSortableProduct = {
  brand: string;
  category: string;
  name: string;
  productId: string;
  sku: string;
  sortBrand: string;
};

type PackingListProductOrder = {
  brandRankByName: Map<string, number>;
  categoryRankByProductId: Map<string, number>;
  displayOrderByProductId: Map<string, number>;
  productIndexById: Map<string, number>;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function getPackingListProductMeta({
  categoryNames = [],
  metadata,
  name,
}: PackingListProductMetaInput): PackingListProductMeta {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};

  const packingListName = getString(meta.packing_list_name);
  const packingListBrand = getString(meta.packing_list_brand);
  const brand = getString(meta.brand);
  const icon = getString(meta.packing_list_icon);
  const categoryFromRelation = categoryNames.map((categoryName) => categoryName.trim()).find(Boolean) ?? "";
  const categoryFromMetadata = getString(meta.category).split(",").map((item) => item.trim()).find(Boolean) ?? "";

  return {
    brand: packingListBrand || brand,
    category: categoryFromRelation || categoryFromMetadata,
    icon,
    name: packingListName || name.trim(),
  };
}

export function sortPackingListProducts<T extends PackingListSortableProduct>(
  products: T[],
  order: PackingListProductOrder,
): T[] {
  return products.toSorted((a, b) => {
    const categoryRankDiff =
      (order.categoryRankByProductId.get(a.productId) ?? Infinity) -
      (order.categoryRankByProductId.get(b.productId) ?? Infinity);
    if (categoryRankDiff !== 0) return categoryRankDiff;

    const categoryDiff = a.category.localeCompare(b.category, "th");
    if (categoryDiff !== 0) return categoryDiff;

    const normalizedBrandA = a.sortBrand.trim().toLocaleLowerCase("th");
    const normalizedBrandB = b.sortBrand.trim().toLocaleLowerCase("th");
    const brandRankDiff =
      (order.brandRankByName.get(normalizedBrandA) ?? Infinity) -
      (order.brandRankByName.get(normalizedBrandB) ?? Infinity);
    if (brandRankDiff !== 0) return brandRankDiff;

    const brandDiff = normalizedBrandA.localeCompare(normalizedBrandB, "th");
    if (brandDiff !== 0) return brandDiff;

    const displayOrderDiff =
      (order.displayOrderByProductId.get(a.productId) ?? Infinity) -
      (order.displayOrderByProductId.get(b.productId) ?? Infinity);
    if (displayOrderDiff !== 0) return displayOrderDiff;

    const productIndexDiff =
      (order.productIndexById.get(a.productId) ?? Infinity) -
      (order.productIndexById.get(b.productId) ?? Infinity);
    if (productIndexDiff !== 0) return productIndexDiff;

    return a.sku.localeCompare(b.sku) || a.name.localeCompare(b.name, "th");
  });
}
