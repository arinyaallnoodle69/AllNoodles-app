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
