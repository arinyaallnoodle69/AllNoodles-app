import assert from "node:assert/strict";
import test from "node:test";
import { invalidateSelectedStockTabCache } from "./stock-tab-cache.ts";

test("invalidates a previously loaded empty history when history is opened again", () => {
  const issues = [{ id: "issue-1" }];

  const result = invalidateSelectedStockTabCache("history", {
    historyData: [],
    issuesData: issues,
  });

  assert.equal(result.historyData, null);
  assert.equal(result.issuesData, issues);
});
