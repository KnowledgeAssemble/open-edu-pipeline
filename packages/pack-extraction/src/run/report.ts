import type { ChapterStrategy } from '../chapters/types.js';

export interface ChapterReport {
  id: string;
  title: string;
  strategy: ChapterStrategy;
  pageStart?: number;
  pageEnd?: number;
  deterministicConcepts: number;
  deterministicObjectives: number;
  usedLlm: boolean;
  escalated: boolean;
  cacheHit: boolean;
  concepts: number;
  objectives: number;
  rejections: number;
  pendingHuman: boolean;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
}

export interface RunTotals {
  concepts: number;
  objectives: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
}

export interface RunReport {
  generatedAt: string;
  estimate: true;
  dryRun: boolean;
  mode: 'auto' | 'force' | 'off';
  provider: string;
  fastModel: string;
  escalationModel: string;
  strategy: ChapterStrategy;
  budgetUsd: number;
  spentUsd: number;
  cacheHits: number;
  escalations: number;
  pendingHuman: string[];
  chapters: ChapterReport[];
  totals: RunTotals;
  curriculumEmitted: boolean;
  exitCode: number;
}

export function emptyTotals(): RunTotals {
  return {
    concepts: 0,
    objectives: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    estimatedCostUsd: 0,
  };
}
