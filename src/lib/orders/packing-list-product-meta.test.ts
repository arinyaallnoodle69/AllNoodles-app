import assert from "node:assert/strict";
import { getPackingListProductMeta } from "./packing-list-product-meta";

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
