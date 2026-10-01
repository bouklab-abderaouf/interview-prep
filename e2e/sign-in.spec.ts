import type { Page, Route } from "@playwright/test";

import { expect, test } from "./fixtures";

// Alerts are looked up inside <main>: Next's route announcer is a
// role="alert" element too.
//
// The browser asks Supabase for the magic link directly. These tests answer
// that request themselves, so no email is ever sent and every outcome —
// including the "Failed to fetch" that once broke a real sign-in — can be
// reproduced on demand.
async function answerOtp(page: Page, handler: (route: Route) => Promise<void>) {
  const calls: string[] = [];
  await page.route("**/auth/v1/otp**", async (route) => {
    calls.push(route.request().postDataJSON()?.email);
    await handler(route);
  });
  return calls;
}

async function requestLink(page: Page, email = "candidate@example.com") {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /Email me a sign-in link/ }).click();
}

test("sends a magic link and shows where it went", async ({ page }) => {
  const calls = await answerOtp(page, (route) => route.fulfill({ status: 200, json: {} }));
  await requestLink(page);

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByText("candidate@example.com")).toBeVisible();
  // Supabase allows one email a minute, so resend waits it out.
  await expect(page.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled();
  expect(calls).toEqual(["candidate@example.com"]);

  await page.getByRole("button", { name: "Use a different email" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("explains Supabase's rate limit instead of echoing it", async ({ page }) => {
  await answerOtp(page, (route) =>
    route.fulfill({
      status: 429,
      json: { code: 429, error_code: "over_email_send_rate_limit", msg: "For security purposes..." },
    }),
  );
  await requestLink(page);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/Too many sign-in emails\. Wait a minute/);
});

test("explains a network failure and warns that its email won't work", async ({ page }) => {
  await answerOtp(page, (route) => route.abort("failed"));
  await requestLink(page);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/Couldn't reach the sign-in server.*don't use it/);
  await expect(page.getByRole("button", { name: /Email me a sign-in link/ })).toBeEnabled();
});

test("does not send anything for an invalid address", async ({ page }) => {
  const calls = await answerOtp(page, (route) => route.fulfill({ status: 200, json: {} }));
  await requestLink(page, "not-an-email");
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeHidden();
  expect(calls).toEqual([]);
});

for (const [reason, text] of [
  ["browser", /couldn't be used in this browser/],
  ["expired", /has expired/],
  ["link", /didn't work/],
] as const) {
  test(`explains a failed link (?error=${reason})`, async ({ page }) => {
    await page.goto(`/sign-in?error=${reason}`);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(text);
  });
}

test("ignores unknown error reasons", async ({ page }) => {
  await page.goto("/sign-in?error=<script>alert(1)</script>");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("a confirm link without a code lands back on sign-in with a reason", async ({ page }) => {
  await page.goto("/auth/confirm");
  await expect(page).toHaveURL(/\/sign-in\?error=link$/);
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
});
