import { afterEach, describe, expect, it, vi } from 'vitest';
import logger, { configureLogger } from '../src/logger.js';

describe('extractor logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    configureLogger({ level: 'info', format: 'text', color: false, quiet: false });
  });

  it('emits JSON logs with context and redacted secrets', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    configureLogger({ level: 'info', format: 'json', color: false });

    logger.child({ module: 'test' }).info('hello', { token: 'secret', count: 2 });

    expect(spy).toHaveBeenCalledOnce();
    const payload = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(payload).toMatchObject({ level: 'info', msg: 'hello', module: 'test', token: '[redacted]', count: 2 });
  });

  it('suppresses output in silent mode', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    configureLogger({ level: 'silent', format: 'text', color: false, quiet: true });

    logger.info('hidden');

    expect(spy).not.toHaveBeenCalled();
  });
});
