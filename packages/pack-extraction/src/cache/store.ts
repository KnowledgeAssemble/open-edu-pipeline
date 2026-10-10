import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CacheUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface CacheMeta {
  key: string;
  model: string;
  estimatedUsage: CacheUsage;
  createdAt: string;
}

export interface CacheHit<T> {
  value: T;
  meta: CacheMeta;
}

/**
 * Per-stage on-disk response cache. Files live under
 * `cache/llm/<stage>/<chapterId>.json` with a sibling `.meta.json`; unchanged
 * chapters cost nothing on re-run and `--force` busts the cache.
 */
export class CacheStore {
  constructor(private readonly root: string) {}

  private valuePath(stage: string, chapterId: string): string {
    return join(this.root, stage, `${chapterId}.json`);
  }

  private metaPath(stage: string, chapterId: string): string {
    return join(this.root, stage, `${chapterId}.meta.json`);
  }

  get<T>(stage: string, chapterId: string, key: string): CacheHit<T> | undefined {
    const metaPath = this.metaPath(stage, chapterId);
    const valuePath = this.valuePath(stage, chapterId);
    if (!existsSync(metaPath) || !existsSync(valuePath)) return undefined;
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as CacheMeta;
      if (meta.key !== key) return undefined;
      const value = JSON.parse(readFileSync(valuePath, 'utf8')) as T;
      return { value, meta };
    } catch {
      return undefined;
    }
  }

  set(stage: string, chapterId: string, key: string, value: unknown, meta: CacheMeta): void {
    const metaPath = this.metaPath(stage, chapterId);
    mkdirSync(join(this.root, stage), { recursive: true });
    writeFileSync(this.valuePath(stage, chapterId), JSON.stringify(value, null, 2) + '\n');
    writeFileSync(metaPath, JSON.stringify({ ...meta, key }, null, 2) + '\n');
  }
}
