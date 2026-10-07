import { NextResponse } from "next/server";

// Route handler redirects carry a relative Location. A self-hosted server (the
// Docker image) sees request.url as the address it listens on, not the one the
// browser used: behind a Cloudflare Tunnel, an absolute URL built from it sent
// people to https://0.0.0.0:3000/…. Browsers resolve a relative Location
// against the URL they requested, so this works on any host.
export function redirectToPath(path: string, status: 303 | 307 = 307): NextResponse {
  // A same-site path only: "//evil.example" or "/\evil.example" would be
  // read as another host.
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    throw new Error(`redirectToPath takes a same-site path, got "${path}"`);
  }
  return new NextResponse(null, { status, headers: { Location: path } });
}
