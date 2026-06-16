import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { clearRequestLogsForTests, listRequestLogs, recordRequestLog } from '../src/services/request-log-service.js';

describe('request-log-service', () => {
  it('keeps recent request metadata without query values or payload data', () => {
    clearRequestLogsForTests();
    recordRequestLog(
      {
        method: 'POST',
        originalUrl: '/api/v1/search?search=private',
        url: '/api/v1/search?search=private',
        ip: '192.168.1.42',
        get: (name: string) => (name === 'user-agent' ? 'Vitest' : undefined),
        jwtPayload: { sub: 7, role: 'admin' },
      } as any,
      200,
      12.4,
    );

    const logs = listRequestLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/search',
      statusCode: 200,
      durationMs: 12,
      userId: 7,
      username: null,
      role: 'admin',
      isExternalApi: false,
      authMethod: 'session',
      clientType: 'web_session',
      internalClient: null,
      ip: '192.168.1.0',
      userAgent: 'Vitest',
    });
  });

  it('resolves authenticated actors from bearer tokens on public routes', async () => {
    process.env.JWT_SECRET = 'request-log-test-secret';
    clearRequestLogsForTests();

    const token = jwt.sign(
      { sub: 42, uuid: 'user-uuid', email: 'user@example.test', username: 'ampynjord', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' },
    );

    recordRequestLog(
      {
        method: 'GET',
        originalUrl: '/api/v1/ships',
        url: '/api/v1/ships',
        headers: { authorization: `Bearer ${token}` },
        authMethod: 'session',
        ip: '10.0.0.55',
        get: (name: string) => (name === 'user-agent' ? 'Vitest' : undefined),
      } as any,
      200,
      4,
    );

    expect(listRequestLogs(1)[0]).toMatchObject({
      userId: 42,
      username: 'ampynjord',
      role: 'user',
      isExternalApi: false,
      clientType: 'web_session',
    });
  });

  it('classifies internal IHM public proxy traffic outside external API supervision', () => {
    clearRequestLogsForTests();
    recordRequestLog(
      {
        method: 'GET',
        originalUrl: '/api/v1/ships/ship-id',
        url: '/api/v1/ships/ship-id',
        headers: { 'x-starvis-forwarded-for': '198.51.100.24, 172.19.0.4' },
        internalClient: 'ihm-public-proxy',
        authMethod: 'admin_key',
        ip: '172.19.0.4',
        get: (name: string) => {
          if (name === 'user-agent') return 'Mozilla/5.0';
          if (name === 'x-starvis-forwarded-for') return '198.51.100.24, 172.19.0.4';
          return undefined;
        },
      } as any,
      200,
      9,
    );

    expect(listRequestLogs(1)[0]).toMatchObject({
      path: '/api/v1/ships/ship-id',
      isExternalApi: false,
      authMethod: 'admin_key',
      clientType: 'internal_web_proxy',
      internalClient: 'ihm-public-proxy',
      username: null,
      ip: '198.51.100.0',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('keeps generated API token calls in external API supervision', () => {
    clearRequestLogsForTests();
    recordRequestLog(
      {
        method: 'GET',
        originalUrl: '/api/v1/ships',
        url: '/api/v1/ships',
        headers: {},
        authMethod: 'api_token',
        apiToken: { id: 5, jti: 'token-jti', name: 'Partner app', userId: 42 },
        jwtPayload: { sub: 42, username: 'developer', role: 'developer', type: 'api_token', jti: 'token-jti' },
        ip: '203.0.113.10',
        get: () => 'External SDK',
      } as any,
      200,
      14,
    );

    expect(listRequestLogs(1)[0]).toMatchObject({
      isExternalApi: true,
      clientType: 'external_api',
      apiTokenId: 5,
      apiTokenName: 'Partner app',
      username: 'developer',
    });
  });

  it('does not record the request log viewer endpoint', () => {
    clearRequestLogsForTests();
    recordRequestLog(
      {
        method: 'GET',
        originalUrl: '/admin/request-logs?limit=80',
        url: '/admin/request-logs?limit=80',
        ip: '172.19.0.4',
        get: () => 'Vitest',
        jwtPayload: { sub: 2, role: 'admin' },
      } as any,
      200,
      6,
    );

    expect(listRequestLogs(10)).toEqual([]);
  });
});
