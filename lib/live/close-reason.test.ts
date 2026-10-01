import { describe, expect, it } from "vitest";

import { classifyLiveClose, describeLiveClose } from "@/lib/live/close-reason";

describe("classifyLiveClose", () => {
  it.each([
    [1000, "", "normal"],
    // Seen for real when the free-tier Live quota ran out (AGENTS.md §2).
    [1011, "You exceeded your current quota, please check your plan and billing details.", "quota"],
    [1008, "RESOURCE_EXHAUSTED", "quota"],
    [1013, "", "busy"],
    [1011, "Too many concurrent sessions", "busy"],
    [1008, "Auth token has expired", "expired"],
    [1006, "", "network"],
    [1011, "Internal error encountered.", "server_error"],
    [4000, "something new", "other"],
  ] as const)("code %i %j → %s", (code, reason, kind) => {
    expect(classifyLiveClose(code, reason)).toBe(kind);
  });
});

describe("describeLiveClose", () => {
  it("says nothing for a normal close", () => {
    expect(describeLiveClose(1000)).toBeNull();
  });

  it("tells the candidate what happened and what to do", () => {
    expect(describeLiveClose(1011, "You exceeded your current quota")).toMatch(/usage limit.*later/);
    expect(describeLiveClose(1013)).toMatch(/busy.*minute/);
    expect(describeLiveClose(1006)).toMatch(/internet connection/);
  });

  it("shows the code when it's something unrecognised", () => {
    expect(describeLiveClose(4321, "weird")).toMatch(/code 4321/);
  });
});
