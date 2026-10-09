// Vendored from packages/pipeline/src/lib/logger.ts @ efbcbde (no modifications planned)
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void;
}

export function createLogger(options: { scope: string; minLevel?: LogLevel }): ILogger {
  const envLevel =
    typeof process !== 'undefined' ? (process.env.LOG_LEVEL as LogLevel | undefined) : undefined;
  const minLevel =
    options.minLevel ?? (envLevel && LEVEL_RANK[envLevel] !== undefined ? envLevel : 'info');

  const emit = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} [${options.scope}] ${message}`;
    const extra = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
    if (level === 'error') {
      console.error(line + extra);
    } else if (level === 'warn') {
      console.warn(line + extra);
    } else {
      console.log(line + extra);
    }
  };

  return {
    debug(message, context) {
      emit('debug', message, context);
    },
    info(message, context) {
      emit('info', message, context);
    },
    warn(message, context) {
      emit('warn', message, context);
    },
    error(message, error, context) {
      const suffix = error instanceof Error ? ` — ${error.message}` : '';
      emit('error', message + suffix, context);
    },
  };
}
