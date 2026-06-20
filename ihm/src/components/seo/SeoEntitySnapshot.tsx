import Link from 'next/link';

export interface SeoEntityLink {
  href: string;
  name: string;
  description?: string | null;
  meta?: string | null;
}

interface SeoEntitySnapshotProps {
  title: string;
  description: string;
  items: SeoEntityLink[];
}

function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function SeoJsonLd({ value }: { value: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(value) }} />;
}

export function SeoEntitySnapshot({ title, description, items }: SeoEntitySnapshotProps) {
  if (!items.length) return null;

  return (
    <section className="sr-only" aria-label={title}>
      <h2>{title}</h2>
      <p>{description}</p>
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href}>{item.name}</Link>
            {item.meta ? <span> - {item.meta}</span> : null}
            {item.description ? <p>{item.description}</p> : null}
          </li>
        ))}
      </ul>
      <noscript>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
          <ul>
            {items.map((item) => (
              <li key={`noscript-${item.href}`}>
                <a href={item.href}>{item.name}</a>
                {item.meta ? <span> - {item.meta}</span> : null}
                {item.description ? <p>{item.description}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      </noscript>
    </section>
  );
}

export function SeoDetailSnapshot({
  title,
  description,
  facts,
}: {
  title: string;
  description?: string | null;
  facts?: Array<string | number | null | undefined>;
}) {
  const cleanFacts = (facts ?? []).filter((fact) => fact !== null && fact !== undefined && String(fact).trim() !== '');

  return (
    <article className="sr-only" aria-label={title}>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {cleanFacts.length ? (
        <ul>
          {cleanFacts.map((fact) => (
            <li key={String(fact)}>{fact}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
