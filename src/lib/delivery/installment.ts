export function parseInstallmentPaid(value: FormDataEntryValue | null) {
  if (value === null || value === "") return 0;
  const amount = Number(value);
  return amount > 0 ? amount : 0;
}
