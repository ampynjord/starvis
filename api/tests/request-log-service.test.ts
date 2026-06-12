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
      ip: '192.168.1.0',
      userAgent: 'Vitest',
    });
  });

  it('resolves authenticated actors from bearer tokens on public routes', async () => {
    const { AuthService } = await import('../src/services/auth-service.js');
    process.env.JWT_SECRET = 'request-log-test-secret';
    clearRequestLogsForTests();

    const token = new AuthService({} as any).generateApiToken({
      id: 42,
      uuid: 'user-uuid',
      email: 'user@example.test',
      username: 'ampynjord',
      role: 'user',
      avatarUrl: null,
      createdAt: new Date(),
      emailVerified: true,
      twoFactorEnabled: false,
    });

    recordRequestLog(
      {
        method: 'GET',
        originalUrl: '/api/v1/ships',
        url: '/api/v1/ships',
        headers: { authorization: `Bearer ${token}` },
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
