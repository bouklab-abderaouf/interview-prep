import { expect, test } from "./fixtures";

test.describe("public pages", () => {
  test("landing page renders without errors and links to the demo", async ({ page, consoleErrors }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try a 2-minute demo" })).toHaveAttribute("href", "/demo");
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("sample scorecard renders from its fixture", async ({ page, consoleErrors }) => {
    await page.goto("/sample-scorecard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/\/100/).first()).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("header navigation reaches the sample scorecard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("banner").getByRole("link", { name: "Sample scorecard" }).click();
    await expect(page).toHaveURL(/\/sample-scorecard$/);
  });
});

test.describe("signed-out access", () => {
  for (const path of ["/home", "/interviews", "/documents", "/onboarding", "/roadmap/x", "/scorecard/x", "/session/x"]) {
    test(`${path} redirects to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole("heading", { name: "Sign in or create an account" })).toBeVisible();
    });
  }
});

// Route handlers must check auth themselves, not rely on proxy.ts (whose
// matcher could change). Each of these must refuse before doing any work —
// and in particular before any Gemini call.
test.describe("API refuses anonymous callers", () => {
  const id = "5f0c6d2e-1b7a-4c3e-9a51-0d9a8b7c6e5f";
  const cases: Array<[method: string, path: string, body?: unknown]> = [
    // Used to mint a Live token for anyone (no stageId = the old smoke test).
    ["POST", "/api/live/token", { mode: "full" }],
    ["POST", "/api/live/token", { mode: "full", stageId: id }],
    ["POST", "/api/analyze", undefined],
    ["POST", `/api/sessions/${id}/score`, undefined],
    ["POST", "/api/sessions", { stageId: id }],
    ["DELETE", "/api/sessions", { ids: [id] }],
    ["PATCH", `/api/sessions/${id}`, { turns: [] }],
    ["DELETE", `/api/sessions/${id}`],
    ["DELETE", `/api/roadmaps/${id}`],
    ["DELETE", `/api/documents/${id}`],
    ["DELETE", "/api/account"],
  ];

  for (const [method, path, body] of cases) {
    test(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ""} → 401`, async ({ request }) => {
      const response = await request.fetch(path, { method, data: body });
      expect(response.status()).toBe(401);
    });
  }
});
