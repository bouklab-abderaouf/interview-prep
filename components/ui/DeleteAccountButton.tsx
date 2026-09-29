"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CONFIRM_WORD = "delete";

// Unlike roadmap/document deletion, this can't be undone and takes everything
// with it, so a stray double-click on "Sure?" isn't enough — the user types it.
export function DeleteAccountButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Deletion failed with ${res.status}`);
      }
      // refresh() as well as push(): the router cache still holds server
      // renders of the app shell for a user that no longer exists.
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsDeleting(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-start rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        Delete my account
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-red-600 dark:text-red-400">
        This permanently deletes your account, CVs, job descriptions, roadmaps, interviews and
        scorecards. Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm.
        <input
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={isDeleting}
          autoComplete="off"
          className="mt-1.5 block w-48 rounded border border-zinc-300 px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting || typed.trim().toLowerCase() !== CONFIRM_WORD}
          className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isDeleting ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped("");
            setError(null);
          }}
          disabled={isDeleting}
          className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
