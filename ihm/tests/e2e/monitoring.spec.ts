import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('Admin Monitoring page', () => {
  test('renders monitoring dashboard, supports tab switching, and formats actor labels correctly', async ({ context, page }) => {
    // 1. Set the initial window state for E2E Auth
    await page.addInitScript(() => {
      window.__STARVIS_E2E_USER__ = {
        id: 1,
        uuid: 'user-admin',
        username: 'admin_user',
        email: 'admin@example.test',
        role: 'admin',
        avatarUrl: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        emailVerified: true,
        twoFactorEnabled: false,
      };
    });

    // 2. Set the starvis_token cookie to bypass redirects
    await context.addCookies([
      {
        name: 'starvis_token',
        value: 'playwright-token',
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    // 3. Mock authentication API endpoint
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        json: {
          user: {
            id: 1,
            uuid: 'user-admin',
            username: 'admin_user',
            email: 'admin@example.test',
            role: 'admin',
            avatarUrl: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            emailVerified: true,
            twoFactorEnabled: false,
          },
        },
      });
    });

    // 4. Mock health and metrics API calls
    await page.route('**/health/ready', async (route) => {
      await route.fulfill({
        json: { status: 'ok', checks: { database: true, redis: true } },
      });
    });

    await page.route('**/health/cache/stats', async (route) => {
      await route.fulfill({
        json: { hits: 10, misses: 2, total: 12, hitRate: '83.3', connected: true },
      });
    });

    await page.route('**/health/metrics', async (route) => {
      await route.fulfill({
        body: `
# HELP starvis_http_requests_total Total HTTP requests
# TYPE starvis_http_requests_total counter
starvis_http_requests_total{status_code="200",route="/api/v1/ships"} 5
starvis_http_request_duration_seconds_sum{route="/api/v1/ships"} 0.25
starvis_http_request_duration_seconds_count{route="/api/v1/ships"} 5
        `,
        headers: { 'content-type': 'text/plain' },
      });
    });

    await page.route('**/api/admin/discord-bot', async (route) => {
      await route.fulfill({
        json: { success: true, data: { configured: true, clientId: '123', guildId: '456', commandCount: 5 } },
      });
    });

    // 5. Mock supervision & tokens API
    await page.route('**/api/admin/api-supervision', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            generatedAt: '2026-06-23T20:00:00.000Z',
            summary: {
              externalApiRequests15m: 5,
              externalApiRequests24h: 10,
              serverKeyRequests15m: 0,
              activeUsers15m: 1,
              generatedTokens: 1,
              activeTokens: 1,
              revokedTokens: 0,
              expiredTokens: 0,
              tokensUsed24h: 1,
              connectedProjects: 1,
            },
            activeUsers: [
              {
                userId: 7,
                username: 'gwenv',
                role: 'user',
                lastSeenAt: '2026-06-23T20:01:00.000Z',
                requestCount: 1,
                externalApiRequests: 0,
                webRequests: 1,
              },
            ],
            projects: [
              {
                tokenId: 4,
                name: 'Project Polaris',
                description: 'Sync tools',
                owner: { id: 2, username: 'developer_polar', email: 'polar@dev.test', role: 'developer' },
                status: 'active',
                connected: true,
                createdAt: '2026-06-01T10:00:00.000Z',
                expiresAt: '2027-06-01T10:00:00.000Z',
                usageCount: 100,
                recentRequests: 5,
              },
            ],
          },
        },
      });
    });

    // 6. Mock requests history logs
    await page.route('**/api/admin/request-logs?scope=external**', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: [
            {
              id: 1,
              timestamp: '2026-06-23T20:00:00.000Z',
              method: 'GET',
              path: '/api/v1/ships',
              statusCode: 200,
              durationMs: 15,
              isExternalApi: true,
              authMethod: 'api_token',
              clientType: 'external_api',
              apiTokenId: 4,
              apiTokenName: 'Project Polaris',
              username: 'developer_polar',
              role: 'developer',
            },
          ],
        },
      });
    });

    await page.route('**/api/admin/request-logs?scope=web**', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: [
            {
              id: 2,
              timestamp: '2026-06-23T20:01:00.000Z',
              method: 'POST',
              path: '/api/v1/search',
              statusCode: 200,
              durationMs: 8,
              isExternalApi: false,
              authMethod: 'session',
              clientType: 'web_session',
              username: 'gwenv',
              role: 'user',
            },
            {
              id: 3,
              timestamp: '2026-06-23T20:02:00.000Z',
              method: 'GET',
              path: '/api/v1/ships',
              statusCode: 200,
              durationMs: 20,
              isExternalApi: false,
              authMethod: 'anonymous',
              clientType: 'internal_web_proxy',
              internalClient: 'ihm-public-proxy',
            },
          ],
        },
      });
    });

    // 7. Navigate to monitoring page
    await gotoApp(page, '/admin/monitoring');

    // 8. Check default tab (Overview) renders correctly
    await expect(page.getByRole('button', { name: "Vue d'ensemble" })).toHaveClass(/text-cyan-400/);
    await expect(page.getByText('HTTP status distribution')).toBeVisible();
    await expect(page.getByText('Top routes by traffic')).toBeVisible();

    // 9. Switch to API Access tab
    await page.getByRole('button', { name: 'Accès & Jetons API' }).click();
    await expect(page.getByText('Project Polaris')).toBeVisible();
    await expect(page.getByText('developer_polar · developer')).toBeVisible();

    // 10. Switch to Performance & System tab
    await page.getByRole('button', { name: 'Performance & Système' }).click();
    await expect(page.getByText('Memory (RSS)')).toBeVisible();
    await expect(page.getByText('Cache hits')).toBeVisible();
    await expect(page.getByText('Redis link')).toBeVisible();

    // 11. Switch to API Logs tab
    await page.getByRole('button', { name: 'Logs API Externe' }).click();
    await expect(page.getByText('External API logs only')).toBeVisible();

    // Verify actor label formatting for API Externe
    // External API: should show token name with user who generated it
    await expect(page.getByText('Project Polaris (by developer_polar)')).toBeVisible();

    // 12. Switch to IHM Logs tab
    await page.getByRole('button', { name: 'Logs IHM' }).click();
    await expect(page.getByText('Starvis IHM logs only')).toBeVisible();

    // Verify actor label formatting for IHM
    // Starvis IHM: should show username & role, or anonymous. NEVER "ihm-public-proxy"!
    await expect(page.getByText('gwenv · user')).toBeVisible();
    await expect(page.getByText('anonymous', { exact: true })).toBeVisible();
    await expect(page.getByText('ihm-public-proxy')).not.toBeVisible();
  });
});
