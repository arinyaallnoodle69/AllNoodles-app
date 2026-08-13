export async function generateSequentialReceiptNumbers(
  count: number,
  generateNext: () => Promise<string>,
) {
  const numbers: string[] = [];

  for (let index = 0; index < count; index += 1) {
    numbers.push(await generateNext());
  }

  return numbers;
}
