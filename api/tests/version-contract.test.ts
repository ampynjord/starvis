import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { responseShapeMiddleware } from '../src/middleware/response-shape.js';
import { createRoutes } from '../src/routes/index.js';
import { mountUniverseNexusRoutes } from '../src/routes/universe-nexus.js';
import { CONTRACT_PROBES, collectSnapshots, loadHerdrFixture, mountContractApp, normalizeBody } from './version-contract-harness.js';

const fixture = loadHerdrFixture();

describe('contrat v1/v2 inchangé face à wip/herdr-agents', () => {
  it('la référence n’a pas été produite par cette branche', () => {
    expect(fixture.baseline.ref).toBe('wip/herdr-agents');
    expect(fixture.baseline.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.baseline.unversionedUniverseRoutes).toBe(0);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    expect(fixture.baseline.commit).not.toBe(head);
    expect(fixture.probes).toHaveLength(CONTRACT_PROBES.length);
  });

  it('statut, enveloppe et champs des sondes v1 et v2', async () => {
    const app = mountContractApp(createRoutes, responseShapeMiddleware);
    const actual = await collectSnapshots(app);
    const drifts = [];

    for (const expected of fixture.probes) {
      const got = actual.find((probe) => probe.id === expected.id);
      if (!got) {
        drifts.push(`${expected.id}: sonde absente`);
        continue;
      }
      if (got.status !== expected.status) drifts.push(`${expected.id}: statut ${got.status} ≠ ${expected.status}`);
      if (JSON.stringify(got.envelope) !== JSON.stringify(expected.envelope)) {
        drifts.push(`${expected.id}: enveloppe ${got.envelope.join(',')} ≠ ${expected.envelope.join(',')}`);
      }
      if (JSON.stringify(got.fields) !== JSON.stringify(expected.fields)) {
        drifts.push(`${expected.id}: champs\n  obtenu ${got.fields.join(' ')}\n  herdr  ${expected.fields.join(' ')}`);
      }
      if (JSON.stringify(got.body) !== JSON.stringify(expected.body)) {
        drifts.push(`${expected.id}: corps\n  obtenu ${JSON.stringify(got.body)}\n  herdr  ${JSON.stringify(expected.body)}`);
      }
    }

    expect(drifts).toEqual([]);
  });
});

describe('alias sans version', () => {
  it('chaque chemin /api/universe reprend le même gestionnaire que /api/v2', () => {
    const router = { stack: [] as Array<{ route?: { path: string | string[]; stack: Array<{ handle: unknown }> } }> };
    const recording = {
      get(path: string | string[], ...handlers: unknown[]) {
        router.stack.push({ route: { path, stack: handlers.map((handle) => ({ handle })) } });
      },
    };
    mountUniverseNexusRoutes(recording as unknown as Router, { prisma: {} as never });

    const pairs = [
      ['/api/universe/omni-search', '/api/v2/universe/omni-search'],
      ['/api/universe/taxonomy', '/api/v2/universe/taxonomy'],
      ['/api/universe/explore', '/api/v2/universe/explore'],
      ['/api/universe/entities/:category/:id', '/api/v2/universe/entities/:category/:id'],
    ];

    for (const [canonical, alias] of pairs) {
      const layer = router.stack.find((entry) => {
        const path = entry.route?.path;
        return Array.isArray(path) && path[0] === canonical && path[1] === alias;
      });
      expect(layer, canonical).toBeTruthy();
      expect(layer?.route?.stack).toHaveLength(1);
    }
    expect(router.stack).toHaveLength(4);
  });

  it('le chemin sans version répond comme /api/v2', async () => {
    const app = mountContractApp(createRoutes, responseShapeMiddleware);
    for (const probe of CONTRACT_PROBES.filter((item) => item.version === 'v2')) {
      const alias = probe.path.replace('/api/v2/', '/api/');
      const versioned = await request(app).get(probe.path);
      const unversioned = await request(app).get(alias);
      expect(unversioned.status, alias).toBe(versioned.status);
      expect(normalizeBody(unversioned.body), alias).toEqual(normalizeBody(versioned.body));
    }
  });
});

describe('OpenAPI compatibilité', () => {
  const spec = JSON.parse(readFileSync(join(process.cwd(), 'openapi.json'), 'utf8')) as {
    info?: { description?: string };
    paths?: Record<string, Record<string, { deprecated?: boolean; operationId?: string; responses?: unknown; 'x-starvis-layer'?: string }>>;
  };

  it('marque /api/v1 et /api/v2 en compatibilité et documente /api/universe', () => {
    const paths = spec.paths ?? {};
    const versioned = Object.entries(paths).filter(([path]) => path.startsWith('/api/v1/') || path.startsWith('/api/v2/'));
    expect(versioned.length).toBeGreaterThan(10);
    for (const [path, methods] of versioned) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!operation?.responses) continue;
        expect(operation.deprecated, `${method} ${path}`).toBe(true);
        expect(operation['x-starvis-layer']).toBe('compatibility');
      }
    }

    for (const suffix of ['omni-search', 'taxonomy', 'explore', 'entities/{category}/{id}']) {
      const canonical = paths[`/api/universe/${suffix}`]?.get;
      const alias = paths[`/api/v2/universe/${suffix}`]?.get;
      expect(canonical, suffix).toBeTruthy();
      expect(canonical?.deprecated).not.toBe(true);
      expect(alias?.responses).toEqual(canonical?.responses);
      expect(canonical?.operationId).not.toBe(alias?.operationId);
    }

    expect(spec.info?.description).toMatch(/compatib/i);
  });
});
