import { describe, expect, it } from "vitest";
import { escapeHtml, formatCompactNumber, formatNumber, markdownValue, printTable } from "./reportFormatting.js";

describe("report formatting", () => {
  it("escapes every HTML-sensitive table value", () => {
    const table = printTable(`<script>`, [[`a&b`, `"quoted"'`]]);
    expect(table).not.toContain("<script>");
    expect(table).toContain("&lt;script&gt;");
    expect(table).toContain("a&amp;b");
    expect(table).toContain("&quot;quoted&quot;&#039;");
    expect(escapeHtml(null)).toBe("n/a");
  });

  it("uses one numeric and markdown fallback contract", () => {
    expect(formatNumber(null)).toBe("n/a");
    expect(formatNumber(12.34, 1)).toBe("12.3");
    expect(formatCompactNumber(1200)).toBe("1.2K");
    expect(markdownValue("left|right")).toBe("left\\|right");
  });
});
