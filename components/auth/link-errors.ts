// Why a magic link failed, as /auth/confirm reports it to /sign-in via
// ?error=. Plain module (not "use client") so the server page can validate
// the param and the client form can show the message.
export const LINK_ERRORS = {
  browser:
    "That link couldn't be used in this browser. Open it in the same browser you requested it from, and only the most recent link works. Request a new one below.",
  expired: "That sign-in link has expired. Request a new one below.",
  link: "That sign-in link didn't work. It may have been used already. Request a new one below.",
};

export type LinkError = keyof typeof LINK_ERRORS;

export function isLinkError(value: unknown): value is LinkError {
  return typeof value === "string" && Object.hasOwn(LINK_ERRORS, value);
}
