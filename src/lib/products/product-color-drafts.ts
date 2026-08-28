export type ProductColorDrafts = Record<string, string | null>;

export function collectChangedProductColors(
  draftColors: ProductColorDrafts,
  savedColors: ProductColorDrafts,
) {
  return Object.entries(draftColors)
    .filter(([productId, color]) => color !== (savedColors[productId] ?? null))
    .map(([productId, color]) => ({ productId, color }));
}

export function rollbackProductColors(
  draftColors: ProductColorDrafts,
  savedColors: ProductColorDrafts,
  productIds: string[],
) {
  const next = { ...draftColors };
  for (const productId of productIds) {
    next[productId] = savedColors[productId] ?? null;
  }
  return next;
}
