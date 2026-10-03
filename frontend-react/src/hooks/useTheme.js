import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { applyTheme, normalizeTheme, readThemePreference, resolveTheme, saveThemePreference, systemTheme, SYSTEM_THEME_QUERY, THEME_STORAGE_KEY } from "../utils/theme.js";

function subscribeSystemTheme(onChange) {
  const media = window.matchMedia?.(SYSTEM_THEME_QUERY);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

export default function useTheme() {
  const [preference, setPreference] = useState(readThemePreference);
  const system = useSyncExternalStore(subscribeSystemTheme, systemTheme, () => "light");
  const resolvedTheme = resolveTheme(preference, system);

  useLayoutEffect(() => { applyTheme(resolvedTheme); }, [resolvedTheme]);
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setPreference(readThemePreference());
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setThemePreference = useCallback((value) => {
    const next = normalizeTheme(value);
    saveThemePreference(next);
    setPreference(next);
  }, []);
  return { themePreference: preference, resolvedTheme, setThemePreference };
}
