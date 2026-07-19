const DEFAULT_UNIT_LABEL = "หน่วย";
const THAI_KILOGRAM_LABEL = "กก.";
const THAI_KILOGRAM_LABEL_WITHOUT_DOT = "กก";

export function formatDisplayUnit(unit: string | null | undefined): string {
  const normalizedUnit = unit?.trim();

  if (!normalizedUnit) return DEFAULT_UNIT_LABEL;

  const lower = normalizedUnit.toLowerCase();
  if (
    lower === "kg" ||
    lower === "kilogram" ||
    lower === "kilograms" ||
    normalizedUnit === THAI_KILOGRAM_LABEL ||
    normalizedUnit === THAI_KILOGRAM_LABEL_WITHOUT_DOT ||
    normalizedUnit === "กิโลกรัม" ||
    normalizedUnit === "ก.ก." ||
    normalizedUnit === "ก.ก"
  ) {
    return THAI_KILOGRAM_LABEL;
  }

  return normalizedUnit;
}
