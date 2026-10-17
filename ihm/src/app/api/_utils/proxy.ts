import { headers as requestHeaders } from 'next/headers';
import { SERVER_API_KEY, SERVER_API_URL } from '@/lib/server-config';

export function upstreamUrl(path: string): string {
  return `${SERVER_API_URL}${path}`;
}

function firstForwardedIp(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

export function forwardedClientHeadersFromHeaders(headers: Headers): Record<string, string> {
  const forwardedFor = headers.get('x-forwarded-for');
  const realIp = headers.get('cf-connecting-ip') ?? headers.get('x-real-ip') ?? firstForwardedIp(forwardedFor);
  const userAgent = headers.get('user-agent');
  const out: Record<string, string> = {};
  if (forwardedFor) out['X-Starvis-Forwarded-For'] = forwardedFor;
  if (realIp) out['X-Starvis-Real-Ip'] = realIp;
  if (userAgent) out['User-Agent'] = userAgent;
  return out;
}

export async function forwardedClientHeaders(): Promise<Record<string, string>> {
  return forwardedClientHeadersFromHeaders(await requestHeaders());
}

export async function serverApiHeaders(includeJson = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (SERVER_API_KEY) headers['X-API-Key'] = SERVER_API_KEY;
  if (SERVER_API_KEY) headers['X-Starvis-Internal-Client'] = 'Starvis-IHM';
  if (includeJson) headers['Content-Type'] = 'application/json';
  return { ...(await forwardedClientHeaders()), ...headers };
}
