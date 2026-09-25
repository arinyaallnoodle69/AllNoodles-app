export function paginateStandardStoreIndices(
  storeIndices: number[],
  bodyHeightMm: number,
  minRowHeightMm: number,
): number[][] {
  const maxRowsPerPage = Math.max(2, Math.floor(bodyHeightMm / minRowHeightMm));
  const lastPageStoreCapacity = maxRowsPerPage - 1;

  if (storeIndices.length <= lastPageStoreCapacity) return [storeIndices];

  const pages: number[][] = [];
  let offset = 0;

  while (storeIndices.length - offset > lastPageStoreCapacity) {
    const remaining = storeIndices.length - offset;
    const pageSize = remaining <= maxRowsPerPage
      ? remaining - 1
      : maxRowsPerPage;

    pages.push(storeIndices.slice(offset, offset + pageSize));
    offset += pageSize;
  }

  pages.push(storeIndices.slice(offset));
  return pages;
}
