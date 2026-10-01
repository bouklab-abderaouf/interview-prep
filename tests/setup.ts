import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when the runner exposes globals, which
// this config doesn't — unmount rendered trees between tests explicitly.
afterEach(() => {
  cleanup();
});
