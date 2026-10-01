import { test as base, expect } from "@playwright/test";

// Every test gets two automatic guards:
// - A request that would reach a quota-burning route or Gemini itself fails
//   the test instead of going out. The server already runs on placeholder
//   credentials; this catches a regression on the browser side (e.g. a page
//   that starts a Live session on load, or a blocked mic that still mints a
//   token — AGENTS.md §3.A).
// - Uncaught page errors and console errors are collected; `consoleErrors`
//   lets a test assert on them.
const FORBIDDEN = [
  /\/api\/live\/token/,
  /\/api\/analyze/,
  /\/api\/sessions\/[^/]+\/score/,
  /generativelanguage\.googleapis\.com/,
];

export const test = base.extend<{ forbiddenCalls: string[]; consoleErrors: string[] }>({
  forbiddenCalls: [
    async ({ page }, use) => {
      const calls: string[] = [];
      await page.route(
        (url) => FORBIDDEN.some((pattern) => pattern.test(url.href)),
        async (route) => {
          calls.push(`${route.request().method()} ${route.request().url()}`);
          await route.abort();
        },
      );
      // Third-party scripts (Turnstile) never load; tests that need the
      // widget install a stub instead (e2e/demo.spec.ts).
      await page.route("https://challenges.cloudflare.com/**", (route) =>
        route.fulfill({ status: 200, contentType: "text/javascript", body: "" }),
      );
      await use(calls);
      expect(calls, "the page made a request it must never make").toEqual([]);
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      await use(errors);
    },
    { auto: true },
  ],
});

export { expect };
