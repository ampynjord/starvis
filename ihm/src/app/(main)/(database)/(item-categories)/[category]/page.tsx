import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SeoEntitySnapshot, SeoJsonLd } from '@/components/seo/SeoEntitySnapshot';
import { collectionJsonLd, getItemSeoLinks } from '@/lib/seo-snapshots';
import ItemsPage from '@/views/ItemsPage';

type Props = { params: Promise<{ category: string }> };

export const dynamic = 'force-dynamic';

const CATEGORY_META: Record<string, { title: string; desc: string; keywords: string[] }> = {
  armor: { title: 'Armor', desc: 'Star Citizen armor database — undersuits, helmets, core armor, arms, legs, backpacks and flair with stats and buy locations.', keywords: ['star citizen armor', 'sc helmet', 'star citizen undersuit', 'sc backpack', 'fps armor'] },
  weapons: { title: 'Weapons', desc: 'Star Citizen FPS weapons database — sidearms, primary weapons (AR, SMG, shotgun, sniper, LMG), special, melee, attachments and throwables.', keywords: ['star citizen weapons', 'sc fps weapons', 'star citizen guns', 'sc rifle', 'sc pistol'] },
  items: { title: 'FPS Items', desc: 'Browse Star Citizen FPS gear: armor sets, helmets, backpacks, utility items and gadgets. Stats and equipment data extracted from game files.', keywords: ['star citizen fps gear', 'sc armor', 'star citizen helmet', 'fps items sc', 'star citizen equipment'] },
  utility: { title: 'Utility', desc: 'Star Citizen utility items — medpens, oxypens, tractor beams, mining gadgets, flares and tigerclaws with stats and buy locations.', keywords: ['star citizen utility', 'sc medpen', 'sc tigerclaw', 'sc tractor beam', 'fps tools'] },
  sustenance: { title: 'Sustenance', desc: 'Star Citizen food and drinks — water, MREs, Cruz drinks, and energy bars to keep your character fed and hydrated.', keywords: ['star citizen food', 'star citizen drink', 'sc cruz', 'star citizen survival'] },
  clothing: { title: 'Clothing', desc: 'Star Citizen clothing — jackets, shirts, pants, boots, and hats to customize your character.', keywords: ['star citizen clothing', 'sc fashion', 'star citizen jacket', 'sc boots'] },
  ammo: { title: 'Ammunition', desc: 'Star Citizen ammo — magazines, energy batteries, rockets, missiles, and other ammunition for your weapons.', keywords: ['star citizen ammo', 'sc magazine', 'star citizen missiles', 'fps ammo'] },
};

// Also support redirect categories
const REDIRECT_META: Record<string, string> = {
  consumables: 'sustenance',
  'fps-gear': 'armor',
  'other-items': 'utility',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  if (REDIRECT_META[category]) return { alternates: { canonical: `/${REDIRECT_META[category]}` } };

  const meta = CATEGORY_META[category];
  if (!meta) return { title: 'Items' };

  return {
    title: meta.title,
    description: meta.desc,
    keywords: meta.keywords,
    alternates: { canonical: `/${category}` },
    openGraph: {
      title: `${meta.title} - STARVIS`,
      description: meta.desc,
    },
  };
}

export default async function Page({ params }: Props) {
  const { category } = await params;
  
  // Handling old route redirects
  if (REDIRECT_META[category]) {
    const { redirect } = await import('next/navigation');
    redirect(`/${REDIRECT_META[category]}`);
  }

  const meta = CATEGORY_META[category];
  if (!meta) {
    notFound();
  }
  
  const links = category === 'items' ? await getItemSeoLinks() : [];

  return (
    <>
      <SeoJsonLd value={collectionJsonLd(`Star Citizen ${meta.title}`, `/${category}`, links)} />
      <ItemsPage group={category === 'items' ? undefined : (category as any)} />
      {links.length > 0 && (
        <SeoEntitySnapshot
          title={`Indexable Star Citizen ${meta.title} database`}
          description="Crawlable STARVIS gear entries with item type, manufacturer and key stats."
          items={links}
        />
      )}
    </>
  );
}
