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
