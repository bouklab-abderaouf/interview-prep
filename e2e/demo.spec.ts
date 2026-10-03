import { expect, test } from "./fixtures";

// The demo is the one Live session anyone can start. Up to the microphone it
// must spend nothing; and a blocked microphone must stop it *before* a token
// is minted (AGENTS.md §3.A) — the automatic forbidden-request guard in
// fixtures.ts fails this test if /api/live/token is ever called.
test("discloses the AI and stops at a blocked mic without minting a token", async ({ page }) => {
  await page.addInitScript(() => {
    // Turnstile stub: hand over a token as soon as the widget renders.
    (window as unknown as { turnstile: unknown }).turnstile = {
      render: (_el: unknown, options: { callback: (token: string) => void }) => {
        setTimeout(() => options.callback("e2e-token"), 0);
        return "widget";
      },
      remove: () => {},
      reset: () => {},
    };
    // A denied microphone.
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });

  await page.goto("/demo");
  await page.getByRole("button", { name: "Continue" }).click();

  // specs §9 / EU AI Act Art. 50: said before anything starts.
  await expect(page.getByText("You'll be speaking with an AI interviewer, not a person.")).toBeVisible();

  await page.getByRole("button", { name: "Allow microphone" }).click();
  await expect(page.getByText(/Microphone blocked/)).toBeVisible();
});

test("can't continue without passing the bot check", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});
