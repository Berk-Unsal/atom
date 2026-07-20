import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const docsDirectory = resolve(globalThis.process.cwd(), "../docs");
const searchScript = readFileSync(resolve(docsDirectory, "assets/docs.js"), "utf8");
const searchIndex = JSON.parse(readFileSync(resolve(docsDirectory, "search-index.json"), "utf8"));

const searchMarkup = `
  <div data-docs-search data-search-index="./search-index.json">
    <label for="docs-search-input">Search documentation</label>
    <input
      id="docs-search-input"
      role="combobox"
      aria-expanded="false"
      aria-controls="docs-search-results"
      data-search-input
    />
    <kbd data-search-shortcut></kbd>
    <div data-search-panel hidden>
      <div data-search-status></div>
      <ol id="docs-search-results" role="listbox" data-search-results></ol>
      <div data-search-hints hidden></div>
    </div>
  </div>
`;

const settlePromises = () => new Promise((resolve) => window.setTimeout(resolve, 0));

describe("documentation search", () => {
  it("loads the generated index and supports search keyboard states", async () => {
    document.body.innerHTML = searchMarkup;
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(searchIndex),
      }),
    );

    window.eval(searchScript);

    const input = document.querySelector("[data-search-input]");
    const panel = document.querySelector("[data-search-panel]");
    const results = document.querySelector("[data-search-results]");
    const status = document.querySelector("[data-search-status]");

    input.focus();
    await settlePromises();
    expect(fetch).toHaveBeenCalledWith("./search-index.json", { cache: "force-cache" });
    expect(panel).not.toHaveAttribute("hidden");

    input.value = "interference";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(results.children.length).toBeGreaterThan(0);
    expect(results.children.length).toBeLessThanOrEqual(8);
    expect(status).toHaveTextContent(/results? for “interference”/i);
    expect(input).toHaveAttribute("aria-activedescendant", "docs-search-result-0");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(input).toHaveAttribute("aria-activedescendant", "docs-search-result-1");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel).toHaveAttribute("hidden");
    expect(input).toHaveAttribute("aria-expanded", "false");

    input.value = "not-a-real-docs-term";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(status).toHaveTextContent("No results");
    expect(results).toBeEmptyDOMElement();
  });
});
