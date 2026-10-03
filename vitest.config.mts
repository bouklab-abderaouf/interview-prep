import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit and component tests. Zero quota cost by construction: nothing here may
// reach Gemini or Supabase — route handlers are tested against a fake
// Supabase client (tests/helpers/fake-supabase.ts), never a real one.
// Browser-level checks live in e2e/ and run under Playwright instead.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // Node by default; component tests opt into jsdom with a
    // `// @vitest-environment jsdom` header.
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
