import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useTheme from "./useTheme.js";
import { THEME_STORAGE_KEY } from "../utils/theme.js";

let matches;
let listeners;
const media = () => ({ matches, addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) });
const changeSystem = (dark) => act(() => {
  matches = dark;
  listeners.forEach((listener) => listener({ matches: dark }));
});
beforeEach(() => {
  const stored = new Map();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key) => stored.get(key) ?? null),
    setItem: vi.fn((key, value) => stored.set(key, value)),
    clear: vi.fn(() => stored.clear()),
  });
  matches = false;
  listeners = new Set();
  vi.stubGlobal("matchMedia", vi.fn(media));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.removeAttribute("data-theme"); });

describe("local application theme", () => {
  it("defaults to System and follows live system changes", () => {
    const { result, unmount } = renderHook(useTheme);
    expect(result.current.themePreference).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");
    changeSystem(true);
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    changeSystem(false);
    expect(result.current.resolvedTheme).toBe("light");
    unmount();
    expect(listeners.size).toBe(0);
  });
  it("persists explicit choices across mounts and ignores system changes until System is selected", () => {
    const { result, unmount } = renderHook(useTheme);
    act(() => result.current.setThemePreference("dark"));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    changeSystem(false);
    expect(result.current.resolvedTheme).toBe("dark");
    unmount();
    const next = renderHook(useTheme);
    expect(next.result.current.resolvedTheme).toBe("dark");
    act(() => next.result.current.setThemePreference("light"));
    changeSystem(true);
    expect(next.result.current.resolvedTheme).toBe("light");
    act(() => next.result.current.setThemePreference("system"));
    expect(next.result.current.resolvedTheme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });
  it("recovers corrupt preferences and responds to another tab or storage clearing", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "broken");
    const { result } = renderHook(useTheme);
    expect(result.current.themePreference).toBe("system");
    act(() => {
      window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });
    expect(result.current.resolvedTheme).toBe("dark");
    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current.themePreference).toBe("system");
  });
  it("remains usable with denied storage or unavailable matchMedia", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("denied"); });
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(useTheme);
    act(() => result.current.setThemePreference("dark"));
    expect(result.current.resolvedTheme).toBe("dark");
  });
});
