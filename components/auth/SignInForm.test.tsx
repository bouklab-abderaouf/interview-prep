// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signInWithOtp } }) }));
// The real widget loads Cloudflare's script; this one hands over a token on click.
vi.mock("@/components/ui/TurnstileWidget", () => ({
  TurnstileWidget: ({ onToken }: { onToken: (token: string) => void }) => (
    <button type="button" onClick={() => onToken("turnstile-token")}>
      Solve bot check
    </button>
  ),
}));

async function loadForm(captcha: boolean) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SIGNIN_CAPTCHA", captcha ? "1" : "");
  return (await import("@/components/auth/SignInForm")).SignInForm;
}

beforeEach(() => {
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
});

describe("SignInForm", () => {
  it("sends a magic link back to /auth/confirm and shows where it went", async () => {
    const SignInForm = await loadForm(false);
    const user = userEvent.setup();
    render(<SignInForm linkError={null} />);

    await user.type(screen.getByLabelText("Email"), "candidate@example.com");
    await user.click(screen.getByRole("button", { name: /Email me a sign-in link/ }));

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "candidate@example.com",
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText("candidate@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled();
  });

  it.each([
    [{ status: 429, message: "rate limit" }, /Too many sign-in emails/],
    [{ status: 0, message: "Failed to fetch" }, /Couldn't reach the sign-in server/],
    [{ status: 400, message: "captcha protection: request disallowed" }, /bot check didn't pass/],
  ])("explains a failed send (%o)", async (error, message) => {
    const SignInForm = await loadForm(false);
    signInWithOtp.mockResolvedValue({ error });
    const user = userEvent.setup();
    render(<SignInForm linkError={null} />);
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.click(screen.getByRole("button", { name: /Email me a sign-in link/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("explains why the last link failed", async () => {
    const SignInForm = await loadForm(false);
    render(<SignInForm linkError="browser" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't be used in this browser/);
  });

  describe("with the sign-in bot check enabled", () => {
    it("can't send until the check passes, then sends its token", async () => {
      const SignInForm = await loadForm(true);
      const user = userEvent.setup();
      render(<SignInForm linkError={null} />);
      await user.type(screen.getByLabelText("Email"), "a@b.co");

      const send = screen.getByRole("button", { name: /Email me a sign-in link/ });
      expect(send).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Solve bot check" }));
      await user.click(send);

      expect(signInWithOtp).toHaveBeenCalledWith({
        email: "a@b.co",
        options: { emailRedirectTo: expect.any(String), captchaToken: "turnstile-token" },
      });
    });

    it("needs a fresh check for every send, since tokens are single-use", async () => {
      const SignInForm = await loadForm(true);
      signInWithOtp.mockResolvedValueOnce({ error: { status: 400, message: "captcha protection: request disallowed" } });
      const user = userEvent.setup();
      render(<SignInForm linkError={null} />);
      await user.type(screen.getByLabelText("Email"), "a@b.co");
      await user.click(screen.getByRole("button", { name: "Solve bot check" }));
      await user.click(screen.getByRole("button", { name: /Email me a sign-in link/ }));

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Email me a sign-in link/ })).toBeDisabled();
    });
  });
});
