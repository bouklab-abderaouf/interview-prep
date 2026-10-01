// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InterviewHistoryList } from "@/components/interview/InterviewHistoryList";
import type { InterviewSummary } from "@/lib/interviews";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

const NOW = Date.parse("2026-10-01T18:40:00Z");

function session(overrides: Partial<InterviewSummary>): InterviewSummary {
  return {
    id: "id",
    stageTitle: "Entretien RH",
    roadmapId: "r1",
    roadmapContext: "Développeur IA at Celad",
    startedAt: "2026-10-01T11:25:00Z",
    durationSeconds: 399,
    turns: 32,
    language: "fr",
    status: "completed",
    drill: false,
    hasStage: true,
    scorecard: null,
    ...overrides,
  };
}

const ITEMS: InterviewSummary[] = [
  session({ id: "fresh", status: "active", turns: 0, startedAt: "2026-10-01T18:30:00Z", durationSeconds: null }),
  session({ id: "scored-65", scorecard: { overall: 65, stars: 1, xp_awarded: 105 } }),
  session({ id: "stale", status: "active", turns: 0, startedAt: "2026-09-30T21:28:00Z", durationSeconds: null }),
  session({
    id: "scored-54",
    startedAt: "2026-09-30T20:05:00Z",
    scorecard: { overall: 54, stars: 0, xp_awarded: 88 },
  }),
  session({ id: "unscored", status: "abandoned", startedAt: "2026-09-17T21:00:00Z", turns: 12 }),
  session({
    id: "drill",
    drill: true,
    targetQuestion: "Pourquoi ce trou en 2023 ?",
    status: "abandoned",
    turns: 0,
    startedAt: "2026-09-17T22:43:00Z",
    durationSeconds: 24,
  }),
];

function renderList(items = ITEMS) {
  return render(<InterviewHistoryList items={items} now={NOW} />);
}

describe("InterviewHistoryList", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("labels sessions by what actually happened, not their stale status", () => {
    renderList();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(6);
    expect(screen.getByText("In progress")).toBeInTheDocument();
    // "stale" and "drill" never got an answer, whatever their status column says.
    expect(rows.filter((row) => within(row).queryByText("Not started"))).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Score it" })).toBeInTheDocument();
    expect(screen.queryByText(/^active$/i)).not.toBeInTheDocument();
  });

  it("links scored rows to their scorecard", () => {
    renderList();
    expect(screen.getAllByRole("link", { name: /Open scorecard/ }).map((a) => a.getAttribute("href"))).toEqual([
      "/scorecard/scored-65",
      "/scorecard/scored-54",
    ]);
  });

  it("shows a drill's target question instead of its roadmap", () => {
    renderList();
    expect(screen.getByText("Pourquoi ce trou en 2023 ?")).toBeInTheDocument();
    expect(screen.getByText("Drill")).toBeInTheDocument();
  });

  it("summarises full-interview scores with the change since the previous one", () => {
    renderList();
    const latest = screen.getByText("Latest score").closest("div")!;
    expect(within(latest).getByText("65")).toBeInTheDocument();
    expect(within(latest).getByText(/11/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Score trend: 54, 65" })).toBeInTheDocument();
  });

  it("filters by state and counts each filter", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: /^Scored/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /^Not started/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /^Needs scoring/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("groups rows under day headings", () => {
    renderList();
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument();
  });

  it("asks before deleting, then removes the row and refreshes", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    renderList();

    const scoredRow = screen.getAllByRole("link", { name: /Open scorecard/ })[0].closest("li")!;
    await user.click(within(scoredRow).getByRole("button", { name: /Delete interview/ }));
    expect(fetch).not.toHaveBeenCalled();

    const dialog = within(scoredRow).getByRole("alertdialog");
    expect(dialog).toHaveTextContent("XP and stage progress you've earned stay");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(fetch).toHaveBeenCalledWith("/api/sessions/scored-65", { method: "DELETE" });
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(refresh).toHaveBeenCalled();
  });

  it("cancels a delete with Escape without calling the API", async () => {
    const user = userEvent.setup();
    renderList();
    const row = screen.getAllByRole("listitem")[0];
    await user.click(within(row).getByRole("button", { name: /Delete interview/ }));
    expect(within(row).getByRole("alertdialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(within(row).queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the row and explains when a delete fails", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 502 }));
    renderList();
    const row = screen.getAllByRole("listitem")[0];
    await user.click(within(row).getByRole("button", { name: /Delete interview/ }));
    await user.click(within(row).getByRole("button", { name: "Delete" }));

    expect(await within(row).findByText(/Couldn't delete \(error 502\)/)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });

  it("clears every not-started session in one request, leaving the fresh one alone", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ deleted: 2 }), { status: 200 }));
    renderList();

    await user.click(screen.getByRole("button", { name: "Clear 2 not started" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(fetch).toHaveBeenCalledWith("/api/sessions", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["stale", "drill"] }),
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /not started/ })).not.toBeInTheDocument();
  });

  it("filters by roadmap when there is more than one", async () => {
    const user = userEvent.setup();
    renderList([
      ...ITEMS,
      session({ id: "other", roadmapId: "r2", roadmapContext: "Agent Builder at Hymaïa", startedAt: "2026-09-09T11:51:00Z" }),
    ]);
    await user.selectOptions(screen.getByRole("combobox"), "r2");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
