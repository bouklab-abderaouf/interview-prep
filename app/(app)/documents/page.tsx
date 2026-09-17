import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/nav/BackLink";
import { DeleteDocumentButton } from "@/components/ui/DeleteDocumentButton";
import { formatDateTime } from "@/lib/format";

interface DocumentRow {
  id: string;
  kind: "cv" | "jd";
  storage_path: string | null;
  raw_text: string | null;
  created_at: string;
}

interface RoadmapRow {
  id: string;
  target_role: string;
  company: string | null;
  cv_document_id: string | null;
  jd_document_id: string | null;
}

const JD_PREVIEW_CHARS = 320;

// Uploads were write-only: a CV went into the `cvs` bucket and a JD into
// `documents.raw_text`, and neither was ever shown back. Listing them is also
// the honest answer to "what of mine does this thing hold?".
export default async function DocumentsPage() {
  const supabase = await createClient();

  const [{ data: documents }, { data: roadmaps }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, kind, storage_path, raw_text, created_at")
      .order("created_at", { ascending: false })
      .returns<DocumentRow[]>(),
    supabase
      .from("roadmaps")
      .select("id, target_role, company, cv_document_id, jd_document_id")
      .returns<RoadmapRow[]>(),
  ]);

  // Which roadmap each document produced, so a bare "CV.pdf" row has context.
  const roadmapByDocument = new Map<string, RoadmapRow>();
  for (const roadmap of roadmaps ?? []) {
    if (roadmap.cv_document_id) roadmapByDocument.set(roadmap.cv_document_id, roadmap);
    if (roadmap.jd_document_id) roadmapByDocument.set(roadmap.jd_document_id, roadmap);
  }

  // The `cvs` bucket is private, so a stored path isn't a URL. Signed links
  // are minted per render and expire in an hour rather than being persisted.
  const signedUrls = new Map<string, string>();
  await Promise.all(
    (documents ?? [])
      .filter((doc) => doc.kind === "cv" && doc.storage_path)
      .map(async (doc) => {
        const { data } = await supabase.storage
          .from("cvs")
          .createSignedUrl(doc.storage_path as string, 60 * 60);
        if (data?.signedUrl) signedUrls.set(doc.id, data.signedUrl);
      }),
  );

  const cvs = (documents ?? []).filter((doc) => doc.kind === "cv");
  const jds = (documents ?? []).filter((doc) => doc.kind === "jd");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8">
      <BackLink href="/home">Home</BackLink>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-zinc-500">
          Everything you&rsquo;ve uploaded. Each roadmap was built from one CV and one job
          description.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">CVs</h2>
        {cvs.length > 0 ? (
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {cvs.map((doc) => {
              const roadmap = roadmapByDocument.get(doc.id);
              const href = signedUrls.get(doc.id);
              return (
                <li key={doc.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {roadmap
                        ? `CV — ${roadmap.target_role}${roadmap.company ? ` at ${roadmap.company}` : ""}`
                        : "CV"}
                    </span>
                    <span className="text-xs text-zinc-500">
                      Uploaded {formatDateTime(doc.created_at)}
                      {/* Failed analyses upload the file before they fail, so
                          an unlinked document is a leftover, not a mystery. */}
                      {!roadmap && " · analysis didn't finish"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-sm">
                    {roadmap && (
                      <Link
                        href={`/roadmap/${roadmap.id}`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Roadmap
                      </Link>
                    )}
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Open PDF
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-400">File unavailable</span>
                    )}
                    {!roadmap && (
                      <DeleteDocumentButton documentId={doc.id} label="Discard" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No CV uploaded yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Job descriptions</h2>
        {jds.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {jds.map((doc) => {
              const roadmap = roadmapByDocument.get(doc.id);
              const text = doc.raw_text ?? "";
              const truncated = text.length > JD_PREVIEW_CHARS;
              return (
                <li
                  key={doc.id}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {roadmap
                          ? `${roadmap.target_role}${roadmap.company ? ` at ${roadmap.company}` : ""}`
                          : "Job description"}
                      </span>
                      <span className="text-xs text-zinc-500">
                        Pasted {formatDateTime(doc.created_at)} &middot; {text.length} characters
                        {!roadmap && " · analysis didn't finish"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-sm">
                      {roadmap && (
                        <Link
                          href={`/roadmap/${roadmap.id}`}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Roadmap
                        </Link>
                      )}
                      {!roadmap && (
                        <DeleteDocumentButton documentId={doc.id} label="Discard" />
                      )}
                    </div>
                  </div>

                  {truncated ? (
                    <details className="group text-sm text-zinc-600 dark:text-zinc-400">
                      {/* Only the truncated preview is swapped out on open —
                          the toggle itself has to stay clickable to collapse. */}
                      <summary className="cursor-pointer list-none">
                        <span className="group-open:hidden">
                          {text.slice(0, JD_PREVIEW_CHARS).trimEnd()}&hellip;
                        </span>
                        <span className="mt-1 block text-zinc-500 underline">
                          <span className="group-open:hidden">Show full text</span>
                          <span className="hidden group-open:inline">Hide</span>
                        </span>
                      </summary>
                      <p className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap">{text}</p>
                    </details>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                      {text}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No job description saved yet.</p>
        )}
      </section>
    </main>
  );
}
