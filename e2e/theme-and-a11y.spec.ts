import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures";

test.describe("theme", () => {
  test("an explicit choice beats the system setting and survives a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    await page.getByRole("button", { name: /^Theme:/ }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    await page.reload();
    // Rendered by the server from the cookie: dark from the first byte.
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(10, 10, 10)");
  });

  test("System follows prefers-color-scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(10, 10, 10)");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  });

  test("Light wins over a dark system", async ({ page, context }) => {
    await context.addCookies([{ name: "theme", value: "light", url: "http://localhost:3100" }]);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/sign-in");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  });
});

// Serious and critical WCAG A/AA violations fail the build; minor ones are
// left to review. Run in both themes: contrast bugs are usually in one.
test.describe("accessibility", () => {
  for (const path of ["/", "/sign-in", "/sample-scorecard", "/demo", "/privacy", "/legal"]) {
    for (const scheme of ["light", "dark"] as const) {
      test(`${path} (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        const blocking = results.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => ({ rule: v.id, help: v.help, targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) }));
        expect(blocking).toEqual([]);
      });
    }
  }
});
