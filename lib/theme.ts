// Light/dark preference. Stored in a cookie rather than localStorage so the
// server can render <html class="dark"> itself: no inline script, no flash of
// the wrong theme, and no hydration mismatch. "system" stores nothing and
// leaves it to prefers-color-scheme (see the `dark` variant in globals.css).

export type ThemePreference = "system" | "light" | "dark";

export const THEME_COOKIE = "theme";
const ONE_YEAR_S = 60 * 60 * 24 * 365;

export function parseTheme(value: string | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/** Class for <html>: an explicit choice, or none to follow the system. */
export function themeClass(preference: ThemePreference): string {
  return preference === "system" ? "" : preference;
}

export function themeCookie(preference: ThemePreference): string {
  return preference === "system"
    ? `${THEME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
    : `${THEME_COOKIE}=${preference}; Path=/; Max-Age=${ONE_YEAR_S}; SameSite=Lax`;
}
