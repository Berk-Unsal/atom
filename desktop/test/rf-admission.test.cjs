const { test } = require("node:test");
const assert = require("node:assert/strict");
const { observeAdmission, admissionWait } = require("./rf-admission.cjs");

test("waits for exhausted ordinary admission, then permits the next window", () => {
  const state = observeAdmission({ limit: 20, remaining: "0", followupRemaining: "8", reset: 4 }, 1000);
  assert.equal(admissionWait(state, 0, 1000), 5000);
  assert.equal(admissionWait(state, 0, 6000), 0);
  assert.equal(admissionWait(null, 0, 1000), 0);
});

test("paces full network reservations using both real funding pools", () => {
  const state = { remaining: 1, extra: 8, resetAt: 5000 };
  assert.equal(admissionWait(state, 8, 1000), 0);
  assert.equal(admissionWait({ ...state, extra: 7 }, 8, 1000), 5000);
  assert.equal(admissionWait({ ...state, remaining: 9, extra: 0 }, 8, 1000), 0);
});

test("rejects missing, malformed, enlarged and out-of-window admission headers", () => {
  const valid = { limit: 20, remaining: "19", followupRemaining: "8", reset: 60 };
  for (const invalid of [{ remaining: null }, { remaining: "" }, { remaining: "NaN" }, { remaining: -1 },
    { limit: 21 }, { followupRemaining: 9 }, { reset: 0 }, { reset: 61 }]) {
    assert.throws(() => observeAdmission({ ...valid, ...invalid }, 1000));
  }
});
