import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageShell } from '@/components/ui/PageShell';
import { DEFAULT_AUTH_COOKIE_NAME } from '@/lib/app-constants';

function env(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

const CONTACT_EMAIL = env('NEXT_PUBLIC_CONTACT_EMAIL', env('CONTACT_EMAIL', 'gwenvaelcaouissin@gmail.com'));
const PUBLISHER_NAME = env('LEGAL_PUBLISHER_NAME', 'ampynjord');
const PUBLISHER_STATUS = env('LEGAL_PUBLISHER_STATUS', 'Individual publisher');
const PUBLISHER_ADDRESS = env('LEGAL_PUBLISHER_ADDRESS', 'Available on legitimate legal request through the contact email.');
const PUBLISHER_PHONE = env('LEGAL_PUBLISHER_PHONE', 'Available on legitimate legal request through the contact email.');
const HOST_NAME = env('LEGAL_HOST_NAME', 'EU VPS hosting provider');
const HOST_ADDRESS = env('LEGAL_HOST_ADDRESS', 'European Union');
const HOST_PHONE = env('LEGAL_HOST_PHONE', 'Available from the hosting provider legal notice.');
const SITE_URL = env('NEXT_PUBLIC_SITE_URL', 'https://starvis.ampynjord.bzh');
const CHAT_PROVIDER = env('NEXT_PUBLIC_CHAT_PROVIDER_NAME', 'Mistral AI');
const CHAT_PROVIDER_URL = env('NEXT_PUBLIC_CHAT_PROVIDER_URL', 'https://mistral.ai');

export const metadata: Metadata = {
  title: 'Legal notice and privacy policy - STARVIS',
  description:
    'Legal notice, terms of use, GDPR privacy policy, cookies and proprietary source code notice for STARVIS, an unofficial project not affiliated with Cloud Imperium Games.',
};

export const dynamic = 'force-dynamic';

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="sci-panel p-6 scroll-mt-24">
      <h2 className="mb-4 font-orbitron text-sm font-bold uppercase tracking-widest text-cyan-400">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-400">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-inside list-disc space-y-1 pl-2">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function InfoGrid({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="border border-cyan-500/10 bg-slate-950/40 p-3">
          <dt className="font-mono-sc text-[10px] uppercase tracking-widest text-slate-600">{row.label}</dt>
          <dd className="mt-1 text-slate-300">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function LegalPage() {
  return (
    <PageShell size="lg" className="p-4 md:p-6">
      <PageHeader
        eyebrow="Starvis"
        title="Legal notice"
        subtitle="Unofficial project, not affiliated with Cloud Imperium Games. Legal notice, privacy policy, cookies and terms of use. Last updated: June 2026."
      />

      <Section title="Legal publisher">
        <InfoGrid
          rows={[
            { label: 'Website', value: SITE_URL },
            { label: 'Publisher', value: PUBLISHER_NAME },
            { label: 'Status', value: PUBLISHER_STATUS },
            { label: 'Address', value: PUBLISHER_ADDRESS },
            {
              label: 'Contact',
              value: (
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-cyan-500 underline underline-offset-2 hover:text-cyan-300">
                  {CONTACT_EMAIL}
                </a>
              ),
            },
            { label: 'Phone', value: PUBLISHER_PHONE },
            { label: 'Hosting provider', value: HOST_NAME },
            { label: 'Host address', value: HOST_ADDRESS },
            { label: 'Host phone', value: HOST_PHONE },
          ]}
        />
        <P>
          Production deployments must fill the LEGAL_* environment variables with the accurate publisher
          and hosting information required by applicable law.
        </P>
      </Section>

      <Section title="About the project">
        <P>
          <span className="font-semibold text-slate-200">STARVIS</span> is an unofficial, independent,
          non-commercial community project for Star Citizen players. It provides searchable game data, calculators,
          comparison tools, corporation tools, a Discord bot and an optional AI assistant.
        </P>
        <P>
          STARVIS is not an official Cloud Imperium Games product and is not affiliated with, endorsed by,
          sponsored by, or officially connected to Cloud Imperium Games Corporation, Cloud Imperium Rights LLC,
          Roberts Space Industries Corp. or their affiliates.
        </P>
      </Section>

      <Section title="Terms of use">
        <P>
          The service is provided free of charge on a best-effort basis. Game data may be incomplete, outdated,
          approximate or affected by Star Citizen patches, extractor limitations, RSI website changes, cache delays
          or AI/tooling errors.
        </P>
        <Ul
          items={[
            'Do not use STARVIS for illegal activity, harassment, automated abuse, credential sharing, scraping abuse or service disruption.',
            'Do not submit unlawful, confidential, sensitive, defamatory or third-party personal data in bug reports, corporation notes, Discord prompts or AI chat messages.',
            'Developer and API tokens are personal credentials. Store them securely and revoke or rotate them if exposed.',
            'External projects using STARVIS APIs are responsible for their own legal notices, privacy disclosures, rate limiting and data accuracy warnings.',
            'Access may be suspended or removed to protect the service, users, infrastructure, or third-party rights.',
          ]}
        />
      </Section>

      <Section title="Cloud Imperium Games intellectual property">
        <P>
          Star Citizen, Squadron 42, Roberts Space Industries, ship names, item names, lore, imagery, Galactapedia,
          Comm-links and related game content are trademarks, copyrighted works or other intellectual property of
          Cloud Imperium Games, Cloud Imperium Rights LLC, Roberts Space Industries Corp. and/or their affiliates.
        </P>
        <P>
          STARVIS does not claim ownership over CIG/RSI content. Game data is displayed for non-commercial,
          community, informational and educational purposes. Sources include in-game files, DataForge-derived data,
          the RSI Ship Matrix, Galactapedia, Comm-links, Starmap and public RSI organization pages.
        </P>
        <P>
          If a right holder requests removal or adjustment of specific content, contact {CONTACT_EMAIL}; the request
          will be reviewed and handled promptly.
        </P>
      </Section>

      <Section title="Source code license">
        <P>
          The STARVIS source code and associated project files are proprietary and owned by {PUBLISHER_NAME}, unless
          a separate written agreement says otherwise. Access to the repository does not grant permission to use,
          copy, modify, host, distribute, sublicense, sell, or otherwise exploit the software.
        </P>
        <P>
          This source code notice applies only to STARVIS code owned by {PUBLISHER_NAME}. It does not cover, license
          or claim ownership over Star Citizen, RSI, CIG, Cloud Imperium Games data, assets, names, lore, imagery or
          related intellectual property.
        </P>
      </Section>

      <Section title="Privacy policy - GDPR">
        <h3 className="pt-1 text-xs font-semibold uppercase tracking-wider text-slate-300">Controller and contact</h3>
        <P>
          The data controller is {PUBLISHER_NAME}. For privacy requests, contact{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-cyan-500 underline underline-offset-2 hover:text-cyan-300">
            {CONTACT_EMAIL}
          </a>
          .
        </P>

        <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Data categories</h3>
        <Ul
          items={[
            'Account data: email address, username, role, avatar URL, creation/update dates and email verification status.',
            'Security data: bcrypt password hash, session JWT, API JWT, email verification token hash, password reset token hash, encrypted 2FA secret and 2FA status.',
            'User content: bug report titles/descriptions/attachments, corporation memberships, ranks, fleet notes and moderation/admin updates.',
            'Technical data: server logs, request metadata required for security, error diagnosis and abuse prevention.',
            'AI and Discord data: prompts/messages sent to the STARVIS assistant or Discord bot, limited to the message content needed to generate an answer.',
            'Public game/community data: RSI organization data and public game data cached from public or game-derived sources.',
          ]}
        />

        <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Purposes and legal bases</h3>
        <Ul
          items={[
            'Account creation, authentication and profile management: performance of the requested service.',
            'Email verification, password reset, 2FA, API token access, rate limiting, logging and abuse prevention: security and legitimate interest.',
            'Bug reports, corporation tools and support requests: performance of the requested service and legitimate interest in maintaining the project.',
            'AI assistant and Discord bot answers: user request and performance of the requested feature.',
            'Legal notices, right-holder requests and compliance handling: legal obligation and legitimate interest.',
          ]}
        />

        <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Recipients and processors</h3>
        <Ul
          items={[
            'STARVIS administrators can access account, support and moderation data when required to operate or secure the service.',
            `The hosting provider ${HOST_NAME} hosts the application, database and logs.`,
            'The configured SMTP provider processes email addresses and message metadata for verification, reset and notification emails.',
            `${CHAT_PROVIDER} may process AI prompts and contextual messages when the AI assistant or Discord AI command is used.`,
            'Discord may process messages and metadata when users interact with the STARVIS Discord bot.',
          ]}
        />
        <P>
          No personal data is sold. No advertising or behavioral tracking partner is used by STARVIS.
        </P>

        <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Retention</h3>
        <Ul
          items={[
            'Account data is kept while the account is active. Inactive accounts may be removed after 2 years, with prior notice when practical.',
            'Email verification tokens expire after 48 hours. Password reset tokens expire after 1 hour.',
            'Session tokens follow the configured session duration. Developer/API tokens expire after the configured API token duration.',
            '2FA secrets are kept while 2FA is configured and are deleted when 2FA is disabled.',
            'Bug reports and support exchanges are kept while useful for maintenance, security, audit history or legal defense, then deleted or anonymized.',
            'Server logs are kept only as long as needed for security, debugging and abuse prevention, according to the production logging configuration.',
            'AI prompts are not intentionally stored by STARVIS outside technical logs, but may be processed by the AI provider according to its own service terms.',
          ]}
        />

        <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Your rights</h3>
        <P>
          You may request access, rectification, erasure, portability, limitation or objection where applicable.
          Account deletion is available from the profile page. For other requests, contact {CONTACT_EMAIL}. You may
          also lodge a complaint with the CNIL:{' '}
          <a href="https://www.cnil.fr" target="_blank" rel="noreferrer" className="text-cyan-500 underline underline-offset-2 hover:text-cyan-300">
            www.cnil.fr
          </a>
          .
        </P>
      </Section>

      <Section id="cookies" title="Cookies and local storage">
        <P>
          STARVIS uses the strictly necessary session cookie{' '}
          <span className="font-mono-sc text-slate-300">{DEFAULT_AUTH_COOKIE_NAME}</span> to authenticate logged-in
          users. It is configured as HttpOnly and Secure in production. It is not used for advertising or analytics.
        </P>
        <P>
          Local storage may keep interface preferences such as cookie notice state, selected game environment,
          chat panel size and theme/UI preferences. These values stay on your device and are not used for tracking.
        </P>
        <P>
          Declining the cookie notice only records the choice and does not disable the strictly necessary
          authentication cookie required for login.
        </P>
      </Section>

      <Section title="AI assistant transparency">
        <P>
          The AI assistant is optional and restricted to authorized users. When used, messages and contextual prompts
          are sent to {CHAT_PROVIDER} through its API endpoint ({CHAT_PROVIDER_URL}) to produce an answer. Do not send
          passwords, API tokens, private keys, personal data, confidential information or third-party secrets in prompts.
        </P>
        <P>
          The assistant may query a restricted read-only subset of STARVIS game tables. It is designed for convenience,
          not as an authoritative legal, financial, medical, safety or operational decision system.
        </P>
      </Section>
    </PageShell>
  );
}
