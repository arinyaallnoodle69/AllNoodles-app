export function parseInstallmentPaid(value: FormDataEntryValue | null) {
  if (value === null || value === "") return null;
  const amount = Number(value);
  return amount > 0 ? amount : null;
}
