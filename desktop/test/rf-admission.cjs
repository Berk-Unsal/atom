// Qualification-side pacing; never alters backend admission or retries RF.
const assert = require("node:assert/strict");

function observeAdmission(response, now) {
  const integer = (value, minimum, maximum) => {
    assert.notEqual(value, null, "Production admission header is missing");
    assert.notEqual(value, "", "Production admission header is empty");
    const parsed = Number(value);
    assert.ok(Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum, "Invalid production admission header");
    return parsed;
  };
  assert.equal(integer(response.limit, 20, 20), 20);
  return { remaining: integer(response.remaining, 0, 20), extra: integer(response.followupRemaining, 0, 8),
    resetAt: now + integer(response.reset, 1, 60) * 1000 };
}

function admissionWait(state, children, now) {
  if (!state) return 0;
  // The root costs one ordinary request; children use available follow-up
  // allowance first, then reserve ordinary requests under the normal policy.
  const needed = 1 + Math.max(0, children - state.extra);
  return state.remaining >= needed ? 0 : Math.max(0, state.resetAt + 1000 - now);
}

module.exports = { observeAdmission, admissionWait };
