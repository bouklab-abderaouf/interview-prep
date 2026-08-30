import type { ReactNode } from "react";

// Phase 1+ — auth guard. Phase 0 has no auth; routes under (app) are unprotected stubs.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
