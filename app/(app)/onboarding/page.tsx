import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/nav/BackLink";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

// This page always builds a *new* roadmap, so it's both the first-run screen
// and the "add another target role" screen. The only difference is whether
// there's anywhere to go back to — hence the head-only count.
export default async function OnboardingPage() {
  const supabase = await createClient();

  const { count } = await supabase
    .from("roadmaps")
    .select("id", { count: "exact", head: true });

  const hasRoadmaps = (count ?? 0) > 0;

  return (
    <div className="flex flex-1 flex-col">
      {hasRoadmaps && (
        <div className="mx-auto w-full max-w-xl px-8 pt-8">
          <BackLink href="/home">Home</BackLink>
        </div>
      )}
      <OnboardingForm />
    </div>
  );
}
