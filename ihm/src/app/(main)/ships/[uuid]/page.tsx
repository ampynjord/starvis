import type { Metadata } from 'next';
import { SERVER_API_KEY, SERVER_API_URL } from '@/lib/server-config';
import ShipDetailPage from '@/views/ShipDetailPage';

export async function generateMetadata({ params }: { params: Promise<{ uuid: string }> }): Promise<Metadata> {
  try {
    const { uuid } = await params;
    const res = await fetch(`${SERVER_API_URL}/api/v1/ships/${uuid}`, {
      headers: SERVER_API_KEY ? { 'X-API-Key': SERVER_API_KEY } : undefined,
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error();
    const { data } = await res.json();
    const mfr = data.manufacturer_name ? `${data.manufacturer_name} ` : '';
    const desc = `${mfr}${data.name} — complete stats, hardpoints, variants and 3D hologram on STARVIS. Career: ${data.career ?? 'N/A'}. SCM speed: ${data.scm_speed ?? 'N/A'} m/s.`;
    return {
      title: data.name,
      description: desc,
      keywords: [data.name, 'star citizen', data.manufacturer_name, data.career].filter(Boolean) as string[],
      openGraph: { title: `${data.name} — STARVIS`, description: desc },
    };
  } catch {
    return { title: 'Ship Details' };
  }
}

export default function Page() {
  return <ShipDetailPage />;
}
