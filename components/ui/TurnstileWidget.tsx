"use client";

import { useEffect, useRef, useState } from "react";

// Cloudflare Turnstile, shared by the public demo (required before a Live
// token is minted) and, when enabled, the sign-in form (Supabase verifies
// the token against email bombing). The script loads from
// challenges.cloudflare.com, which the CSP allows (lib/security/csp.ts).

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

// Module-level singleton: React Strict Mode double-invokes effects in dev,
// and Cloudflare's own script warns loudly ("Turnstile already has been
// loaded") if it's injected twice. A promise cached outside the component
// survives repeated mount/cleanup/remount cycles.
let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window !== "undefined" && window.turnstile) return Promise.resolve();
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Turnstile script failed to load"));
      document.body.appendChild(script);
    });
  }
  return turnstileScriptPromise;
}

export function TurnstileWidget({
  onToken,
  missingKeyMessage,
}: {
  onToken: (token: string | null) => void;
  /** Shown when no site key is configured; nothing is shown if omitted. */
  missingKeyMessage?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(
    () => typeof window !== "undefined" && !!window.turnstile,
  );
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (!cancelled) setScriptLoaded(true);
      })
      .catch((error) => console.error("[turnstile]", error));
    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !siteKey || !window.turnstile) return;

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onToken,
      "expired-callback": () => onToken(null),
    });
    widgetIdRef.current = widgetId;

    return () => {
      window.turnstile?.remove(widgetId);
      widgetIdRef.current = null;
    };
  }, [scriptLoaded, siteKey, onToken]);

  if (!siteKey) {
    return missingKeyMessage ? <p className="text-sm text-red-600 dark:text-red-400">{missingKeyMessage}</p> : null;
  }

  return <div ref={containerRef} />;
}
