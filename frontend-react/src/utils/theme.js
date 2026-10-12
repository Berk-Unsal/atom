// Browser presentation preferences never enter project, request or result identity.
export const THEME_STORAGE_KEY = "atom.theme";
export const THEME_PREFERENCES = Object.freeze(["light", "dark", "system"]);
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

export function normalizeTheme(value) {
  return THEME_PREFERENCES.includes(value) ? value : "system";
}

export function readThemePreference() {
  try { return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY)); }
  catch { return "system"; }
}

export function saveThemePreference(value) {
  try { window.localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(value)); }
  catch { /* Storage can be denied; the preference still works for this session. */ }
}

export function systemTheme() {
  return window.matchMedia?.(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(preference, system) {
  const normalized = normalizeTheme(preference);
  return normalized === "system" ? system : normalized;
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
