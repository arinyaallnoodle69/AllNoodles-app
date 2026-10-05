const ONE_LINE_LIMIT = 34;
const ONE_LINE_MAX_FONT_PT = 10.5;
const TWO_LINE_MAX_FONT_PT = 8.5;
const MIN_FONT_PT = 7;
const REFERENCE_LINE_LENGTH = 29;

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
  const lines = graphemes.length <= ONE_LINE_LIMIT
    ? [text]
    : [
        graphemes.slice(0, Math.ceil(graphemes.length / 2)).join(""),
        graphemes.slice(Math.ceil(graphemes.length / 2)).join(""),
      ];
  const longestLine = Math.max(...lines.map((line) => splitGraphemes(line).length));
  const maxFont = lines.length === 1 ? ONE_LINE_MAX_FONT_PT : TWO_LINE_MAX_FONT_PT;
  const fontSizePt = Math.max(
    MIN_FONT_PT,
    Math.min(maxFont, Math.floor((maxFont * REFERENCE_LINE_LENGTH * 4) / longestLine) / 4),
  );

  return { lines, fontSizePt };
}
