// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScoreSessionButton, describeScoringFailure } from "@/components/interview/ScoreSessionButton";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const respond = (status: number, body: unknown) => vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("ScoreSessionButton", () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("opens the scorecard once scored", async () => {
    respond(200, { scorecardId: "sc-1" });
    render(<ScoreSessionButton sessionId="s1" />);
    await userEvent.click(screen.getByRole("button", { name: "Score this interview" }));
    expect(fetch).toHaveBeenCalledWith("/api/sessions/s1/score", { method: "POST" });
    expect(push).toHaveBeenCalledWith("/scorecard/s1");
  });

  it.each([
    [503, { error: "model_busy" }, /overloaded.*try again in a minute/],
    [429, { error: "quota_exceeded" }, /quota is used up.*later today or tomorrow/],
    [429, { error: "daily_limit", kind: "scoring", limit: 15, resetsAt: "2026-10-02T00:00:00Z" }, /limit of 15 scorings/],
    [502, { error: "scoring_failed" }, /Scoring failed.*saved/],
  ])("explains a %i (%o) and keeps the interview", async (status, body, message) => {
    respond(status, body);
    render(<ScoreSessionButton sessionId="s1" label="Score it" size="sm" />);
    await userEvent.click(screen.getByRole("button", { name: "Score it" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("describeScoringFailure", () => {
  it("falls back to the status for anything unknown", () => {
    expect(describeScoringFailure(undefined, 500)).toMatch(/error 500/);
  });
});
