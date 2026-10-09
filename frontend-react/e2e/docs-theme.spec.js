import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const docsRoot = resolve("../docs");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png" };

// Real documentation on the app origin exercises the shared storage contract.
test.beforeEach(async ({ context }) => {
  await context.route("**/docs/**", async (route) => {
    const path = resolve(docsRoot, decodeURIComponent(new URL(route.request().url()).pathname.slice(6)));
    if (!path.startsWith(docsRoot + sep)) return route.fulfill({ status: 404 });
    try { await route.fulfill({ body: await readFile(path), contentType: types[extname(path)] || "text/plain" }); }
    catch { await route.fulfill({ status: 404 }); }
  });
});

const appearance = (page) => page.getByRole("switch", { name: "Dark mode", exact: true });
const theme = (page, value) => expect(page.locator("html")).toHaveAttribute("data-theme", value);
async function setTheme(page, value) {
  if (await page.locator("html").getAttribute("data-theme") !== value) await appearance(page).click();
  await expect(appearance(page)).toHaveAttribute("aria-checked", String(value === "dark"));
}

async function darkContrast(page) {
  return page.evaluate(() => {
    const rgb = (color) => color.match(/[\d.]+/g).map(Number);
    const luminance = (color) => rgb(color).slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const failures = [];
    const selectors = ".site-brand, .site-brand small, .docs-theme-toggle, input, .page-hero p, .hero-label, .button, .nav-cta, .diagram-node span, .info-band p, .install-primary p, .code-block code, .copy-button, .page-toc a, .prose p, .prose td, .prose code, .footer-inner";
    for (const node of document.querySelectorAll(selectors)) {
      if (!node.getClientRects().length) continue;
      let background = node;
      while (background.parentElement && rgb(getComputedStyle(background).backgroundColor)[3] === 0) background = background.parentElement;
      const foreground = luminance(getComputedStyle(node).color);
      const backdrop = luminance(getComputedStyle(background).backgroundColor);
      const ratio = (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05);
      if (ratio < 4.5) failures.push({ text: node.textContent.trim().slice(0, 50), ratio });
    }
    return failures;
  });
}

async function preview(page, dark) {
  const visible = page.locator(dark ? ".theme-preview-dark" : ".theme-preview-light");
  await expect(visible).toBeVisible();
  await expect(page.locator(dark ? ".theme-preview-light" : ".theme-preview-dark")).toBeHidden();
  await expect(visible).toHaveJSProperty("complete", true);
  expect(await visible.evaluate((node) => node.naturalWidth)).toBeGreaterThan(0);
  await expect(visible).toHaveAttribute("src", dark ? "./assets/v0.12.0/network-workspace.png" : "./assets/focused-workspace.jpg");
}

test("docs toggle appearance and follow shared System with matching previews", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/docs/index.html");
  await theme(page, "dark");
  await expect(appearance(page)).toHaveAttribute("aria-checked", String(await page.locator("html").getAttribute("data-theme") === "dark"));
  await preview(page, true);
  await setTheme(page, "light");
  await theme(page, "light");
  await preview(page, false);
  expect(await page.evaluate(() => localStorage.getItem("atom.theme"))).toBe("light");
  await page.reload();
  await theme(page, "light");
  await page.goto("/docs/api.html");
  await expect(appearance(page)).toHaveAttribute("aria-checked", "false");
  await setTheme(page, "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await theme(page, "dark");
  await page.goto("/docs/index.html");
  await preview(page, true);
  await page.evaluate(() => {
    localStorage.removeItem("atom.theme");
    window.dispatchEvent(new StorageEvent("storage", { key: "atom.theme" }));
  });
  await theme(page, "light");
  await preview(page, false);
  await page.emulateMedia({ colorScheme: "dark" });
  await theme(page, "dark");
  await preview(page, true);
});

test("docs initialize before styles and recover corrupt preferences", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.setItem("atom.theme", "dark");
    new MutationObserver(() => {
      if (!window.themeAtStylesheet && document.querySelector('link[href="./assets/docs.css"]')) {
        window.themeAtStylesheet = document.documentElement.dataset.theme;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/docs/index.html");
  expect(await page.evaluate(() => window.themeAtStylesheet)).toBe("dark");
  await theme(page, "dark");
  await page.evaluate(() => {
    localStorage.setItem("atom.theme", "broken");
    window.dispatchEvent(new StorageEvent("storage", { key: "atom.theme" }));
  });
  await theme(page, "light");
  await expect(appearance(page)).toHaveAttribute("aria-checked", String(await page.locator("html").getAttribute("data-theme") === "dark"));
});

test("docs work with denied storage and unavailable matchMedia", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "matchMedia", { value: undefined });
    for (const name of ["getItem", "setItem"]) {
      Object.defineProperty(Storage.prototype, name, { value: () => { throw new Error("denied"); } });
    }
  });
  await page.goto("/docs/index.html");
  await theme(page, "light");
  await setTheme(page, "dark");
  await theme(page, "dark");
  await preview(page, true);
  await setTheme(page, "light");
  await theme(page, "light");
});

test("docs synchronize appearance with app tabs and storage clearing", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/docs/index.html");
  const app = await context.newPage();
  await app.emulateMedia({ colorScheme: "light" });
  await app.route("**/api/**", (route) => route.fulfill({ json: { type: "FeatureCollection", features: [] } }));
  await app.goto("/");
  await theme(app, "light");
  await setTheme(page, "dark");
  await theme(app, "dark");
  await app.getByRole("button", { name: "Map layers" }).click();
  await app.getByRole("radio", { name: "Light", exact: true }).check();
  await theme(page, "light");
  await expect(appearance(page)).toHaveAttribute("aria-checked", "false");
  await app.evaluate(() => localStorage.clear());
  await expect(appearance(page)).toHaveAttribute("aria-checked", String(await page.locator("html").getAttribute("data-theme") === "dark"));
  await theme(page, "light");
});

test("docs retain responsive controls, search, navigation and code in both themes", async ({ page }, testInfo) => {
  for (const value of ["light", "dark"]) {
    for (const name of ["index", "architecture", "download", "api"]) {
      await page.goto(`/docs/${name}.html`);
      await setTheme(page, value);
      await theme(page, value);
      await expect(appearance(page)).toBeInViewport();
      await expect(page.locator("[data-theme-preference], .docs-appearance")).toHaveCount(0);
      await appearance(page).focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      expect(await appearance(page).evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (value === "dark") {
        await expect(darkContrast(page)).resolves.toEqual([]);
        const colors = await page.evaluate(() => {
          const css = getComputedStyle(document.documentElement);
          return ["--bg", "--ink", "--muted", "--panel"].map((key) => css.getPropertyValue(key).trim());
        });
        expect(colors).toEqual(["#151b1f", "#e3eae7", "#b3c0bb", "#1b2328"]);
      }
      await page.screenshot({ path: testInfo.outputPath(`${name}-${value}.png`), fullPage: true });
      await page.screenshot({ path: testInfo.outputPath(`${name}-${value}-viewport.png`) });
    }
    await page.goto("/docs/index.html");
    await page.getByRole("combobox", { name: "Search documentation" }).fill("propagation");
    await expect(page.locator(".docs-search-result").first()).toBeVisible();
    await page.getByRole("combobox", { name: "Search documentation" }).press("Escape");
    const navToggle = page.getByRole("button", { name: "Toggle documentation navigation" });
    if (await navToggle.isVisible()) {
      await navToggle.click();
      await expect(page.getByRole("navigation", { name: "Primary documentation" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(navToggle).toBeFocused();
    }
    await page.goto("/docs/download.html");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.copiedCode = text; } } }));
    await page.locator(".copy-button").first().click();
    await expect(page.locator(".copy-button").first()).toHaveText("Copied");
    expect(await page.evaluate(() => window.copiedCode)).toBeTruthy();
  }
});


test("sun and moon switch supports keyboard and persists explicit choices", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/docs/index.html");
  await expect(appearance(page)).toHaveAttribute("aria-checked", "false");
  await expect(appearance(page)).toHaveAttribute("title", "Switch to dark mode");
  await appearance(page).focus();
  await page.keyboard.press("Space");
  await theme(page, "dark");
  await expect(appearance(page)).toHaveAttribute("aria-checked", "true");
  await expect(appearance(page)).toHaveAttribute("title", "Switch to light mode");
  expect(await page.evaluate(() => localStorage.getItem("atom.theme"))).toBe("dark");
  await page.keyboard.press("Enter");
  await theme(page, "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await theme(page, "light");
  await page.reload();
  await theme(page, "light");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator(".theme-toggle-thumb").evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration))).toBeLessThan(0.01);
});
