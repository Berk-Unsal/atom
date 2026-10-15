import { describe, expect, it } from "vitest";
import { rfRecoveryMessage } from "./rfRecoveryMessage.js";

describe("RF recovery copy", () => {
  it("uses the returned wait for a budget rejection", () => {
    expect(rfRecoveryMessage("RF analysis request budget exceeded; retry after the current rate-limit window", { status: 429, retryAfter: "18" }))
      .toBe("RF request budget reached. Try again in about 18 seconds.");
  });

  it.each(["RF analysis capacity is busy; retry shortly", "another RF analysis is already running for this client"])("explains capacity rejection: %s", (message) => {
    expect(rfRecoveryMessage(message, { status: 429, retryAfter: "1" }))
      .toBe("RF computation capacity is busy. Try again in about 1 second.");
  });

  it.each([null, undefined, "", "-1", "NaN", "Infinity", "2.5", "tomorrow", "9007199254740992"])("preserves generic guidance for an unavailable/invalid delay: %s", (retryAfter) => {
    const message = "RF analysis request budget exceeded";
    expect(rfRecoveryMessage(message, { status: 429, retryAfter })).toBe(message);
  });

  it("does not relabel other failures or non-RF rate limits", () => {
    expect(rfRecoveryMessage("Building download request budget exceeded", { status: 429, retryAfter: "18" })).toBe("Building download request budget exceeded");
    expect(rfRecoveryMessage("RF analysis exceeded its request deadline", { status: 504, retryAfter: "18" })).toBe("RF analysis exceeded its request deadline");
    expect(rfRecoveryMessage("RF analysis capacity is busy", { status: 429, retryAfter: "0" })).toContain("Try again shortly.");
  });
});
