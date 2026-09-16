import assert from "node:assert/strict";
import { parseInstallmentPaid } from "./installment.ts";

assert.equal(parseInstallmentPaid(null), null);
assert.equal(parseInstallmentPaid(""), null);
assert.equal(parseInstallmentPaid("0"), null);
assert.equal(parseInstallmentPaid("300"), 300);
