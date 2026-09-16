export function getCustomerSalesPreviewSize(
  availableWidth: number,
  pageWidth: number,
  pageHeight: number,
) {
  const scale = Math.min(1, availableWidth / pageWidth);
  return { scale, width: pageWidth * scale, height: pageHeight * scale };
}
