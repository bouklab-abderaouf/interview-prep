import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Browser tests against a production build. Zero quota cost and zero real
// data by construction: the server is built and started with placeholder
// credentials (an unreachable Supabase, no Gemini key), so nothing it does
// can reach the real project or spend an API request. Browser-side calls to
// Supabase are intercepted per test (see e2e/sign-in.spec.ts).
//
// Scope is therefore the signed-out surface: public pages, redirects, API
// auth checks, the sign-in flow, the demo up to the microphone, theming and
// accessibility. Signed-in pages are covered by component tests.
const PLACEHOLDER_ENV = {
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-placeholder-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "e2e-placeholder-service-role-key",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "e2e-placeholder-site-key",
  TURNSTILE_SECRET_KEY: "e2e-placeholder-secret",
  GEMINI_API_KEY: "",
  GEMINI_TEXT_MODEL: "e2e-no-model",
  GEMINI_LIVE_MODEL: "e2e-no-model",
  IP_HASH_SALT: "e2e",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: PLACEHOLDER_ENV,
    // A build takes a while; never reuse a server that might be running
    // with real credentials.
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
