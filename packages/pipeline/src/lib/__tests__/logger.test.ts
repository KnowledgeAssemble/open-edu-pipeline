import { describe, it, expect, afterEach } from 'vitest';
import { createLogger } from '../logger.js';

describe('createLogger', () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    delete process.env.LOG_LEVEL;
  });

  it('logs info messages with scope prefix', () => {
    const logs: string[] = [];
    console.log = (msg: unknown) => logs.push(String(msg));
    createLogger({ scope: 'pipeline:cli' }).info('hello');
    expect(logs[0]).toContain('INFO');
    expect(logs[0]).toContain('[pipeline:cli]');
    expect(logs[0]).toContain('hello');
  });

  it('logs debug messages', () => {
    const logs: string[] = [];
    console.log = (msg: unknown) => logs.push(String(msg));
    createLogger({ scope: 'pipeline:extraction', minLevel: 'debug' }).debug('verbose detail');
    expect(logs[0]).toContain('DEBUG');
  });

  it('does not emit when below the configured min level', () => {
    const logs: string[] = [];
    console.log = (msg: unknown) => logs.push(String(msg));
    const logger = createLogger({ scope: 's', minLevel: 'warn' });
    logger.info('silent');
    expect(logs).toHaveLength(0);
  });

  it('writes errors to console.error', () => {
    const errors: string[] = [];
    console.error = (msg: unknown) => errors.push(String(msg));
    createLogger({ scope: 's' }).error('boom');
    expect(errors[0]).toContain('boom');
  });
});
