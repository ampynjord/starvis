import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
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
  delete process.env.STARVIS_CORNERSTONE_CANONICAL_JSON;
  delete process.env.STARVIS_COMMUNITY_CANONICAL_JSON;
  delete process.env.STARVIS_CORNERSTONE_CANONICAL_URL;
  delete process.env.STARVIS_COMMUNITY_CANONICAL_URL;
  delete process.env.STARVIS_CORNERSTONE_API_KEY;
  delete process.env.STARVIS_CORNERSTONE_AUTH_HEADER;
}

afterEach(() => {
  clearEnv();
});

describe('source-adapters (HTTP)', () => {
  it('loads Cornerstone payload from URL with auth header and maps snake_case fields', async () => {
    const expectedApiKey = 'secret-token';

    const server = await startJsonServer((req, res) => {
      if (req.headers['x-api-key'] !== expectedApiKey) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }

      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          items: [
            {
              class_name: 'TEST_Item_Class',
              display_name: 'Test Item Name',
              type: 'Clothing',
              sub_type: 'Helmet',
              source_reference: 'cornerstone-item-1',
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

    process.env.STARVIS_CORNERSTONE_CANONICAL_URL = server.url;
    process.env.STARVIS_CORNERSTONE_API_KEY = expectedApiKey;
    process.env.STARVIS_CORNERSTONE_AUTH_HEADER = 'X-API-Key';

    const data = await loadExternalCanonicalData();

    expect(data.items.size).toBe(1);
    expect(data.commodities.size).toBe(1);
    expect(data.components.size).toBe(1);
    expect(data.shops.size).toBe(1);

    const item = data.items.get('TEST_Item_Class');
    expect(item?.name).toBe('Test Item Name');
    expect(item?.subType).toBe('Helmet');
    expect(item?.sourceType).toBe('cornerstone');
    expect(item?.sourceName).toBe('cornerstone');
    expect(item?.confidenceScore).toBe(88);

    const component = data.components.get('TEST_Component_Class');
    expect(component?.grade).toBe('A');
    expect(component?.size).toBe(2);
    expect(component?.sourceType).toBe('cornerstone');

    await server.close();
  });
});
