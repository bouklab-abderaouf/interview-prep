import { redirectToPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303, not 307: the browser follows with a GET instead of re-POSTing to /.
  return redirectToPath("/", 303);
}
