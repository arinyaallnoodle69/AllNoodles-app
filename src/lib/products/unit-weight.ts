export type UnitWeightInputUnit = "g" | "kg";

export function parseUnitWeightGrams(value: string, unit: UnitWeightInputUnit) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return Number.NaN;

  return parsed * (unit === "kg" ? 1000 : 1);
}

export function getUnitWeightInput(unitWeightGrams: number | null | undefined): {
  unit: UnitWeightInputUnit;
  value: string;
} {
  if (!unitWeightGrams || unitWeightGrams <= 0) {
    return { unit: "g", value: "" };
  }

  if (unitWeightGrams >= 1000) {
    return { unit: "kg", value: String(unitWeightGrams / 1000) };
  }

  return { unit: "g", value: String(unitWeightGrams) };
}
