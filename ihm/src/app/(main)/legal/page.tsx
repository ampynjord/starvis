import type { Metadata } from 'next';
import { DEFAULT_AUTH_COOKIE_NAME } from '@/lib/app-constants';

export const metadata: Metadata = {
  title: 'Legal notice — STARVIS',
  description: 'Legal notice, credits, GDPR privacy policy and license for the STARVIS project.',
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
          Legal notice
        </h1>
        <p className="text-xs text-slate-600 font-mono-sc">Last updated: May 2025</p>
      </div>

      <Section title="About the project">
        <P>
          <span className="text-slate-200 font-semibold">STARVIS</span> is an independent,{' '}
          <span className="text-slate-200">non-profit community project</span> developed by Star Citizen
          enthusiasts. It is not affiliated with, endorsed by, or officially connected to{' '}
          <span className="text-slate-200">Cloud Imperium Games Corporation</span> or{' '}
          <span className="text-slate-200">Roberts Space Industries Corp.</span>
        </P>
        <P>
          The source code is published under the{' '}
          <a
            href="https://github.com/ampynjord/starvis/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2"
          >
            MIT license
          </a>
          .
        </P>
      </Section>

      <Section title="Credits — Cloud Imperium Games intellectual property">
        <P>
          Star Citizen® and all associated game data, ship names, item names, lore, imagery and related
          content are the intellectual property of{' '}
          <span className="text-slate-200">Cloud Imperium Games Corporation</span> and/or{' '}
          <span className="text-slate-200">Roberts Space Industries Corp.</span>
        </P>
        <P>© 2012–2025 Cloud Imperium Rights LLC. All rights reserved.</P>
        <P>Data displayed on STARVIS is sourced from:</P>
        <Ul
          items={[
            "In-game data extracted from Star Citizen's P4K file via DataForge (components, ships, FPS items, missions, crafting…)",
            "RSI Ship Matrix — official Roberts Space Industries API",
            "RSI website — robertsspaceindustries.com (Galactapedia, Comm-links, Starmap, CTM)",
          ]}
        />
        <P>
          This data is used for strictly non-commercial, community and educational purposes, in accordance
          with Cloud Imperium Games' community license policy.
        </P>
        <P>
          STARVIS makes no claim of ownership over this content. If Cloud Imperium Games requests the
          removal of specific data, we will comply without delay.
        </P>
      </Section>

      <Section title="Privacy policy — GDPR">
        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider">Data controller</h3>
        <P>
          STARVIS is operated by <span className="text-slate-200">ampynjord</span>. For any questions
          regarding your personal data, use the{' '}
          <a href="/report-bug" className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2">
            contact form
          </a>
        </P>

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Data collected
        </h3>
        <P>
          The following data may be collected when you register and use the service:
        </P>
        <Ul
          items={[
            "Email address (login identifier)",
            "Username (display name)",
            "Password (stored as a bcrypt hash — never in plain text)",
            "User role (user / beta_tester / admin)",
            "Avatar URL (optional)",
          ]}
        />
        <P>No payment data is collected. The service is entirely free.</P>

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Purpose of processing
        </h3>
        <Ul
          items={[
            "Authentication and user account management",
            "Access differentiation (beta features)",
            "Security and abuse prevention",
          ]}
        />

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Legal basis
        </h3>
        <P>
          Processing is based on the explicit consent collected at registration (GDPR article 6(1)(a))
          and on the performance of the service access contract (GDPR article 6(1)(b)).
        </P>

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Retention period
        </h3>
        <P>
          Data is retained for the duration of account activity. Accounts inactive for more than 2 years
          may be deleted after email notification.
        </P>

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Your rights
        </h3>
        <P>
          Under the GDPR, you have the following rights over your personal data:
        </P>
        <Ul
          items={[
            "Right of access — obtain a copy of your data",
            "Right of rectification — correct inaccurate data",
            "Right to erasure — request deletion of your account and data",
            "Right to data portability — receive your data in a structured format",
            "Right to object — object to certain processing activities",
          ]}
        />
        <P>
          The <span className="text-slate-300">right to erasure</span> (account deletion) is directly
          available from your{' '}
          <a href="/profile" className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2">
            profile
          </a>{' '}
          (Danger zone section). For other rights, use the{' '}
          <a href="/report-bug" className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2">
            contact form
          </a>
          . You also have the right to lodge a complaint with the relevant supervisory authority (CNIL in
          France:{' '}
          <a
            href="https://www.cnil.fr"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-500 hover:text-cyan-300 underline underline-offset-2"
          >
            www.cnil.fr
          </a>
          ).
        </P>

        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider pt-2">
          Hosting &amp; sub-processors
        </h3>
        <P>
          Data is hosted on a VPS located within the European Union. No personal data is transferred to
          third parties for commercial purposes.
        </P>
      </Section>

      <Section title="Cookies &amp; Local storage">
        <P>
          STARVIS uses a session cookie <span className="font-mono-sc text-slate-300">{DEFAULT_AUTH_COOKIE_NAME}</span>{' '}
          (HttpOnly, Secure) to maintain your session. No advertising or third-party tracking cookies
          are used.
        </P>
        <P>
          Your environment choice (LIVE/PTU) is stored via{' '}
          <span className="font-mono-sc text-slate-300">localStorage</span> on your device only.
        </P>
      </Section>

      <Section title="Source code license">
        <P>
          The STARVIS source code is distributed under the{' '}
          <span className="text-slate-200">MIT license</span>. You are free to use, modify and
          redistribute it provided you retain the copyright notices and the Cloud Imperium Games
          intellectual property notice included in the LICENSE file.
        </P>
        <P>
          The MIT license applies to the code only — it does not cover data or content owned by
          Cloud Imperium Games.
        </P>
      </Section>
    </div>
  );
}
