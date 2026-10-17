// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function ruleBody(selector) {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} rule exists`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("result metric presentation", () => {
  it("renders metric values without case transforms so units stay exact (dBm, m)", () => {
    expect(ruleBody(".metric-row strong")).not.toMatch(/text-transform/);
  });

  it("styles a zero-gap result neutrally instead of as an alert", () => {
    expect(ruleBody(".gap-panel.empty .gap-summary div")).toMatch(/border-color: var\(--line\)/);
    expect(ruleBody(".gap-panel.empty .gap-summary strong")).toMatch(/color: var\(--ink\)/);
  });
});
