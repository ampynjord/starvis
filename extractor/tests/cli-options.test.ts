import { describe, expect, it } from 'vitest';
import { parseModules } from '../src/cli/modules.js';
import { getEnvFileFromArgv, parseCliOptions } from '../src/cli/options.js';

describe('extractor CLI options', () => {
  it('loads the production env file only when --prod-db is present', () => {
    expect(getEnvFileFromArgv(['--env', 'live'])).toBe('.env.extractor.dev');
    expect(getEnvFileFromArgv(['--prod-db'])).toBe('.env.extractor.prod');
  });

  it('parses module aliases and comma-separated modules', () => {
    expect([...parseModules('ships,orgs,comm-links')]).toEqual(['ships', 'organizations', 'comm-links']);
    expect([...parseModules('shop-inventory')]).toEqual(['shops']);
  });

  it('rejects unknown modules', () => {
    expect(() => parseModules('ships,nope')).toThrow(/Unknown module/);
  });

  it('maps verbose and quiet to explicit log levels', () => {
    expect(parseCliOptions(['--verbose']).logLevel).toBe('debug');
    expect(parseCliOptions(['--quiet']).logLevel).toBe('silent');
  });

  it('validates integer options', () => {
    expect(parseCliOptions(['--concurrency', '4']).ctmConcurrency).toBe(4);
    expect(parseCliOptions(['--ctm-concurrency', '3']).ctmConcurrency).toBe(3);
    expect(() => parseCliOptions(['--concurrency', '0'])).toThrow(/positive integer/);
  });
});
