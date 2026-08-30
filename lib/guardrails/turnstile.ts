interface TurnstileVerifyResponse {
  success: boolean;
}

// specs §5.3 step 4 — verifies against Cloudflare's siteverify endpoint. Fails
// closed (returns false) if TURNSTILE_SECRET_KEY isn't configured yet, rather
// than silently letting demo requests through unverified.
export async function verifyTurnstileToken(token: string, remoteIp: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[turnstile] TURNSTILE_SECRET_KEY not configured — rejecting");
    return false;
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp !== "unknown") body.set("remoteip", remoteIp);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) return false;
  const data: TurnstileVerifyResponse = await res.json();
  return data.success === true;
}
