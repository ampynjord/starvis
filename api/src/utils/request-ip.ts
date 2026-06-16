import type { Request } from 'express';

function cleanIp(value: string | undefined | null): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(/^for=/i, '')
    .replace(/^"|"$/g, '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/^::ffff:/, '');
  return cleaned || null;
}

function firstForwardedIp(value: string | undefined | null): string | null {
  if (!value) return null;
  return cleanIp(value.split(',')[0]);
}

export function resolveClientIp(req: Request): string | null {
  if (req.internalClient) {
    const starvisForwardedFor = firstForwardedIp(req.get('x-starvis-forwarded-for'));
    const starvisRealIp = cleanIp(req.get('x-starvis-real-ip'));
    if (starvisForwardedFor) return starvisForwardedFor;
    if (starvisRealIp) return starvisRealIp;
  }

  return cleanIp(req.ip) ?? cleanIp(req.socket.remoteAddress);
}

export function anonymizeIp(ip: string | undefined | null): string | null {
  const normalized = cleanIp(ip);
  if (!normalized) return null;

  const ipv4Parts = normalized.split('.');
  if (ipv4Parts.length === 4) return `${ipv4Parts[0]}.${ipv4Parts[1]}.${ipv4Parts[2]}.0`;

  const ipv6Parts = normalized.split(':');
  if (ipv6Parts.length > 2) return `${ipv6Parts.slice(0, 4).join(':')}::`;

  return normalized;
}
