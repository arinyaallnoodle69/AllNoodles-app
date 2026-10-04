export function paginateStandardStoreIndices(
  storeIndices: number[],
  bodyHeightMm: number,
  minRowHeightMm: number,
  totalRowHeightMm?: number,
): number[][] {
  const maxRowsPerPage = Math.max(2, Math.floor(bodyHeightMm / minRowHeightMm));
  // Reserve space for the closing total row on the final page per docs/paginationlogic.md
  const reservedTotalHeight = totalRowHeightMm ?? minRowHeightMm;
  const lastPageStoreCapacity = Math.max(
    1,
    Math.floor((bodyHeightMm - reservedTotalHeight) / minRowHeightMm),
  );

  if (storeIndices.length <= lastPageStoreCapacity) return [storeIndices];

  const pages: number[][] = [];
  let offset = 0;
  // Avoid single orphan row on the last page per docs/paginationlogic.md
  const minLastPageStores = totalRowHeightMm !== undefined ? 2 : 1;

  while (storeIndices.length - offset > lastPageStoreCapacity) {
    const remaining = storeIndices.length - offset;
    let pageSize = maxRowsPerPage;

    if (remaining <= maxRowsPerPage + lastPageStoreCapacity) {
      if (remaining <= maxRowsPerPage) {
        pageSize = Math.min(maxRowsPerPage, Math.max(1, remaining - minLastPageStores));
      } else if (remaining - maxRowsPerPage < minLastPageStores) {
        pageSize = remaining - minLastPageStores;
      }
    }

    pages.push(storeIndices.slice(offset, offset + pageSize));
    offset += pageSize;
  }

  pages.push(storeIndices.slice(offset));
  return pages;
}

