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
      role: 'admin',
      ip: '192.168.1.0',
      userAgent: 'Vitest',
    });
  });
});
