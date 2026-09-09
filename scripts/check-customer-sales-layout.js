// Open the customer sales preview, then run:
// playwright-cli run-code --filename scripts/check-customer-sales-layout.js
/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI invokes this function. */
async (page) => {
  await page.waitForSelector("[data-customer-sales-report]");
  await page.waitForSelector("[data-customer-sales-capture-page]");
  await page.evaluate(() => document.fonts.ready);
  const check = () => page.evaluate(() => {
    const report = document.querySelector("[data-customer-sales-report]");
    const pages = [...document.querySelectorAll(".customer-sales-print-area > [data-customer-sales-capture-page]")];
    if (!report || pages.length === 0) throw new Error("Missing paginated preview");
    const rows = pages.flatMap((sheet) => [...sheet.querySelectorAll("[data-store-row]")]);
    if (rows.length !== report.querySelectorAll("[data-store-row]").length) throw new Error("Preview lost customer rows");
    if (rows.some((row, i) => Number(row.cells[0].textContent) !== i + 1)) throw new Error("Missing customer rows");
    if (pages.some((sheet) => sheet.scrollHeight > sheet.clientHeight + 1)) throw new Error("Page content is clipped");
    if (pages.slice(0, -1).some((sheet) => sheet.querySelector("footer")) || !pages.at(-1).querySelector("footer")) throw new Error("Footer is on the wrong page");
    if (pages.some((sheet) => !sheet.querySelector("thead"))) throw new Error("Missing repeated table header");
    for (const element of pages[0].querySelectorAll("*")) {
      if (getComputedStyle(element).color !== "rgb(0, 0, 0)") throw new Error("Text is not black");
    }
    return { rows: rows.length, pages: pages.length };
  });
  const result = await check();
  await page.emulateMedia({ media: "print" });
  try {
    if ((await check()).rows !== result.rows) throw new Error("Print lost rows");
    await page.evaluate(() => {
      if (getComputedStyle(document.querySelector("[data-customer-sales-capture-page]")).zoom !== "1") throw new Error("Print is scaled");
    });
  } finally {
    await page.emulateMedia({ media: "screen" });
  }
  return { ...result, paginated: true, blackText: true };
}
