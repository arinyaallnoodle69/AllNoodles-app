export type CategoryPrintPalette = {
  header: string;
  rowA: string;
  rowB: string;
};

export const DEFAULT_CATEGORY_PRINT_COLORS = [
  "#EA80FC",
  "#D7EBD3",
  "#F2E6BD",
  "#EFC9CC",
  "#DACBF0",
  "#D0ECE5",
  "#EFDCCD",
  "#E4E4E4",
] as const;

export const CATEGORY_PRINT_COLOR_PRESETS = [
  "#C7A8FF",
  "#F48AC8",
  "#D9F0C7",
  "#F2E6BD",
  "#FFA3A8",
  "#D8CCFF",
  "#BFEBD9",
  "#FFD49E",
  "#E3E5EA",
] as const;

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

export function normalizePrintColor(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return HEX_COLOR_PATTERN.test(normalized) ? normalized : null;
}

export function isValidPrintColor(value: string | null | undefined) {
  return normalizePrintColor(value) !== null;
}

function hexToRgb(hex: string) {
  const value = hex.slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function toHex(value: number) {
  return Math.round(value).toString(16).padStart(2, "0").toUpperCase();
}

function mixWithWhite(hex: string, whiteRatio: number) {
  const color = hexToRgb(hex);
  const mix = (channel: number) => channel + (255 - channel) * whiteRatio;
  return `#${toHex(mix(color.r))}${toHex(mix(color.g))}${toHex(mix(color.b))}`;
}

export function buildCategoryPrintPalette(
  color: string | null | undefined,
  fallback?: CategoryPrintPalette,
): CategoryPrintPalette {
  const normalized = normalizePrintColor(color);
  if (!normalized) {
    return fallback ?? {
      header: DEFAULT_CATEGORY_PRINT_COLORS[0],
      rowA: "#F3E5F5",
      rowB: "#F3E5F5",
    };
  }

  return {
    header: normalized,
    rowA: mixWithWhite(normalized, 0.8),
    rowB: mixWithWhite(normalized, 0.91),
  };
}
