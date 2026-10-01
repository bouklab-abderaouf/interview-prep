import type { ReactNode } from "react";

import { LEGAL_DETAILS_COMPLETE } from "@/lib/legal";

// Shared frame for /privacy and /legal: title, last-updated date, a draft
// warning until the publisher details are filled in (lib/legal.ts), and
// readable typography without a prose plugin.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Last updated / Dernière mise à jour : {updated}</p>
        <nav aria-label="Language" className="flex gap-3 text-sm">
          <a href="#en" className="underline">
            English
          </a>
          <a href="#fr" className="underline">
            Français
          </a>
        </nav>
      </header>

      {!LEGAL_DETAILS_COMPLETE && (
        <p
          role="note"
          className="rounded-lg border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          Draft: the publisher&apos;s details (shown as &ldquo;[to be completed]&rdquo;) aren&apos;t filled in yet, and
          this text hasn&apos;t had a legal review. / Brouillon : les informations de l&apos;éditeur et la relecture
          juridique restent à faire.
        </p>
      )}

      <div className="flex flex-col gap-12 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300 [&_a]:underline [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-900 dark:[&_h2]:text-zinc-100 [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-zinc-900 dark:[&_h3]:text-zinc-100 [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_ul]:mb-3">
        {children}
      </div>
    </main>
  );
}

export function ProcessorTable({ rows }: { rows: ReadonlyArray<{ name: string; role: string; location: string; data: string }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-300 dark:border-zinc-700">
            <th scope="col" className="py-2 pr-4 font-semibold">Processor</th>
            <th scope="col" className="py-2 pr-4 font-semibold">For</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Where</th>
            <th scope="col" className="py-2 font-semibold">What</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-zinc-200 align-top dark:border-zinc-800">
              <td className="py-2 pr-4 font-medium text-zinc-900 dark:text-zinc-100">{row.name}</td>
              <td className="py-2 pr-4">{row.role}</td>
              <td className="py-2 pr-4">{row.location}</td>
              <td className="py-2">{row.data}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
