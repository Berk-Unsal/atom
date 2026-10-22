import { describe, expect, it } from "vitest";
import { escapeHtml, formatCompactNumber, formatNumber, markdownValue, printTable, formatReportTimestamp, reportMarkdownText } from "./reportFormatting.js";

describe("report formatting", () => {
  it("escapes every HTML-sensitive table value", () => {
    const table = printTable(`<script>`, [[`a&b`, `"quoted"'`]]);
    expect(table).not.toContain("<script>");
    expect(table).toContain("&lt;script&gt;");
    expect(table).toContain("a&amp;b");
    expect(table).toContain("&quot;quoted&quot;&#039;");
    expect(escapeHtml(null)).toBe("—");
  });

  it("uses one numeric and markdown fallback contract", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(12.34, 1)).toBe("12.3");
    expect(formatCompactNumber(1200)).toBe("1.2K");
    expect(markdownValue("left|right")).toBe("left\\|right");
  });

  it("formats a recorded instant in UTC independently of locale and refuses unknown legacy zones", () => {
    expect(formatReportTimestamp("2026-10-19T11:36:12+03:00")).toBe("2026-10-19 08:36 UTC");
    expect(formatReportTimestamp(new Date("2026-10-19T08:36:12Z"))).toBe("2026-10-19 08:36 UTC");
    for (const unknown of [null, undefined, "", "10/19/2026 11:36", "2026-10-19T11:36", "bad", new Date("bad")]) expect(formatReportTimestamp(unknown)).toBe("Not recorded");
  });

  it("keeps names as literal Markdown text without injecting HTML or table rows", () => {
    expect(reportMarkdownText("name|value\n<script>_x_")).toBe("name\\|value \\<script\\>\\_x\\_");
  });
});
