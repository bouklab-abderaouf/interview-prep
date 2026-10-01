import { CONSENT_VERSION } from "../lib/legal";
import { admin, countRows, expect, freshUser, seedRoadmap, seedSession, signIn, test } from "./support";

// The signed-in journeys, end to end against a local Supabase with a faked
// Gemini (playwright.auth.config.ts). Each test makes its own user.

const JD = "We're hiring an AI engineer to build retrieval-augmented generation systems in Python, deployed on Kubernetes.";
// Smallest file the upload accepts: the route checks for the %PDF- signature.
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

test("onboarding asks for consent, records it, and builds a roadmap; the daily limit holds", async ({ page }) => {
  const user = await freshUser("onboarding");
  await signIn(page, user.email);
  await expect(page).toHaveURL(/\/onboarding$/);

  const fill = async () => {
    await page.setInputFiles('input[type="file"]', { name: "cv.pdf", mimeType: "application/pdf", buffer: PDF });
    await page.getByPlaceholder("Paste the job description").fill(JD);
  };
  await fill();
  const submit = page.getByRole("button", { name: "Build my roadmap" });
  await expect(submit).toBeDisabled();
  await page.getByLabel(/I agree that my CV/).check();
  await submit.click();

  await page.waitForURL(/\/roadmap\//, { timeout: 60_000 });
  await expect(page.getByText("Recruiter screen").first()).toBeVisible();

  const { data: profile } = await admin()
    .from("profiles")
    .select("ai_processing_consent_version, ai_processing_consent_at")
    .eq("id", user.id)
    .single();
  expect(profile?.ai_processing_consent_version).toBe(CONSENT_VERSION);
  expect(profile?.ai_processing_consent_at).toBeTruthy();

  // USER_MAX_ANALYSES_PER_DAY=1 in this suite: a second analysis is refused, in words.
  await page.goto("/onboarding");
  await fill();
  await page.getByLabel(/I agree that my CV/).check();
  await page.getByRole("button", { name: "Build my roadmap" }).click();
  await expect(page.getByText(/today's limit of 1 CV analyses/)).toBeVisible();
  expect(await countRows("roadmaps", user.id)).toBe(1);
});

test("opening the interview room creates no session, and a start that fails leaves none", async ({ page }) => {
  const user = await freshUser("room");
  const { stageIds } = await seedRoadmap(user.id);
  await signIn(page, user.email);

  // A granted microphone (silent), and a token route that fails — no Live call.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => new AudioContext().createMediaStreamDestination().stream;
  });
  await page.route("**/api/live/token", (route) => route.fulfill({ status: 502, json: { error: "token_mint_failed" } }));

  await page.goto(`/session/new?stageId=${stageIds[0]}`);
  await expect(page.getByRole("button", { name: "Start Interview" })).toBeVisible();
  expect(await countRows("sessions", user.id)).toBe(0);

  const created = page.waitForResponse((r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST");
  const removed = page.waitForResponse((r) => /\/api\/sessions\/[0-9a-f-]+$/.test(r.url()) && r.request().method() === "DELETE");
  await page.getByRole("button", { name: "Start Interview" }).click();

  expect((await created).status()).toBe(200);
  expect((await removed).status()).toBe(200);
  await expect(page.getByText(/voice service didn't respond/)).toBeVisible();
  await expect(page).toHaveURL(/\/session\/new\?stageId=/);
  expect(await countRows("sessions", user.id)).toBe(0);
});

test("an unscored interview is scored from Interviews, then deleted", async ({ page }) => {
  const user = await freshUser("score");
  const { stageIds } = await seedRoadmap(user.id);
  const sessionId = await seedSession(user.id, stageIds[0], {
    turns: [
      { role: "interviewer", transcript: "Walk me through your background." },
      { role: "candidate", transcript: "I built a retrieval pipeline at Acme in Python." },
    ],
  });
  await signIn(page, user.email);

  await page.goto("/interviews");
  await expect(page.getByRole("button", { name: /Needs scoring/ })).toBeVisible();
  await page.getByRole("button", { name: "Score it" }).click();
  await page.waitForURL(`**/scorecard/${sessionId}`);
  await expect(page.getByText("I built a retrieval pipeline at Acme in Python.").first()).toBeVisible();

  await page.goto("/interviews");
  await page.getByRole("button", { name: /Delete interview/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => countRows("sessions", user.id)).toBe(0);
  await expect(page.getByText("No interviews here yet.")).toBeVisible();
});

test("sessions that never started are cleared in one go", async ({ page }) => {
  const user = await freshUser("clear");
  const { stageIds } = await seedRoadmap(user.id);
  await seedSession(user.id, stageIds[0], { status: "active", startedMinutesAgo: 120 });
  await seedSession(user.id, stageIds[0], { status: "abandoned", startedMinutesAgo: 60 * 24 });
  await signIn(page, user.email);

  await page.goto("/interviews");
  await page.getByRole("button", { name: "Clear 2 not started" }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect.poll(() => countRows("sessions", user.id)).toBe(0);
});

test("the data export contains the user's own data", async ({ page }) => {
  const user = await freshUser("export");
  const { stageIds } = await seedRoadmap(user.id);
  await seedSession(user.id, stageIds[0], { turns: [{ role: "candidate", transcript: "Exported answer." }] });
  await signIn(page, user.email);

  await page.goto("/documents");
  await expect(page.getByRole("link", { name: "Download my data (JSON)" })).toBeVisible();
  const res = await page.request.get("/api/account/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toMatch(/attachment/);
  const body = await res.json();
  expect(body.account).toEqual({ id: user.id, email: user.email });
  expect(body.roadmaps).toHaveLength(1);
  expect(body.stages).toHaveLength(4);
  expect(body.turns.map((t: { transcript: string }) => t.transcript)).toEqual(["Exported answer."]);
});

test("deleting the account removes the user and everything they owned", async ({ page }) => {
  const user = await freshUser("delete");
  await seedRoadmap(user.id);
  await signIn(page, user.email);

  await page.goto("/documents");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByRole("textbox").fill("delete");
  await page.getByRole("button", { name: "Permanently delete" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  const { data } = await admin().auth.admin.getUserById(user.id);
  expect(data.user).toBeFalsy();
  expect(await countRows("roadmaps", user.id)).toBe(0);

  // And the session is really gone: the app sends them back to sign in.
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in$/);
});
