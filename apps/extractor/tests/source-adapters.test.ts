import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { loadExternalCanonicalData } from '../src/source-adapters.js';

function startJsonServer(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  return new Promise<{ close: () => Promise<void>; url: string }>((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${address.port}/payload`,
        close: () =>
          new Promise<void>((done, reject) => {
            server.close((err) => {
              if (err) reject(err);
              else done();
            });
          }),
      });
    });
  });
}

function clearEnv() {
  delete process.env.STARVIS_COMMUNITY_CANONICAL_JSON;
  delete process.env.STARVIS_COMMUNITY_CANONICAL_URL;
}

afterEach(() => {
  clearEnv();
});

describe('source-adapters (HTTP)', () => {
  it('loads community payload from URL and maps snake_case fields', async () => {
    const server = await startJsonServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          items: [
            {
              class_name: 'TEST_Item_Class',
              display_name: 'Test Item Name',
              type: 'Clothing',
              sub_type: 'Helmet',
              source_reference: 'community-item-1',
              confidence_score: 88,
            },
          ],
          commodities: [
            {
              class_name: 'TEST_Commodity_Class',
              name: 'Test Commodity',
              type: 'Food',
              symbol: 'TC',
              confidence_score: 90,
            },
          ],
          components: [
            {
              class_name: 'TEST_Component_Class',
              name: 'Test Cooler',
              type: 'Cooler',
              grade: 'A',
              size: 2,
              confidence_score: 92,
            },
          ],
          shops: [
            {
              class_name: 'TEST_Shop_Class',
              name: 'Test Shop',
              system: 'Stanton',
              city: 'Area18',
              confidence_score: 86,
            },
          ],
        }),
      );
    });

    process.env.STARVIS_COMMUNITY_CANONICAL_URL = server.url;

    const data = await loadExternalCanonicalData();

    expect(data.items.size).toBe(1);
    expect(data.commodities.size).toBe(1);
    expect(data.components.size).toBe(1);
    expect(data.shops.size).toBe(1);

    const item = data.items.get('TEST_Item_Class');
    expect(item?.name).toBe('Test Item Name');
    expect(item?.subType).toBe('Helmet');
    expect(item?.sourceType).toBe('community_log');
    expect(item?.sourceName).toBe('community');
    expect(item?.confidenceScore).toBe(88);

    const component = data.components.get('TEST_Component_Class');
    expect(component?.grade).toBe('A');
    expect(component?.size).toBe(2);
    expect(component?.sourceType).toBe('community_log');

    await server.close();
  });
});
