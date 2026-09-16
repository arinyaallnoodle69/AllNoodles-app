import assert from "node:assert/strict";
import { parseInstallmentPaid } from "./installment.ts";

assert.equal(parseInstallmentPaid(null), 0);
assert.equal(parseInstallmentPaid(""), 0);
assert.equal(parseInstallmentPaid("0"), 0);
assert.equal(parseInstallmentPaid("300"), 300);
