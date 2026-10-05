const MAX_BAHT_FONT_PT = 12.5;
const MIN_BAHT_FONT_PT = 4.5;
const SAFE_BAHT_WIDTH_PT = 245;
const GRAPHEME_EM = 0.62;

function splitGraphemes(text: string) {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter("th", { granularity: "grapheme" }).segment(text),
      ({ segment }) => segment,
    );
  }
  return Array.from(text);
}

export function fitBillingBahtText(text: string) {
  const graphemes = splitGraphemes(text);
  const length = graphemes.length;
  // Always display on exactly 1 line without cutting or ellipsis
  const lines: [string] = [text];

  // Scale down font size dynamically so long baht text never overflows the cell
  const calculated = length > 0 ? SAFE_BAHT_WIDTH_PT / (length * GRAPHEME_EM) : MAX_BAHT_FONT_PT;
  const clamped = Math.min(MAX_BAHT_FONT_PT, calculated);
  const rounded = Math.floor(clamped * 4) / 4;
  const fontSizePt = Math.max(MIN_BAHT_FONT_PT, rounded);

  return { lines, fontSizePt };
}

export function fitBillingTotalFontSize(formattedTotal: string) {
  const MAX_TOTAL_FONT_PT = 16.5;
  const MIN_TOTAL_FONT_PT = 10;
  const SAFE_TOTAL_WIDTH_PT = 120;

  let emWidth = 0;
  for (const ch of formattedTotal) {
    if (ch === "," || ch === ".") emWidth += 0.28;
    else emWidth += 0.55;
  }

  const calculated = emWidth > 0 ? SAFE_TOTAL_WIDTH_PT / emWidth : MAX_TOTAL_FONT_PT;
  if (calculated >= MAX_TOTAL_FONT_PT) return MAX_TOTAL_FONT_PT;
  const rounded = Math.floor(calculated * 4) / 4;
  return Math.max(MIN_TOTAL_FONT_PT, rounded);
}
