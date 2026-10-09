// Match the application's browser-only appearance contract (src/utils/theme.js).
// This blocking head script resolves appearance before the stylesheet is painted.
(() => {
  const storageKey = "atom.theme";
  const normalize = (value) => ["light", "dark", "system"].includes(value) ? value : "system";
  const read = () => {
    try { return normalize(window.localStorage.getItem(storageKey)); }
    catch { return "system"; }
  };
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  let preference = read();
  const apply = () => {
    const theme = preference === "system" ? (media?.matches ? "dark" : "light") : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const control = document.querySelector("[data-theme-toggle]");
    if (control) {
      control.setAttribute("aria-checked", String(theme === "dark"));
      control.title = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
    }
  };
  apply();
  media?.addEventListener("change", apply);
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey || event.key === null) {
      preference = read();
      apply();
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
      preference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      try { window.localStorage.setItem(storageKey, preference); }
      catch { /* Keep the selected appearance for this page when storage is denied. */ }
      apply();
    });
  }, { once: true });
})();
