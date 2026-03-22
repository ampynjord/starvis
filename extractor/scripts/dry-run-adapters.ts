#!/usr/bin/env node
import { config } from 'dotenv';
import { type ExternalSourceOverride, loadExternalCanonicalData } from '../src/source-adapters.js';

config({ path: '.env.extractor' });

function parseSampleSize(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--sample' || args[i] === '-s') && args[i + 1]) {
      const value = Number(args[++i]);
      if (Number.isFinite(value) && value >= 0) return Math.floor(value);
    }
  }
  return 3;
}

function printEntitySummary(name: string, entries: Array<[string, ExternalSourceOverride]>, sampleSize: number): void {
  console.log(`\n-- ${name} --`);
  console.log(`count: ${entries.length}`);

  if (!entries.length || sampleSize === 0) return;

  const sourceTypeCounts = new Map<string, number>();
  for (const [, row] of entries) {
    const st = row.sourceType ?? 'unknown';
    sourceTypeCounts.set(st, (sourceTypeCounts.get(st) ?? 0) + 1);
  }

  const sourceTypeText = [...sourceTypeCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(' | ');

  console.log(`source types: ${sourceTypeText || 'none'}`);
  console.log(`sample (max ${sampleSize}):`);

  for (const [className, row] of entries.slice(0, sampleSize)) {
    console.log(
      `- className=${className} name=${row.name ?? ''} source=${row.sourceType ?? ''}/${row.sourceName ?? ''} confidence=${row.confidenceScore ?? ''}`,
    );
  }
}

async function main() {
  const sampleSize = parseSampleSize();

  console.log('== STARVIS Adapter Dry Run ==');
  console.log(`sample size: ${sampleSize}`);

  const data = await loadExternalCanonicalData();

  const items = [...data.items.entries()];
  const commodities = [...data.commodities.entries()];
  const components = [...data.components.entries()];
  const shops = [...data.shops.entries()];

  const total = items.length + commodities.length + components.length + shops.length;

  console.log(`total overrides: ${total}`);
  console.log(`configured sources:`);
  console.log(`- STARVIS_CORNERSTONE_CANONICAL_JSON=${process.env.STARVIS_CORNERSTONE_CANONICAL_JSON ? 'set' : 'unset'}`);
  console.log(`- STARVIS_CORNERSTONE_CANONICAL_URL=${process.env.STARVIS_CORNERSTONE_CANONICAL_URL ? 'set' : 'unset'}`);
  console.log(`- STARVIS_COMMUNITY_CANONICAL_JSON=${process.env.STARVIS_COMMUNITY_CANONICAL_JSON ? 'set' : 'unset'}`);
  console.log(`- STARVIS_COMMUNITY_CANONICAL_URL=${process.env.STARVIS_COMMUNITY_CANONICAL_URL ? 'set' : 'unset'}`);

  printEntitySummary('items', items, sampleSize);
  printEntitySummary('commodities', commodities, sampleSize);
  printEntitySummary('components', components, sampleSize);
  printEntitySummary('shops', shops, sampleSize);

  console.log('\nRESULT: OK');
}

main().catch((error) => {
  console.error(`RESULT: FAIL - ${(error as Error).message}`);
  process.exit(1);
});
