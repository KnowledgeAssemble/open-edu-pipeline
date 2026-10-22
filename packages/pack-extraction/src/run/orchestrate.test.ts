import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeLlmClient, FailingLlmClient } from '../llm/fake.js';
import type { LlmClient, LlmRequest, LlmResponse } from '../llm/client.js';
import { orchestrate } from './orchestrate.js';
import { resolveTierConfig } from '../config/stage-config.js';
import type { SourceManifest } from '../ingest/types.js';

const BOOK = [
  '# Chapter 1 Whole Numbers',
  '',
  'Addition combines two numbers into a sum.',
  '',
  '# Chapter 2 Fractions',
  '',
  'A fraction represents part of a whole.',
].join('\n');

const manifest: SourceManifest = {
  id: 'demo-book',
  title: 'Demo Book',
  format: 'markdown',
  filename: 'demo.md',
  subject: 'mathematics',
};

const roots: string[] = [];

function makeWorkingDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orchestrate-'));
  roots.push(dir);
  return dir;
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fakeExtraction(prompt: string): unknown {
  if (prompt.includes('duplicateClusters')) {
    return { duplicateClusters: [], prerequisiteLinks: [] };
  }
  const title = /Chapter title: (.+)/.exec(prompt)?.[1]?.trim() ?? 'Concept';
  const start = prompt.indexOf('--- CHAPTER START ---');
  const end = prompt.indexOf('--- CHAPTER END ---');
  const body = prompt.slice(start + '--- CHAPTER START ---'.length, end).trim();
  const firstLine =
    body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '' && !line.startsWith('#')) ?? title;
  return {
    concepts: [{ term: title, summary: firstLine, excerpt: firstLine }],
    objectives: [{ statement: title, excerpt: firstLine, conceptTerms: [] }],
    examples: [],
    prerequisites: [],
  };
}

function options(
  workingDir: string,
  llmClient: LlmClient | undefined,
  llmMode: 'auto' | 'force' | 'off',
) {
  return {
    markdown: BOOK,
    manifest,
    workingDir,
    knowledgePackId: 'demo-knowledge',
    curriculumPackId: 'demo-curriculum',
    knowledgeName: 'Demo — Knowledge',
    curriculumName: 'Demo — Curriculum',
    sourceFilename: 'demo.md',
    writeSource: () => {},
    llmMode,
    llmClient,
    tierConfig: resolveTierConfig(),
    maxBudgetUsd: 5,
    dryRun: false,
    force: false,
    allowPartial: false,
    validate: true,
  } as const;
}

describe('orchestrate (two chapters, fake LLM)', () => {
  it('segments into chapters and emits validated packs', async () => {
    const workingDir = makeWorkingDir();
    const client = new FakeLlmClient((request: LlmRequest<never>) =>
      fakeExtraction(request.prompt),
    );
    const { exitCode, report } = await orchestrate(options(workingDir, client, 'force'));

    expect(report.strategy).toBe('heading');
    expect(report.chapters.map((chapter) => chapter.usedLlm)).toEqual([true, true]);
    expect(report.curriculumEmitted).toBe(true);
    expect(exitCode).toBe(0);

    expect(
      existsSync(join(workingDir, 'packs', 'knowledge', 'demo-knowledge', 'concepts.json')),
    ).toBe(true);
    expect(
      existsSync(join(workingDir, 'packs', 'curriculum', 'demo-curriculum', 'curriculum.json')),
    ).toBe(true);
    const curriculumManifest = JSON.parse(
      readFileSync(
        join(workingDir, 'packs', 'curriculum', 'demo-curriculum', 'manifest.json'),
        'utf8',
      ),
    ) as { requires: string[] };
    expect(curriculumManifest.requires).toEqual(['demo-knowledge']);
    expect(existsSync(join(workingDir, 'source-model', 'chapters.json'))).toBe(true);
  });

  it('replays from cache without further LLM calls', async () => {
    const workingDir = makeWorkingDir();
    const first = await orchestrate(
      options(
        workingDir,
        new FakeLlmClient((request: LlmRequest<never>) => fakeExtraction(request.prompt)),
        'force',
      ),
    );
    const conceptsPath = join(workingDir, 'packs', 'knowledge', 'demo-knowledge', 'concepts.json');
    const firstConcepts = readFileSync(conceptsPath, 'utf8');

    const second = await orchestrate(options(workingDir, new FailingLlmClient(), 'force'));
    expect(second.exitCode).toBe(first.exitCode);
    expect(second.report.cacheHits).toBeGreaterThan(0);
    expect(second.report.spentUsd).toBe(0);
    expect(readFileSync(conceptsPath, 'utf8')).toBe(firstConcepts);
  });

  it('stays deterministic (no LLM) in auto mode without a client', async () => {
    const workingDir = makeWorkingDir();
    const { report } = await orchestrate(options(workingDir, undefined, 'auto'));
    expect(report.chapters.every((chapter) => chapter.usedLlm === false)).toBe(true);
    expect(report.spentUsd).toBe(0);
  });

  it('plans without calling any model in dry-run mode', async () => {
    const workingDir = makeWorkingDir();
    const client = new FailingLlmClient();
    const { report } = await orchestrate({
      ...options(workingDir, client, 'force'),
      dryRun: true,
    });
    expect(report.dryRun).toBe(true);
    expect(report.chapters).toHaveLength(2);
    expect(report.totals.estimatedCostUsd).toBeGreaterThan(0);
    expect(existsSync(join(workingDir, 'review', 'run-report.json'))).toBe(true);
    // Dry-run is a pure plan: no source copies, chapter model, cache, or packs.
    expect(existsSync(join(workingDir, 'source-model', 'chapters.json'))).toBe(false);
    expect(existsSync(join(workingDir, 'source'))).toBe(false);
    expect(existsSync(join(workingDir, 'cache'))).toBe(false);
    expect(existsSync(join(workingDir, 'packs'))).toBe(false);
  });

  it('retries transient call failures with backoff', async () => {
    const workingDir = makeWorkingDir();
    const inner = new FakeLlmClient((request: LlmRequest<never>) => fakeExtraction(request.prompt));
    let attempts = 0;
    const flaky: LlmClient = {
      async generateStructured<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
        attempts += 1;
        if (attempts <= 2) throw new Error('transient failure');
        return inner.generateStructured(request);
      },
    };
    const delays: number[] = [];
    const { exitCode } = await orchestrate({
      ...options(workingDir, flaky, 'force'),
      retries: 3,
      retryDelayMs: 10,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    expect(exitCode).toBe(0);
    expect(delays).toEqual([10, 20]);
  });

  it('escalates a chapter whose fast attempt was rejected and keeps the better attempt', async () => {
    const workingDir = makeWorkingDir();
    const client = new FakeLlmClient((request: LlmRequest<never>) => {
      if (request.prompt.includes('rejected by a deterministic verifier')) {
        return {
          concepts: [
            {
              term: 'Addition',
              summary: 'combines',
              excerpt: 'Addition combines two numbers into a sum.',
            },
          ],
          objectives: [
            {
              statement: 'Addition',
              excerpt: 'Addition combines two numbers into a sum.',
              conceptTerms: [],
            },
          ],
          examples: [],
          prerequisites: [],
        };
      }
      return {
        concepts: [{ term: 'Ghost', summary: 'invented', excerpt: 'this text is absent' }],
        objectives: [
          {
            statement: 'Addition',
            excerpt: 'Addition combines two numbers into a sum.',
            conceptTerms: [],
          },
        ],
        examples: [],
        prerequisites: [],
      };
    });
    const { report } = await orchestrate(options(workingDir, client, 'force'));

    const first = report.chapters[0];
    expect(first?.escalated).toBe(true);
    expect(first?.rejections).toBe(0);
    expect(first?.concepts).toBe(1);

    const concepts = JSON.parse(
      readFileSync(
        join(workingDir, 'packs', 'knowledge', 'demo-knowledge', 'concepts.json'),
        'utf8',
      ),
    ) as Array<{ id: string }>;
    expect(concepts.map((concept) => concept.id)).toContain('addition');
  });

  it('writes the coverage of every chapter next to its health report', async () => {
    const workingDir = makeWorkingDir();
    const client = new FakeLlmClient((request: LlmRequest<never>) =>
      fakeExtraction(request.prompt),
    );
    await orchestrate(options(workingDir, client, 'force'));

    const coverage = JSON.parse(
      readFileSync(
        join(workingDir, 'review', 'chapters', 'chapter-1-whole-numbers', 'coverage.json'),
        'utf8',
      ),
    ) as { teachingSections: number; coverageRatio: number };
    expect(coverage.teachingSections).toBe(0);
    expect(coverage.coverageRatio).toBe(1);

    const health = JSON.parse(
      readFileSync(
        join(workingDir, 'review', 'chapters', 'chapter-1-whole-numbers', 'health.json'),
        'utf8',
      ),
    ) as { statedObjectives: number; coverageRatio: number };
    expect(health.statedObjectives).toBe(0);
    expect(health.coverageRatio).toBe(1);

    const bookCoverage = JSON.parse(
      readFileSync(join(workingDir, 'review', 'coverage-report.json'), 'utf8'),
    ) as { chapters: unknown[] };
    expect(bookCoverage.chapters).toHaveLength(2);
  });
});
