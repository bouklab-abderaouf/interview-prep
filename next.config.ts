import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Playwright suite builds with placeholder credentials into its own
  // directory, so it never overwrites (or reuses) a real build in .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
