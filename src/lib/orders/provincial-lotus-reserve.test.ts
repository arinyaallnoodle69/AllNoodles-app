import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node strip-types requires the TypeScript extension.
import { isProvincialLotusReserve } from "./provincial-lotus-reserve.ts";

for (const [date, expected] of [["2026-10-12",false],["2026-10-13",true],["2026-10-14",true],["2026-10-15",false],["2026-10-16",true],["2026-10-17",true],["2026-10-18",true]]) {
  test(`legacy Lotus province ${date} reserve=${expected}`,()=>assert.equal(isProvincialLotusReserve("fresh","คลังต่างจังหวัด","TYV005",date,"legacy"),expected));
}
test("explicit reserve survives factory days; factory and stock products keep their source",()=>{
 assert.equal(isProvincialLotusReserve("fresh","คลังต่างจังหวัด","TYV005","2026-10-15","reserve"),true);
 assert.equal(isProvincialLotusReserve("fresh","คลังต่างจังหวัด","TYV005","2026-10-16","factory"),false);
 assert.equal(isProvincialLotusReserve("stock","คลังต่างจังหวัด","TYV005","2026-10-16","legacy"),false);
 assert.equal(isProvincialLotusReserve("fresh","คลังกรุงเทพ","TYV005","2026-10-16","legacy"),false);
 assert.equal(isProvincialLotusReserve("fresh","คลังต่างจังหวัด","dragon","2026-10-16","legacy"),false);
});
