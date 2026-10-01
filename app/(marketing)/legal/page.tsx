import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/LegalPage";
import { CONSENT_VERSION, PUBLISHER } from "@/lib/legal";

export const metadata: Metadata = { title: "Legal notice — Interview Prep" };

// Mentions légales (French LCEN art. 6): who publishes the site and who
// hosts it. The details come from env via lib/legal.ts, so no personal
// information lives in the repository.
export default function LegalNoticePage() {
  return (
    <LegalPage title="Legal notice / Mentions légales" updated={CONSENT_VERSION}>
      <section id="fr" aria-labelledby="legal-fr" lang="fr" className="scroll-mt-24">
        <h2 id="legal-fr">Mentions légales</h2>
        <h3>Éditeur</h3>
        <p>
          {PUBLISHER.name} — {PUBLISHER.status}
          <br />
          {PUBLISHER.address}
          <br />
          Contact : {PUBLISHER.email}
        </p>
        <h3>Directeur de la publication</h3>
        <p>{PUBLISHER.name}</p>
        <h3>Hébergement</h3>
        <p>{PUBLISHER.host}</p>
        <h3>Données personnelles</h3>
        <p>
          Voir la <Link href="/privacy#fr">politique de confidentialité</Link>.
        </p>
      </section>

      <section id="en" aria-labelledby="legal-en" className="scroll-mt-24">
        <h2 id="legal-en">Legal notice</h2>
        <h3>Publisher</h3>
        <p>
          {PUBLISHER.name} — {PUBLISHER.status}
          <br />
          {PUBLISHER.address}
          <br />
          Contact: {PUBLISHER.email}
        </p>
        <h3>Hosting</h3>
        <p>{PUBLISHER.host}</p>
        <h3>Personal data</h3>
        <p>
          See the <Link href="/privacy#en">privacy policy</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
