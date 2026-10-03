import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, ProcessorTable } from "@/components/legal/LegalPage";
import { CONSENT_VERSION, GEMINI_TIER, PROCESSORS, PUBLISHER } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy — Interview Prep" };

// Production readiness phase 5. Facts come from lib/legal.ts so this page,
// the upload page and the interview notices can't disagree. Not legal advice:
// review before opening sign-ups.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy / Politique de confidentialité" updated={CONSENT_VERSION}>
      <section id="en" aria-labelledby="privacy-en" className="scroll-mt-24">
        <h2 id="privacy-en">English</h2>

        <h3>Who is responsible</h3>
        <p>
          {PUBLISHER.name} ({PUBLISHER.email}) is the controller of the personal data processed by Interview
          Prep. Write to that address about anything on this page.
        </p>

        <h3>What we process</h3>
        <ul>
          <li>Your account email, used to sign you in with a link.</li>
          <li>The CV (PDF) and job description you upload, and the interview plan built from them.</li>
          <li>
            Your voice during an interview: it streams to Google&apos;s Gemini API while the session runs. We
            don&apos;t record or store the audio. The written transcript is saved to your account, along with
            your scorecards, progress and XP.
          </li>
          <li>How many analyses, interviews and scorings you started each day, to enforce daily limits.</li>
          <li>
            For the public demo, which needs no account: a one-way hash of your IP address, kept 30 days to
            limit how often a demo can be started. No demo transcript is stored.
          </li>
          <li>Technical logs kept by our host, and scrubbed error reports (never your CV, transcript or email).</li>
        </ul>

        <h3>Why, and on what legal basis</h3>
        <ul>
          <li>Running the service you signed up for: your account, roadmaps, interviews and scorecards (contract, GDPR Art. 6(1)(b)).</li>
          <li>
            Sending your CV, job description and interview audio to Google&apos;s Gemini API: your consent,
            asked for on the upload page before anything is sent and recorded with its date and version (Art.
            6(1)(a)). You can withdraw it at any time by deleting your data or your account.
          </li>
          <li>Keeping the service safe and affordable: daily limits, the bot check, the demo&apos;s IP hash, error reports (legitimate interest, Art. 6(1)(f)).</li>
        </ul>

        <h3>Who processes it</h3>
        <ProcessorTable rows={PROCESSORS} />
        <p>
          Google and Vercel are in the United States. Transfers rely on the EU–US Data Privacy Framework or the
          European Commission&apos;s standard contractual clauses.
        </p>
        {GEMINI_TIER === "free" && (
          <p>
            <strong>Right now the app uses Gemini&apos;s free tier, on which Google may use what is sent to it to
            improve its products.</strong> Don&apos;t upload anything you wouldn&apos;t want used that way.
          </p>
        )}

        <h3>How long it&apos;s kept</h3>
        <ul>
          <li>Your CVs, job descriptions, roadmaps, interviews and scorecards: until you delete them. Deleting your account deletes all of it.</li>
          <li>The demo&apos;s IP hash and the daily usage counters: 30 days.</li>
          <li>Files left behind by an interrupted upload: removed by a daily clean-up.</li>
          <li>Database backups at our database provider roll over within their retention window.</li>
        </ul>

        <h3>Your rights</h3>
        <ul>
          <li>
            Access and portability: <Link href="/documents#your-data">Documents → Your data → Download my data</Link>{" "}
            gives you everything we hold, as JSON.
          </li>
          <li>Erasure: delete a roadmap or an interview where it&apos;s listed, or your whole account from Documents.</li>
          <li>Rectification, restriction and objection: write to {PUBLISHER.email}.</li>
          <li>
            Complaints: you can complain to the CNIL (
            <a href="https://www.cnil.fr" rel="noopener noreferrer" target="_blank">cnil.fr</a>) or your own data
            protection authority.
          </li>
        </ul>

        <h3>Cookies</h3>
        <p>
          Only what the app needs to work: Supabase&apos;s sign-in cookies (<code>sb-…</code>, strictly
          necessary) and a <code>theme</code> cookie remembering light or dark mode (one year). Cloudflare
          Turnstile checks your browser for bots on the demo. There are no advertising or analytics cookies, which
          is why there&apos;s no cookie banner.
        </p>

        <h3>AI and automated decisions</h3>
        <p>
          You speak with an AI interviewer, not a person, and every interview says so before it starts. Scores and
          feedback are generated by AI as practice feedback. They aren&apos;t a decision about you, and nothing
          with legal or similar effect is decided automatically.
        </p>

        <h3>Security</h3>
        <p>
          Data is encrypted in transit; each account can read only its own rows (database row-level security);
          CVs are in a private bucket and shared only through short-lived signed links.
        </p>
      </section>

      <section id="fr" aria-labelledby="privacy-fr" lang="fr" className="scroll-mt-24">
        <h2 id="privacy-fr">Français</h2>

        <h3>Responsable du traitement</h3>
        <p>
          {PUBLISHER.name} ({PUBLISHER.email}) est responsable des données personnelles traitées par Interview
          Prep. Écrivez à cette adresse pour toute question sur cette page.
        </p>

        <h3>Données traitées</h3>
        <ul>
          <li>L&apos;adresse e-mail de votre compte, pour vous connecter par lien.</li>
          <li>Le CV (PDF) et l&apos;offre d&apos;emploi que vous déposez, et le parcours d&apos;entretiens construit à partir d&apos;eux.</li>
          <li>
            Votre voix pendant un entretien : elle est transmise à l&apos;API Gemini de Google pendant la séance.
            Nous n&apos;enregistrons pas l&apos;audio. La transcription écrite est conservée dans votre compte, avec vos
            évaluations, votre progression et vos XP.
          </li>
          <li>Le nombre d&apos;analyses, d&apos;entretiens et d&apos;évaluations lancés chaque jour, pour appliquer les limites quotidiennes.</li>
          <li>
            Pour la démo publique, sans compte : une empreinte irréversible de votre adresse IP, conservée 30 jours
            pour limiter la fréquence des démos. Aucune transcription de démo n&apos;est conservée.
          </li>
          <li>Les journaux techniques de notre hébergeur, et des rapports d&apos;erreur nettoyés (jamais votre CV, votre transcription ni votre e-mail).</li>
        </ul>

        <h3>Finalités et bases légales</h3>
        <ul>
          <li>Fournir le service demandé : compte, parcours, entretiens, évaluations (exécution du contrat, RGPD art. 6.1.b).</li>
          <li>
            Transmettre votre CV, l&apos;offre et l&apos;audio des entretiens à l&apos;API Gemini de Google : votre
            consentement, demandé sur la page de dépôt avant tout envoi et enregistré avec sa date et sa version (art.
            6.1.a). Vous pouvez le retirer à tout moment en supprimant vos données ou votre compte.
          </li>
          <li>Garder le service sûr et soutenable : limites quotidiennes, vérification anti-robot, empreinte IP de la démo, rapports d&apos;erreur (intérêt légitime, art. 6.1.f).</li>
        </ul>

        <h3>Sous-traitants</h3>
        <ProcessorTable rows={PROCESSORS} />
        <p>
          Google et Vercel sont situés aux États-Unis. Les transferts reposent sur le cadre de protection des
          données UE–États-Unis (Data Privacy Framework) ou sur les clauses contractuelles types de la Commission
          européenne.
        </p>
        {GEMINI_TIER === "free" && (
          <p>
            <strong>L&apos;application utilise actuellement l&apos;offre gratuite de Gemini, pour laquelle Google peut
            utiliser les contenus envoyés pour améliorer ses produits.</strong> N&apos;envoyez rien que vous ne
            voudriez pas voir utilisé ainsi.
          </p>
        )}

        <h3>Durées de conservation</h3>
        <ul>
          <li>CV, offres, parcours, entretiens et évaluations : jusqu&apos;à ce que vous les supprimiez. Supprimer votre compte supprime l&apos;ensemble.</li>
          <li>Empreinte IP de la démo et compteurs d&apos;usage quotidiens : 30 jours.</li>
          <li>Fichiers laissés par un dépôt interrompu : supprimés par un nettoyage quotidien.</li>
          <li>Les sauvegardes de notre fournisseur de base de données sont écrasées dans leur fenêtre de rétention.</li>
        </ul>

        <h3>Vos droits</h3>
        <ul>
          <li>
            Accès et portabilité : <Link href="/documents#your-data">Documents → Your data → Download my data</Link>{" "}
            vous donne l&apos;ensemble de vos données au format JSON.
          </li>
          <li>Effacement : supprimez un parcours ou un entretien là où il apparaît, ou votre compte entier depuis Documents.</li>
          <li>Rectification, limitation et opposition : écrivez à {PUBLISHER.email}.</li>
          <li>
            Réclamation : auprès de la CNIL (
            <a href="https://www.cnil.fr" rel="noopener noreferrer" target="_blank">cnil.fr</a>).
          </li>
        </ul>

        <h3>Cookies</h3>
        <p>
          Seulement ce qui est nécessaire au fonctionnement : les cookies de connexion de Supabase (<code>sb-…</code>,
          strictement nécessaires) et un cookie <code>theme</code> qui retient le mode clair ou sombre (un an).
          Cloudflare Turnstile vérifie votre navigateur contre les robots sur la démo. Aucun cookie publicitaire ni
          de mesure d&apos;audience, d&apos;où l&apos;absence de bandeau cookies.
        </p>

        <h3>IA et décisions automatisées</h3>
        <p>
          Vous parlez avec un recruteur virtuel (une IA), pas avec une personne, et chaque entretien l&apos;annonce
          avant de commencer. Les notes et retours sont générés par une IA à des fins d&apos;entraînement : ce ne sont
          pas des décisions vous concernant, et rien ayant un effet juridique ou similaire n&apos;est décidé
          automatiquement.
        </p>

        <h3>Sécurité</h3>
        <p>
          Les données sont chiffrées en transit ; chaque compte ne peut lire que ses propres données (sécurité au
          niveau des lignes de la base) ; les CV sont dans un espace privé, partagés seulement par des liens signés
          de courte durée.
        </p>
      </section>
    </LegalPage>
  );
}
