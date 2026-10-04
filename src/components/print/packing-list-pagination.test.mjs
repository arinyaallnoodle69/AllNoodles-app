import assert from "node:assert/strict";
import test from "node:test";

import { paginateStandardStoreIndices } from "./packing-list-pagination.ts";

test("reserves one physical row for the total on the final page", () => {
  assert.deepEqual(
    paginateStandardStoreIndices(Array.from({ length: 32 }, (_, index) => index), 151, 4.45),
    [Array.from({ length: 32 }, (_, index) => index)],
  );

  const pages = paginateStandardStoreIndices(
    Array.from({ length: 33 }, (_, index) => index),
    151,
    4.45,
  );

  assert.deepEqual(pages.map((page) => page.length), [32, 1]);
  assert.deepEqual(pages.flat(), Array.from({ length: 33 }, (_, index) => index));
});

test("fills ordinary pages without losing or duplicating stores", () => {
  const stores = Array.from({ length: 65 }, (_, index) => index);
  const pages = paginateStandardStoreIndices(stores, 151, 4.45);

  assert.deepEqual(pages.map((page) => page.length), [33, 32]);
  assert.deepEqual(pages.flat(), stores);
});

test("automatically paginates when stores exceed safe capacity for closing total row per paginationlogic.md", () => {
  // Safe capacity: 25 stores fits on 1 page with total row
  const stores25 = Array.from({ length: 25 }, (_, index) => index);
  const pages25 = paginateStandardStoreIndices(stores25, 146, 5.0, 7.8);
  assert.deepEqual(pages25.map((page) => page.length), [25]);

  // 28 stores exceeds safe closing row space: automatically paginates into 2 pages
  const stores28 = Array.from({ length: 28 }, (_, index) => index);
  const pages28 = paginateStandardStoreIndices(stores28, 146, 5.0, 7.8);
  assert.deepEqual(pages28.map((page) => page.length), [26, 2]);
  assert.deepEqual(pages28.flat(), stores28);
});

