import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// specs §9 — account deletion that actually removes storage objects and rows.
//
// Every user-owned table (profiles, documents, roadmaps → stages, sessions →
// turns/scorecards, progress) references auth.users `on delete cascade`, so
// deleting the auth user is what removes the rows. Storage objects have no such
// cascade and would outlive the account, so they go first — and if that fails,
// nothing else is touched, leaving an intact account the user can retry from
// rather than a deleted one with their CVs still sitting in the bucket.
export async function DELETE() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // CVs live at `${userId}/${documentId}.pdf` (see app/api/analyze). Listing
  // the folder rather than reading documents.storage_path also catches files
  // whose row never got written, e.g. an analysis that failed mid-way. This
  // runs on the session client: the "own cv objects" policy already scopes it
  // to this user's folder.
  const { data: objects, error: listError } = await supabase.storage
    .from("cvs")
    .list(userId, { limit: 1000 });
  if (listError) {
    console.error("[api/account] storage list failed", listError);
    return NextResponse.json({ error: "storage_cleanup_failed" }, { status: 502 });
  }

  const paths = (objects ?? []).map((object) => `${userId}/${object.name}`);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from("cvs").remove(paths);
    if (removeError) {
      console.error("[api/account] storage remove failed", removeError);
      return NextResponse.json({ error: "storage_cleanup_failed" }, { status: 502 });
    }
  }

  // Deleting an auth user needs the service role — there is no RLS path to it.
  // The id comes from the verified claims above, never from the request.
  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("[api/account] auth user delete failed", deleteError);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  // The user and their refresh tokens are gone server-side; this clears the
  // now-dead session cookies from the browser.
  await supabase.auth.signOut({ scope: "local" });

  return NextResponse.json({ success: true });
}
