import { execSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

// Signed-in browser tests (production readiness phase 6). They need a local
// Supabase — `npx supabase start` (Docker) — and never touch the real
// project: the app is built against the local instance, and Gemini's text
// calls are faked (lib/gemini/fake.ts, which only switches on when Supabase
// is local). The Live API can't be faked, so these stop short of a real call.
//
//   npx supabase start
//   npm run test:e2e:auth

const PORT = 3200;

function localSupabase() {
  let raw: string;
  try {
    // CI installs the CLI binary (SUPABASE_CLI=supabase); locally npx fetches it.
    const cli = process.env.SUPABASE_CLI ?? "npx --yes supabase";
    raw = execSync(`${cli} status -o json`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error("Local Supabase isn't running. Start it with `npx supabase start` (needs Docker), then retry.");
  }
  const status = JSON.parse(raw.slice(raw.indexOf("{"))) as Record<string, string>;
  const url = status.API_URL;
  const anon = status.ANON_KEY ?? status.PUBLISHABLE_KEY;
  const service = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
  if (!url || !anon || !service) throw new Error("`supabase status` didn't report API_URL / ANON_KEY / SERVICE_ROLE_KEY.");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`Refusing to run signed-in tests against a non-local Supabase (${url}).`);
  }
  return { url, anon, service };
}

const supabase = localSupabase();
// Workers inherit this, so the tests' admin client talks to the same instance.
process.env.E2E_SUPABASE_URL = supabase.url;
process.env.E2E_SUPABASE_SERVICE_KEY = supabase.service;

export default defineConfig({
  testDir: "./e2e-auth",
  // One local database, shared: run in order, one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-auth" }]] : "list",
  outputDir: "test-results-auth",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: {
      NEXT_DIST_DIR: ".next-e2e-auth",
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anon,
      SUPABASE_SERVICE_ROLE_KEY: supabase.service,
      GEMINI_FAKE: "1",
      GEMINI_API_KEY: "",
      GEMINI_TEXT_MODEL: "e2e-fake",
      GEMINI_LIVE_MODEL: "e2e-fake",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "e2e-placeholder-site-key",
      TURNSTILE_SECRET_KEY: "e2e-placeholder-secret",
      IP_HASH_SALT: "e2e",
      // Low enough to exercise the limit in a test.
      USER_MAX_ANALYSES_PER_DAY: "1",
    },
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
