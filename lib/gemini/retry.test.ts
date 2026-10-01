import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

import { textModels, withModelFallback } from "@/lib/gemini/retry";

const apiError = (status: number) => new ApiError({ message: `status ${status}`, status });
const noDelay = { baseDelayMs: 0 };

describe("textModels", () => {
  it("returns the primary then the fallback", () => {
    vi.stubEnv("GEMINI_TEXT_MODEL", "flash");
    vi.stubEnv("GEMINI_TEXT_FALLBACK_MODEL", "flash-lite");
    expect(textModels()).toEqual(["flash", "flash-lite"]);
  });

  it("ignores a fallback identical to the primary", () => {
    vi.stubEnv("GEMINI_TEXT_MODEL", "flash");
    vi.stubEnv("GEMINI_TEXT_FALLBACK_MODEL", "flash");
    expect(textModels()).toEqual(["flash"]);
  });

  it("throws when no model is configured", () => {
    vi.stubEnv("GEMINI_TEXT_MODEL", "");
    expect(() => textModels()).toThrow(/GEMINI_TEXT_MODEL/);
  });
});

describe("withModelFallback", () => {
  it("returns the first model's result without touching the fallback", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    await expect(withModelFallback(["a", "b"], call, noDelay)).resolves.toBe("ok");
    expect(call.mock.calls).toEqual([["a"]]);
  });

  it("retries a 503 on the same model, then succeeds", async () => {
    const call = vi.fn().mockRejectedValueOnce(apiError(503)).mockResolvedValue("ok");
    await expect(withModelFallback(["a", "b"], call, noDelay)).resolves.toBe("ok");
    expect(call.mock.calls).toEqual([["a"], ["a"]]);
  });

  it("moves to the fallback after exhausting 503 retries", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const call = vi.fn(async (model: string) => {
      if (model === "a") throw apiError(503);
      return "from b";
    });
    await expect(
      withModelFallback(["a", "b"], call, { ...noDelay, attemptsPerModel: 3 }),
    ).resolves.toBe("from b");
    expect(call.mock.calls).toEqual([["a"], ["a"], ["a"], ["b"]]);
  });

  it("moves to the fallback immediately on a 429 (quota spent, retry can't help)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const call = vi.fn(async (model: string) => {
      if (model === "a") throw apiError(429);
      return "from b";
    });
    await expect(withModelFallback(["a", "b"], call, { ...noDelay, attemptsPerModel: 3 })).resolves.toBe(
      "from b",
    );
    expect(call.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("throws other errors at once without spending another model's quota", async () => {
    const call = vi.fn().mockRejectedValue(apiError(400));
    await expect(withModelFallback(["a", "b"], call, noDelay)).rejects.toMatchObject({ status: 400 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("throws non-API errors at once", async () => {
    const call = vi.fn().mockRejectedValue(new TypeError("bug"));
    await expect(withModelFallback(["a", "b"], call, noDelay)).rejects.toThrow("bug");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("rethrows the last error when every model fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const call = vi.fn().mockRejectedValue(apiError(429));
    await expect(withModelFallback(["a", "b"], call, noDelay)).rejects.toMatchObject({ status: 429 });
    expect(call).toHaveBeenCalledTimes(2);
  });
});
