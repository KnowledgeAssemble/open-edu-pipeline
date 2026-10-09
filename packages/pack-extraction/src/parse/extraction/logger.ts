// Vendored from packages/pipeline/src/extraction/logger.ts @ efbcbde (import path adjusted for pack-extraction layout)
import { createLogger, type ILogger } from '../../lib/logger.js';

export interface ExtractionLogEntry {
  stage: 'extraction';
  extractor: string;
  file: string;
  durationMs: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export type ExtractionLoggerOutput = 'console' | 'json';

export class ExtractionLogger {
  private entries: ExtractionLogEntry[] = [];
  private output: ExtractionLoggerOutput;
  private verbose: boolean;
  private logger: ILogger;

  constructor(output: ExtractionLoggerOutput = 'console', verbose = false) {
    this.output = output;
    this.verbose = verbose;
    this.logger = createLogger({ scope: 'pipeline:extraction' });
  }

  info(extractor: string, file: string, durationMs: number, message: string): void {
    this.logger.info(`[extraction:${extractor}] ${file} (${durationMs}ms) — ${message}`);
    this.log('info', extractor, file, durationMs, message);
  }

  warn(extractor: string, file: string, durationMs: number, message: string): void {
    this.logger.warn(`[extraction:${extractor}] ${file} (${durationMs}ms) — ${message}`);
    this.log('warn', extractor, file, durationMs, message);
  }

  error(extractor: string, file: string, durationMs: number, message: string): void {
    this.logger.error(`[extraction:${extractor}] ${file} (${durationMs}ms) — ${message}`);
    this.log('error', extractor, file, durationMs, message);
  }

  getEntries(): ExtractionLogEntry[] {
    return [...this.entries];
  }

  private log(
    level: ExtractionLogEntry['level'],
    extractor: string,
    file: string,
    durationMs: number,
    message: string,
  ): void {
    const entry: ExtractionLogEntry = {
      stage: 'extraction',
      extractor,
      file,
      durationMs,
      level,
      message,
    };
    this.entries.push(entry);

    if (this.output === 'json' || this.verbose) {
      const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]';
      console.log(
        `${prefix} [extraction:${extractor}] ${file} (${durationMs}ms) \u2014 ${message}`,
      );
    }
  }
}
