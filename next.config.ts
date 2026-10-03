import type { NextConfig } from "next";

// Headers that are the same on every response. The Content Security Policy
// needs a fresh nonce per request, so it's set in proxy.ts instead.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Legacy twin of CSP frame-ancestors 'none', for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  // Mic and camera for the interview room, from this origin only; nothing else.
  {
    key: "Permissions-Policy",
    value: "microphone=(self), camera=(self), geolocation=(), payment=(), usb=(), display-capture=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Ignored by browsers over plain HTTP, so harmless locally. No
  // includeSubDomains/preload: those commit every subdomain of a domain that
  // isn't chosen yet.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
];

const nextConfig: NextConfig = {
  // The Playwright suite builds with placeholder credentials into its own
  // directory, so it never overwrites (or reuses) a real build in .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
