// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { parseTheme, themeClass, themeCookie } from "@/lib/theme";

describe("theme preference", () => {
  it("only accepts light and dark; anything else follows the system", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("<script>")).toBe("system");
  });

  it("puts no class on <html> for system, so prefers-color-scheme decides", () => {
    expect(themeClass("system")).toBe("");
    expect(themeClass("dark")).toBe("dark");
  });

  it("stores explicit choices for a year and clears the cookie for system", () => {
    expect(themeCookie("dark")).toBe("theme=dark; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(themeCookie("system")).toBe("theme=; Path=/; Max-Age=0; SameSite=Lax");
  });
});

describe("ThemeToggle", () => {
  afterEach(() => {
    document.documentElement.className = "";
    document.cookie = "theme=; Path=/; Max-Age=0";
  });

  it("switches the page in place and remembers the choice in a cookie", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initial="system" />);

    await user.click(screen.getByRole("button", { name: "Theme: system" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(document.cookie).toContain("theme=dark");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeInTheDocument();
  });

  it("replaces an explicit choice rather than stacking classes", async () => {
    const user = userEvent.setup();
    document.documentElement.classList.add("dark");
    render(<ThemeToggle initial="dark" />);

    await user.click(screen.getByRole("button", { name: "Theme: dark" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));
    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement).not.toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "Theme: light" }));
    await user.click(screen.getByRole("menuitemradio", { name: "System" }));
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.cookie).not.toContain("theme=");
  });

  it("marks the current choice and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle initial="light" />);
    await user.click(screen.getByRole("button", { name: "Theme: light" }));
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
