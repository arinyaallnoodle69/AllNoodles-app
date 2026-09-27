import assert from "node:assert/strict";
import test from "node:test";
import { fmtDateFileTH, fmtDateRangeFileTH } from "./date.ts";

test("formats Thai Buddhist dates for document file names", () => {
  assert.equal(fmtDateFileTH("2026-09-25"), "25-09-2569");
  assert.equal(fmtDateRangeFileTH("2026-09-25", "2026-09-27"), "25-09-2569_ถึง_27-09-2569");
  assert.equal(fmtDateRangeFileTH("2026-09-25", "2026-09-25"), "25-09-2569");
});
