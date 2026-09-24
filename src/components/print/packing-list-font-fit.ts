export function getPackingPageFontScale(productCount: number) {
  if (productCount <= 20) return 1.22;
  if (productCount <= 30) return 1.15;
  if (productCount <= 40) return 1.08;
  return 1;
}

export function fitPackingProductHeaderFont({
  columnWidthMm,
  hasIcon,
  lineCount,
  longestLineLength,
  productCount,
}: {
  columnWidthMm: number;
  hasIcon: boolean;
  lineCount: number;
  longestLineLength: number;
  productCount: number;
}) {
  const targetPt = 15 * getPackingPageFontScale(productCount);
  const usableHeightPt = 24.9 * 2.83465 - (hasIcon ? 9 : 0);
  const verticalLimitPt = usableHeightPt / (Math.max(lineCount, 1) * 1.25);
  const usableWidthPt = Math.max(columnWidthMm - 0.8, 1) * 2.83465;
  const horizontalLimitPt = usableWidthPt / (Math.max(longestLineLength, 1) * 0.38);

  return Math.floor(Math.min(targetPt, verticalLimitPt, horizontalLimitPt) * 4) / 4;
}
