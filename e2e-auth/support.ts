import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { FAKE_GAP_ANALYSIS } from "../lib/gemini/fake";

// Helpers for the signed-in suite: a service-role client on the *local*
// Supabase (playwright.auth.config.ts refuses anything else), fresh users,
// sign-in through the app's own /auth/confirm route, and seed data.

export function admin() {
  return createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function freshUser(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}@e2e.test`;
  const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  return { id: data.user.id, email };
}

/** Signs in the way a magic link does: a token hash verified by /auth/confirm. */
export async function signIn(page: Page, email: string) {
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=email`);
  await page.waitForURL(/\/(home|onboarding)$/);
}

/** A roadmap with four stages, the first unlocked — what an analysis would have built. */
export async function seedRoadmap(userId: string) {
  const db = admin();
  const { stages, ...gapAnalysis } = FAKE_GAP_ANALYSIS;
  const { data: roadmap, error } = await db
    .from("roadmaps")
    .insert({ user_id: userId, target_role: "AI Engineer", company: "E2E Corp", language: "en", gap_analysis: gapAnalysis })
    .select("id")
    .single();
  if (error) throw error;

  const { data: stageRows, error: stageError } = await db
    .from("stages")
    .insert(
      stages.map((stage, index) => ({
        roadmap_id: roadmap.id,
        order_index: index,
        slug: stage.slug,
        title: stage.title,
        description: stage.description,
        focus_areas: stage.focus_areas,
        question_bank: stage.questions,
        persona: stage.persona,
      })),
    )
    .select("id, order_index");
  if (stageError) throw stageError;
  const stageIds = [...stageRows].sort((a, b) => a.order_index - b.order_index).map((s) => s.id as string);

  const { error: progressError } = await db
    .from("progress")
    .insert(stageIds.map((stageId, index) => ({ user_id: userId, stage_id: stageId, unlocked: index === 0 })));
  if (progressError) throw progressError;

  return { roadmapId: roadmap.id as string, stageIds };
}

export async function seedSession(
  userId: string,
  stageId: string,
  { status = "completed", turns = [] as Array<{ role: string; transcript: string }>, startedMinutesAgo = 20 } = {},
) {
  const db = admin();
  const startedAt = new Date(Date.now() - startedMinutesAgo * 60_000).toISOString();
  const { data: session, error } = await db
    .from("sessions")
    .insert({ user_id: userId, stage_id: stageId, mode: "full", language: "en", status, started_at: startedAt, duration_seconds: turns.length ? 300 : null })
    .select("id")
    .single();
  if (error) throw error;
  if (turns.length) {
    const { error: turnsError } = await db.from("turns").insert(
      turns.map((turn, index) => ({
        session_id: session.id,
        order_index: index,
        role: turn.role,
        transcript: turn.transcript,
        start_ms: index * 10_000,
        end_ms: index * 10_000 + 8_000,
      })),
    );
    if (turnsError) throw turnsError;
  }
  return session.id as string;
}

export async function countRows(table: "sessions" | "roadmaps", userId: string) {
  const { count, error } = await admin().from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

// The Live API can't be faked, so a page that reaches for it fails the test.
export const test = base.extend<{ liveGuard: void }>({
  liveGuard: [
    async ({ page }, use) => {
      const reached: string[] = [];
      await page.route(/generativelanguage\.googleapis\.com/, async (route) => {
        reached.push(route.request().url());
        await route.abort();
      });
      await page.routeWebSocket(/generativelanguage\.googleapis\.com/, (ws) => {
        reached.push(ws.url());
        ws.close();
      });
      await use();
      expect(reached, "a page reached the real Gemini API").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
