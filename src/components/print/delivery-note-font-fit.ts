const DEFAULT_FONT_SIZE_PT = 20;
const MIN_FONT_SIZE_PT = 13.5;
const SAFE_GRAPHEME_COUNT = 34;

export function fitDeliveryItemFontSize(label: string) {
  const length = typeof Intl.Segmenter === "function"
    ? Array.from(new Intl.Segmenter("th", { granularity: "grapheme" }).segment(label)).length
    : Array.from(label).length;

  if (length <= SAFE_GRAPHEME_COUNT) return DEFAULT_FONT_SIZE_PT;

  return Math.max(
    MIN_FONT_SIZE_PT,
    Math.floor((DEFAULT_FONT_SIZE_PT * SAFE_GRAPHEME_COUNT * 2) / length) / 2,
  );
}
