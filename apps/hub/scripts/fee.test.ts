import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/agentmkt";
process.env.HUB_FEE_BPS = "500";
process.env.NODE_ENV = "test";

const { computeFee } = await import("../src/policy/fee.js");

assert.equal(computeFee(0), 0);
assert.equal(computeFee(1), 0);
assert.equal(computeFee(99), 4);
assert.equal(computeFee(100), 5);
assert.equal(computeFee(1234), 61);

console.log("computeFee tests passed");
