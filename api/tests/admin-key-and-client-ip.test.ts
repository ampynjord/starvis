/**
 * Longueur minimale de `ADMIN_API_KEY` en production, et adresse du visiteur
 * lue avant les limiteurs de débit (l'IHM transmet l'adresse réelle).
 */
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN_API_KEY_MIN_LENGTH, adminApiKeyProblem, configuredAdminApiKey, markInternalClient } from '../src/middleware/auth.js';
import { resolveClientIp } from '../src/utils/request-ip.js';

const STRONG_KEY = 'a'.repeat(ADMIN_API_KEY_MIN_LENGTH);
const SERVER_KEY = 'server-key-for-the-client-ip-test';

function fakeRequest(headers: Record<string, string>, ip = '172.18.0.5'): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: lower,
    ip,
    socket: { remoteAddress: ip },
    get: (name: string) => lower[name.toLowerCase()],
  } as unknown as Request;
}

describe('configuredAdminApiKey', () => {
  it('refuse en production une clé plus courte que le minimum', () => {
    const env = { NODE_ENV: 'production', ADMIN_API_KEY: STRONG_KEY.slice(1) };
    expect(configuredAdminApiKey(env)).toBeUndefined();
    expect(adminApiKeyProblem(env)).toContain(String(ADMIN_API_KEY_MIN_LENGTH));
  });

  it('accepte en production une clé du minimum de caractères', () => {
    const env = { NODE_ENV: 'production', ADMIN_API_KEY: STRONG_KEY };
    expect(configuredAdminApiKey(env)).toBe(STRONG_KEY);
    expect(adminApiKeyProblem(env)).toBeNull();
  });

  it('laisse les clés courtes hors production (tests, CI, développement)', () => {
    const env = { NODE_ENV: 'test', ADMIN_API_KEY: 'ci_admin_key' };
    expect(configuredAdminApiKey(env)).toBe('ci_admin_key');
    expect(adminApiKeyProblem(env)).toBeNull();
  });

  it('reste fermée quand la clé est absente, sans alerte', () => {
    expect(configuredAdminApiKey({ NODE_ENV: 'production' })).toBeUndefined();
    expect(adminApiKeyProblem({ NODE_ENV: 'production' })).toBeNull();
  });
});

describe('markInternalClient avant les limiteurs', () => {
  const next = vi.fn() as unknown as NextFunction;
  const res = {} as Response;

  it("lit l'adresse du visiteur transmise par l'IHM quand la clé serveur est valide", () => {
    vi.stubEnv('SERVER_API_KEY', SERVER_KEY);
    const req = fakeRequest({
      'x-api-key': SERVER_KEY,
      'x-starvis-internal-client': 'Starvis-IHM',
      'x-starvis-forwarded-for': '203.0.113.7, 10.0.0.1',
    });
    markInternalClient(req, res, next);
    expect(req.internalClient).toBe('Starvis-IHM');
    expect(resolveClientIp(req)).toBe('203.0.113.7');
    vi.unstubAllEnvs();
  });

  it("ignore l'adresse transmise sans la clé serveur (pas d'usurpation)", () => {
    vi.stubEnv('SERVER_API_KEY', SERVER_KEY);
    const req = fakeRequest({
      'x-api-key': 'wrong-key',
      'x-starvis-internal-client': 'Starvis-IHM',
      'x-starvis-forwarded-for': '203.0.113.7',
    });
    markInternalClient(req, res, next);
    expect(req.internalClient).toBeUndefined();
    expect(resolveClientIp(req)).toBe('172.18.0.5');
    vi.unstubAllEnvs();
  });
});
