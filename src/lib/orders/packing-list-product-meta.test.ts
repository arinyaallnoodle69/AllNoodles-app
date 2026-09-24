import assert from "node:assert/strict";
import { getPackingListProductMeta, sortPackingListProducts } from "./packing-list-product-meta";

assert.deepEqual(
  getPackingListProductMeta({
    categoryNames: ["บะหมี่", "เส้นสด"],
    name: "บะหมี่มังกรเหลือง",
    metadata: {
      brand: "YA",
      packing_list_icon: "🍜",
      packing_list_name: "เหลือง",
    },
  }),
  {
    brand: "YA",
    category: "บะหมี่",
    icon: "🍜",
    name: "เหลือง",
  },
);

const orderedProducts = sortPackingListProducts(
  [
    { productId: "p3", category: "เส้น", brand: "แสดง B", sortBrand: "B", sku: "3", name: "สาม" },
    { productId: "p2", category: "เส้น", brand: "แสดง A", sortBrand: "A", sku: "2", name: "สอง" },
    { productId: "p1", category: "เส้น", brand: "แสดง A", sortBrand: "A", sku: "1", name: "หนึ่ง" },
    { productId: "p4", category: "บะหมี่", brand: "แสดง A", sortBrand: "A", sku: "4", name: "สี่" },
  ],
  {
    brandRankByName: new Map([["a", 0], ["b", 1]]),
    categoryRankByProductId: new Map([["p1", 1], ["p2", 1], ["p3", 1], ["p4", 0]]),
    displayOrderByProductId: new Map([["p1", 2], ["p2", 1], ["p3", 0], ["p4", 3]]),
    productIndexById: new Map(),
  },
);

assert.deepEqual(orderedProducts.map((product) => product.productId), ["p4", "p2", "p1", "p3"]);

assert.deepEqual(
  getPackingListProductMeta({
    categoryNames: [],
    name: "แผ่นเกี๊ยวหมู",
    metadata: {
      category: "เกี๊ยว",
      packing_list_brand: "Premium",
      packing_list_name: "",
    },
  }),
  {
    brand: "Premium",
    category: "เกี๊ยว",
    icon: "",
    name: "แผ่นเกี๊ยวหมู",
  },
);
