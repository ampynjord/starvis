import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mentions légales — STARVIS',
  description: 'Mentions légales, crédits, politique de confidentialité RGPD et licence du projet STARVIS.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border rounded-sm bg-panel/60 p-6">
      <h2 className="font-orbitron text-sm font-bold tracking-widest text-cyan-400 uppercase mb-4">{title}</h2>
      <div className="space-y-3 text-sm text-slate-400 leading-relaxed">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1 pl-2">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function LegalPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-orbitron text-xl font-bold tracking-widest text-slate-100 uppercase mb-1">
          Mentions légales
        </h1>
        <p className="text-xs text-slate-600 font-mono-sc">Dernière mise à jour : mai 2025</p>
      </div>

      <Section title="Présentation du projet">
        <P>
          <span className="text-slate-200 font-semibold">STARVIS</span> est un projet communautaire indépendant et{' '}
          <span className="text-slate-200">non lucratif</span>, développé par des passionnés de Star Citizen.
          Il n'est pas affilié à, soutenu par, ni officiellement connecté à{' '}
          <span className="text-slate-200">Cloud Imperium Games Corporation</span> ou{' '}
          <span className="text-slate-200">Roberts Space Industries Corp.</span>
        </P>
        <P>
          Le code source est publié sous licence{' '}
          <a
            href="https://github.com/ampynjord/starvis/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2"
          >
            MIT
          </a>
          .
        </P>
      </Section>

      <Section title="Crédits — Propriété intellectuelle de Cloud Imperium Games">
        <P>
          Star Citizen® ainsi que l'ensemble des données du jeu, noms de vaisseaux, noms d'items, lore, visuels
          et contenus associés sont la propriété intellectuelle de{' '}
          <span className="text-slate-200">Cloud Imperium Games Corporation</span> et/ou{' '}
          <span className="text-slate-200">Roberts Space Industries Corp.</span>
        </P>
        <P>© 2012–2025 Cloud Imperium Rights LLC. Tous droits réservés.</P>
        <P>Les données affichées sur STARVIS proviennent des sources suivantes :</P>
        <Ul
          items={[
            'Données in-game extraites du fichier P4K de Star Citizen via DataForge (composants, vaisseaux, items FPS, missions, crafting…)',
            'RSI Ship Matrix — API officielle de Roberts Space Industries',
            'Site RSI — robertsspaceindustries.com (Galactapedia, Comm-links, Starmap, CTM)',
          ]}
        />
        <P>
          Ces données sont utilisées dans un cadre strictement non commercial, à des fins communautaires
          et éducatives, conformément à la politique de licence communautaire de Cloud Imperium Games.
        </P>
        <P>
          STARVIS ne revendique aucun droit de propriété sur ces contenus. Si Cloud Imperium Games souhaite
          que certaines données soient retirées, nous nous y conformerons sans délai.
        </P>
      </Section>

      <Section title="Politique de confidentialité — RGPD">
        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider">Responsable du traitement</h3>
        <P>
          STARVIS est exploité par <span className="text-slate-200">ampynjord</span>. Pour toute question
          relative à vos données personnelles, contactez :{' '}
          <a
            href="mailto:gwenvaelcaouissin@gmail.com"
            className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2"
          >
            gwenvaelcaouissin@gmail.com
          </a>
        </P>

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Données collectées
        </h3>
        <P>
          Lors de l'inscription et de l'utilisation du service, les données suivantes peuvent être collectées :
        </P>
        <Ul
          items={[
            "Adresse e-mail (identifiant de connexion)",
            "Nom d’utilisateur (pseudo)",
            "Mot de passe (stocké sous forme de hash bcrypt — jamais en clair)",
            "Rôle utilisateur (user / beta_tester / admin)",
            "URL d’avatar (optionnel)",
          ]}
        />
        <P>Aucune donnée de paiement n'est collectée. Le service est entièrement gratuit.</P>

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Finalité du traitement
        </h3>
        <Ul
          items={[
            'Authentification et gestion du compte utilisateur',
            'Différenciation des accès (fonctionnalités beta)',
            'Sécurité et prévention des abus',
          ]}
        />

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Base légale
        </h3>
        <P>
          Le traitement repose sur le consentement explicite recueilli lors de l'inscription (article 6(1)(a) du RGPD)
          et sur l'exécution du contrat d'accès au service (article 6(1)(b) du RGPD).
        </P>

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Durée de conservation
        </h3>
        <P>
          Les données sont conservées pendant toute la durée d'activité du compte. Un compte inactif depuis
          plus de 2 ans peut être supprimé après notification par e-mail.
        </P>

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Vos droits
        </h3>
        <P>
          Conformément au RGPD, vous disposez des droits suivants sur vos données personnelles :
        </P>
        <Ul
          items={[
            "Droit d'accès — obtenir une copie de vos données",
            "Droit de rectification — corriger des données inexactes",
            "Droit à l'effacement — demander la suppression de votre compte et de vos données",
            "Droit à la portabilité — recevoir vos données dans un format structuré",
            "Droit d'opposition — vous opposer à certains traitements",
          ]}
        />
        <P>
          Le <span className="text-slate-300">droit à l'effacement</span> (suppression de compte) est directement
          accessible depuis votre{' '}
          <a href="/profile" className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2">
            profil
          </a>{' '}
          (section "Zone de danger"). Pour les autres droits, contactez{' '}
          <a
            href="mailto:gwenvaelcaouissin@gmail.com"
            className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2"
          >
            gwenvaelcaouissin@gmail.com
          </a>
          . Vous disposez également du droit de saisir la{' '}
          <a
            href="https://www.cnil.fr"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2"
          >
            CNIL
          </a>
          .
        </P>

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Hébergement &amp; sous-traitants
        </h3>
        <P>
          Les données sont hébergées sur un VPS situé dans l'Union Européenne. Aucune donnée personnelle
          n'est transmise à des tiers à des fins commerciales.
        </P>
      </Section>

      <Section title="Cookies &amp; Stockage local">
        <P>
          STARVIS utilise un cookie de session <span className="font-mono-sc text-slate-300">token</span>{' '}
          (HttpOnly, Secure) pour maintenir votre connexion. Aucun cookie publicitaire ou de tracking
          tiers n'est utilisé.
        </P>
        <P>
          Le choix d'environnement (LIVE/PTU) est mémorisé via{' '}
          <span className="font-mono-sc text-slate-300">localStorage</span> sur votre appareil
          uniquement.
        </P>
      </Section>

      <Section title="Licence du code source">
        <P>
          Le code source de STARVIS est distribué sous licence{' '}
          <span className="text-slate-200">MIT</span>. Vous êtes libre de l'utiliser, le modifier et le
          redistribuer à condition de conserver les mentions de copyright et l'avis de propriété
          intellectuelle de Cloud Imperium Games inclus dans le fichier LICENSE.
        </P>
        <P>
          La licence MIT s'applique au code uniquement — elle ne couvre pas les données ou contenus
          appartenant à Cloud Imperium Games.
        </P>
      </Section>
    </div>
  );
}
