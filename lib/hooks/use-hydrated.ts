import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// false during SSR and the hydration render, true after. Lets a component
// render server-safe output first (UTC times, system theme) and switch to
// browser-only values without a hydration mismatch — React re-renders with
// the client snapshot right after hydrating.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
