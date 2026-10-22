import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { z } from 'zod';
import type { LlmStage, ModelTier } from '@open-edu/pipeline-llm';
import type { Concept, Curriculum, PackManifest } from '../schemas/index.js';
import { CurriculumSchema, LearningIntent } from '../schemas/index.js';
import type { GlossaryCandidate } from '../knowledge/types.js';
import {
  writeJson,
  emitKnowledgePack,
  emitCurriculumPack,
  buildPackSources,
} from '../emit/write.js';
import { validateKnowledgePack, validateCurriculumPack } from '../validate/pack.js';
import type { PackResult } from '../validate/pack.js';
import type { SourceManifest } from '../ingest/types.js';
import { parseMarkdown } from '../source-model/normalize.js';
import { extractKnowledge } from '../knowledge/extract.js';
import { segmentChapters } from '../chapters/segment.js';
import type { Chapter } from '../chapters/types.js';
import type { LlmClient } from '../llm/client.js';
import {
  EXTRACT_PROMPT_VERSION,
  EXTRACT_ESCALATION_PROMPT_VERSION,
  EXTRACT_SCHEMA_VERSION,
  MERGE_PROMPT_VERSION,
  MERGE_SCHEMA_VERSION,
  EXTRACT_STAGE,
  ESCALATION_STAGE,
  MERGE_STAGE,
  ChapterExtractionSchema,
  buildExtractPrompt,
  buildEscalationPrompt,
} from '../stages/extract.js';
import type { ChapterExtraction } from '../stages/extract.js';
import { verifyExtraction } from '../stages/verify.js';
import { shouldEscalate } from '../stages/escalate.js';
import type { VerifiedConcept, VerifiedObjective, Rejection } from '../stages/verify.js';
import {
  applyMerge,
  buildMergePrompt,
  compactSummary,
  MergeResultSchema,
} from '../stages/merge.js';
import type { MergeApplyResult } from '../stages/merge.js';
import { BudgetGuard, estimateCall } from '../stages/budget.js';
import type { CallEstimate } from '../stages/budget.js';
import { CacheStore } from '../cache/store.js';
import { cacheKey } from '../cache/key.js';
import { estimateTokens, estimateCostUsd } from '../config/stage-config.js';
import type { TierConfig } from '../config/stage-config.js';
import type { ChapterReport, RunReport } from './report.js';
import { emptyTotals } from './report.js';

class BudgetExceededError extends Error {}

export interface OrchestrateOptions {
  markdown: string;
  manifest: SourceManifest;
  workingDir: string;
  knowledgePackId: string;
  curriculumPackId: string;
  knowledgeName: string;
  curriculumName: string;
  sourceFilename: string;
  writeSource: (sourceDir: string) => void;
  llmMode: 'auto' | 'force' | 'off';
  llmClient?: LlmClient;
  tierConfig: TierConfig;
  maxBudgetUsd: number;
  dryRun: boolean;
  force: boolean;
  chapters?: string;
  tocPages?: string;
  chapterHeading?: RegExp;
  allowPartial: boolean;
  validate: boolean;
  retries?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  log?: (message: string) => void;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

export interface OrchestrateResult {
  exitCode: number;
  report: RunReport;
}

interface ChapterRun {
  chapter: Chapter;
  concepts: VerifiedConcept[];
  objectives: VerifiedObjective[];
  rejections: Rejection[];
  pendingHuman: boolean;
  report: ChapterReport;
}

interface CallContext {
  client: LlmClient;
  cache: CacheStore;
  budget: BudgetGuard;
  force: boolean;
  now: () => Date;
  retries: number;
  retryDelayMs: number;
  sleep: (ms: number) => Promise<void>;
  stats: { cacheHits: number };
  log: (message: string) => void;
}

/**
 * Bounded exponential backoff around a single provider call. `@open-edu/pipeline-llm`
 * exposes no retry (only the OpenAI SDK's default), so transient provider/network
 * failures are retried here; the SDK's own retries still apply underneath.
 */
async function withRetry<T>(
  run: () => Promise<T>,
  ctx: Pick<CallContext, 'retries' | 'retryDelayMs' | 'sleep' | 'log'>,
  stage: LlmStage,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= ctx.retries; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt >= ctx.retries) break;
      const delay = ctx.retryDelayMs * 2 ** attempt;
      const message = error instanceof Error ? error.message : String(error);
      ctx.log(`retry ${attempt + 1}/${ctx.retries} for stage "${stage}" in ${delay}ms: ${message}`);
      await ctx.sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function callStructured<T>(args: {
  ctx: CallContext;
  stage: LlmStage;
  tier: ModelTier;
  cacheId: string;
  prompt: string;
  schema: z.ZodType<T>;
  promptVersion: string;
  schemaVersion: string;
  model: string;
}): Promise<{ data: T; cacheHit: boolean; usage: CallEstimate }> {
  const key = cacheKey({
    chapterMarkdown: args.prompt,
    promptVersion: args.promptVersion,
    model: args.model,
    schemaVersion: args.schemaVersion,
  });

  if (!args.ctx.force) {
    const hit = args.ctx.cache.get<T>(args.stage, args.cacheId, key);
    if (hit) {
      args.ctx.stats.cacheHits += 1;
      return {
        data: hit.value,
        cacheHit: true,
        usage: { ...hit.meta.estimatedUsage, model: args.model },
      };
    }
  }

  const projected = estimateCall(args.model, args.prompt);
  if (args.ctx.budget.wouldExceed(projected)) {
    throw new BudgetExceededError(
      `budget guard: projected $${projected.costUsd.toFixed(4)} exceeds remaining budget`,
    );
  }

  const response = await withRetry(
    () =>
      args.ctx.client.generateStructured({
        stage: args.stage,
        tier: args.tier,
        prompt: args.prompt,
        schema: args.schema,
        temperature: 0,
      }),
    args.ctx,
    args.stage,
  );

  const outputTokens = estimateTokens(JSON.stringify(response.data));
  const usage: CallEstimate = {
    model: args.model,
    inputTokens: projected.inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(args.model, projected.inputTokens, outputTokens),
  };
  args.ctx.budget.charge(usage);
  args.ctx.cache.set(args.stage, args.cacheId, key, response.data, {
    key,
    model: args.model,
    estimatedUsage: usage,
    createdAt: args.ctx.now().toISOString(),
  });

  return { data: response.data, cacheHit: false, usage };
}

function deterministicExtraction(chapter: Chapter, manifest: SourceManifest): ChapterExtraction {
  const doc = parseMarkdown(chapter.markdown);
  doc.document.id = manifest.id;
  const knowledge = extractKnowledge(doc, manifest);
  return {
    concepts: knowledge.concepts.map((concept) => ({
      term: concept.title,
      summary: concept.summary || concept.title,
      excerpt: concept.summary || concept.title,
    })),
    objectives: knowledge.statements.map((statement) => ({
      statement: statement.statement,
      excerpt: statement.statement,
    })),
    examples: [],
    prerequisites: [],
  };
}

function commitIds(target: Set<string>, source: Set<string>): void {
  for (const id of source) target.add(id);
}

function selectChapters(
  chapters: Chapter[],
  spec: string | undefined,
  log: (message: string) => void = () => {},
): Chapter[] {
  if (!spec) return chapters;
  const selected: Chapter[] = [];
  const parts = spec
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  for (const part of parts) {
    const range = part.split('..');
    if (range.length === 2) {
      const startIndex = chapters.findIndex((chapter) => chapter.id === range[0]);
      const endIndex = chapters.findIndex((chapter) => chapter.id === range[1]);
      if (startIndex >= 0 && endIndex >= startIndex) {
        selected.push(...chapters.slice(startIndex, endIndex + 1));
      } else {
        log(`--chapters: no chapter range matched "${part}"`);
      }
      continue;
    }
    const match = chapters.find(
      (chapter) => chapter.id === part || chapter.id.startsWith(`${part}-`),
    );
    if (match) {
      selected.push(match);
    } else {
      log(`--chapters: no chapter matched "${part}"`);
    }
  }
  if (selected.length === 0) {
    log(`--chapters: no chapters matched "${spec}"; nothing to do`);
  }
  return [...new Set(selected)];
}

async function processChapter(args: {
  chapter: Chapter;
  manifest: SourceManifest;
  strategy: RunReport['strategy'];
  llmMode: OrchestrateOptions['llmMode'];
  client: LlmClient | undefined;
  ctx: CallContext;
  tierConfig: TierConfig;
  usedConceptIds: Set<string>;
}): Promise<ChapterRun> {
  const { chapter, manifest, usedConceptIds } = args;
  const detExtraction = deterministicExtraction(chapter, manifest);
  const detTrial = new Set(usedConceptIds);
  const detVerify = verifyExtraction(chapter, detExtraction, { usedConceptIds: detTrial });
  const detSufficient = detVerify.concepts.length >= 1 && detVerify.objectives.length >= 1;
  const llmAllowed = args.llmMode !== 'off' && args.client !== undefined;
  const wantLlm = llmAllowed && (!detSufficient || args.llmMode === 'force');

  const report: ChapterReport = {
    id: chapter.id,
    title: chapter.title,
    strategy: args.strategy,
    pageStart: chapter.pageStart,
    pageEnd: chapter.pageEnd,
    deterministicConcepts: detVerify.concepts.length,
    deterministicObjectives: detVerify.objectives.length,
    usedLlm: false,
    escalated: false,
    cacheHit: false,
    concepts: detVerify.concepts.length,
    objectives: detVerify.objectives.length,
    rejections: detVerify.rejections.length,
    pendingHuman: false,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    estimatedCostUsd: 0,
  };

  if (!wantLlm) {
    commitIds(usedConceptIds, detTrial);
    report.pendingHuman = !detVerify.healthy;
    return {
      chapter,
      concepts: detVerify.concepts,
      objectives: detVerify.objectives,
      rejections: detVerify.rejections,
      pendingHuman: !detVerify.healthy,
      report,
    };
  }

  const call = await callStructured({
    ctx: args.ctx,
    stage: EXTRACT_STAGE,
    tier: 'fast',
    cacheId: chapter.id,
    prompt: buildExtractPrompt(chapter),
    schema: ChapterExtractionSchema,
    promptVersion: EXTRACT_PROMPT_VERSION,
    schemaVersion: EXTRACT_SCHEMA_VERSION,
    model: args.tierConfig.fast,
  });
  report.usedLlm = true;
  report.cacheHit = call.cacheHit;
  report.estimatedInputTokens += call.usage.inputTokens;
  report.estimatedOutputTokens += call.usage.outputTokens;
  report.estimatedCostUsd += call.usage.costUsd;

  const fastTrial = new Set(usedConceptIds);
  let verify = verifyExtraction(chapter, call.data, { usedConceptIds: fastTrial });

  if (!shouldEscalate(verify)) {
    commitIds(usedConceptIds, fastTrial);
  } else {
    const failures = verify.rejections.map((rejection) => `${rejection.reason}: ${rejection.item}`);
    const escalated = await callStructured({
      ctx: args.ctx,
      stage: ESCALATION_STAGE,
      tier: 'escalation',
      cacheId: chapter.id,
      prompt: buildEscalationPrompt(chapter, failures),
      schema: ChapterExtractionSchema,
      promptVersion: EXTRACT_ESCALATION_PROMPT_VERSION,
      schemaVersion: EXTRACT_SCHEMA_VERSION,
      model: args.tierConfig.escalation,
    });
    report.escalated = true;
    report.estimatedInputTokens += escalated.usage.inputTokens;
    report.estimatedOutputTokens += escalated.usage.outputTokens;
    report.estimatedCostUsd += escalated.usage.costUsd;
    const escalationTrial = new Set(usedConceptIds);
    verify = verifyExtraction(chapter, escalated.data, { usedConceptIds: escalationTrial });
    commitIds(usedConceptIds, escalationTrial);
  }

  report.concepts = verify.concepts.length;
  report.objectives = verify.objectives.length;
  report.rejections = verify.rejections.length;
  report.pendingHuman = !verify.healthy;

  return {
    chapter,
    concepts: verify.concepts,
    objectives: verify.objectives,
    rejections: verify.rejections,
    pendingHuman: !verify.healthy,
    report,
  };
}

function writeChapterReview(workingDir: string, run: ChapterRun): void {
  const dir = join(workingDir, 'review', 'chapters', run.chapter.id);
  writeJson(join(dir, 'health.json'), {
    id: run.chapter.id,
    title: run.chapter.title,
    pageStart: run.chapter.pageStart,
    pageEnd: run.chapter.pageEnd,
    healthy: !run.pendingHuman,
    pendingHuman: run.pendingHuman,
    usedLlm: run.report.usedLlm,
    escalated: run.report.escalated,
    cacheHit: run.report.cacheHit,
    concepts: run.concepts.length,
    objectives: run.objectives.length,
    rejections: run.rejections.length,
  });
  writeJson(join(dir, 'rejections.json'), { items: run.rejections });
}

function buildConceptDocs(
  concepts: VerifiedConcept[],
  prerequisites: Array<{ fromId: string; toId: string }>,
  manifest: SourceManifest,
): Concept[] {
  const prereqById = new Map<string, string[]>();
  for (const link of prerequisites) {
    const list = prereqById.get(link.fromId) ?? [];
    list.push(link.toId);
    prereqById.set(link.fromId, list);
  }

  return concepts.map((concept) => {
    const source: NonNullable<Concept['source']> = {
      documentId: manifest.id,
      section: concept.chapterId,
      excerpt: concept.excerpt.slice(0, 2000),
    };
    if (concept.page !== undefined) source.page = concept.page;
    return {
      id: concept.id,
      title: concept.title.slice(0, 256),
      summary: concept.summary,
      domainTags: [manifest.subject && manifest.subject !== '' ? manifest.subject : 'mathematics'],
      prerequisites: prereqById.get(concept.id) ?? [],
      source,
    };
  });
}

function buildCurriculum(
  runs: ChapterRun[],
  concepts: VerifiedConcept[],
  resolution: Map<string, string>,
  excludeIds: Set<string>,
  options: OrchestrateOptions,
): Curriculum | undefined {
  const units: Curriculum['units'] = [];
  for (const run of runs) {
    if (run.objectives.length === 0) continue;
    const chapterConceptIds = concepts
      .filter((concept) => concept.chapterId === run.chapter.id && !excludeIds.has(concept.id))
      .map((concept) => concept.id);

    const objectives = run.objectives.map((objective) => {
      const resolved: Array<{ pack: string; concept: string }> = [];
      for (const id of objective.concepts) {
        const finalId = resolution.get(id);
        if (finalId !== undefined && chapterConceptIds.includes(finalId)) {
          resolved.push({ pack: options.knowledgePackId, concept: finalId });
        }
      }
      return {
        id: objective.id,
        description: objective.statement,
        bloomLevel: 'understand' as const,
        concepts: resolved,
        requiresIntents: [LearningIntent.Understand],
      };
    });

    units.push({
      id: run.chapter.id,
      title: run.chapter.title.slice(0, 256),
      concepts: chapterConceptIds.map((concept) => ({
        pack: options.knowledgePackId,
        concept,
      })),
      prerequisites: [] as string[],
      objectives,
    });
  }

  if (units.length === 0) return undefined;

  return CurriculumSchema.parse({
    id: options.curriculumPackId,
    title: options.manifest.title.slice(0, 256),
    subject:
      options.manifest.subject && options.manifest.subject !== ''
        ? options.manifest.subject
        : 'mathematics',
    level: options.manifest.level,
    units,
  });
}

export async function orchestrate(options: OrchestrateOptions): Promise<OrchestrateResult> {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => {});
  const { manifest, workingDir } = options;

  const doc = parseMarkdown(options.markdown);
  doc.document.id = manifest.id;

  const segmentation = segmentChapters(options.markdown, {
    tocPages: options.tocPages,
    chapterHeading: options.chapterHeading,
  });

  const selected = selectChapters(segmentation.chapters, options.chapters, log);

  const report: RunReport = {
    generatedAt: now().toISOString(),
    estimate: true,
    dryRun: options.dryRun,
    mode: options.llmMode,
    provider: options.tierConfig.provider,
    fastModel: options.tierConfig.fast,
    escalationModel: options.tierConfig.escalation,
    strategy: segmentation.strategy,
    budgetUsd: options.maxBudgetUsd,
    spentUsd: 0,
    cacheHits: 0,
    escalations: 0,
    pendingHuman: [],
    chapters: [],
    totals: emptyTotals(),
    curriculumEmitted: false,
    exitCode: 0,
  };

  // Dry-run is a pure plan: no source copies, cache, calls, or packs — only the
  // report under review/. Per-chapter estimate is worst-case (fast + escalation).
  if (options.dryRun) {
    for (const chapter of selected) {
      const prompt = buildExtractPrompt(chapter);
      const fastEstimate = estimateCall(options.tierConfig.fast, prompt);
      const escalationEstimate = estimateCall(options.tierConfig.escalation, prompt);
      const chapterReport: ChapterReport = {
        id: chapter.id,
        title: chapter.title,
        strategy: segmentation.strategy,
        pageStart: chapter.pageStart,
        pageEnd: chapter.pageEnd,
        deterministicConcepts: 0,
        deterministicObjectives: 0,
        usedLlm: false,
        escalated: false,
        cacheHit: false,
        concepts: 0,
        objectives: 0,
        rejections: 0,
        pendingHuman: false,
        estimatedInputTokens: fastEstimate.inputTokens + escalationEstimate.inputTokens,
        estimatedOutputTokens: fastEstimate.outputTokens + escalationEstimate.outputTokens,
        estimatedCostUsd: fastEstimate.costUsd + escalationEstimate.costUsd,
      };
      report.chapters.push(chapterReport);
      report.totals.estimatedInputTokens += chapterReport.estimatedInputTokens;
      report.totals.estimatedOutputTokens += chapterReport.estimatedOutputTokens;
      report.totals.estimatedCostUsd += chapterReport.estimatedCostUsd;
    }
    report.spentUsd = 0;
    report.exitCode = 0;
    writeJson(join(workingDir, 'review', 'run-report.json'), report);
    return { exitCode: 0, report };
  }

  mkdirSync(join(workingDir, 'source'), { recursive: true });
  options.writeSource(join(workingDir, 'source'));
  writeJson(join(workingDir, 'source-model', 'source-model.json'), doc);
  writeJson(join(workingDir, 'source-model', 'chapters.json'), {
    chapters: segmentation.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      pageStart: chapter.pageStart,
      pageEnd: chapter.pageEnd,
      sha256: chapter.sha256,
      markdown: chapter.markdown,
    })),
  });

  const cache = new CacheStore(join(workingDir, 'cache', 'llm'));
  const budget = new BudgetGuard(options.maxBudgetUsd);
  const stats = { cacheHits: 0 };

  const ctx: CallContext = {
    client: options.llmClient as LlmClient,
    cache,
    budget,
    force: options.force,
    now,
    retries: options.retries ?? DEFAULT_RETRIES,
    retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    sleep:
      options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    stats,
    log,
  };

  const usedConceptIds = new Set<string>();
  const runs: ChapterRun[] = [];
  let aborted = false;

  for (const chapter of selected) {
    try {
      const run = await processChapter({
        chapter,
        manifest,
        strategy: segmentation.strategy,
        llmMode: options.llmMode,
        client: options.llmClient,
        ctx,
        tierConfig: options.tierConfig,
        usedConceptIds,
      });
      runs.push(run);
      report.chapters.push(run.report);
      log(
        `chapter ${chapter.id}: ${run.report.usedLlm ? 'llm' : 'deterministic'} (${run.concepts.length} concepts, ${run.objectives.length} objectives)`,
      );
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        aborted = true;
        log(`aborted: ${error.message}`);
        break;
      }
      throw error;
    }
  }

  for (const run of runs) writeChapterReview(workingDir, run);
  report.spentUsd = budget.spentUsd;
  report.escalations = runs.filter((run) => run.report.escalated).length;
  report.pendingHuman = runs.filter((run) => run.pendingHuman).map((run) => run.chapter.id);

  for (const run of runs) {
    report.totals.estimatedInputTokens += run.report.estimatedInputTokens;
    report.totals.estimatedOutputTokens += run.report.estimatedOutputTokens;
    report.totals.estimatedCostUsd += run.report.estimatedCostUsd;
  }

  const chapterText = new Map<string, string>();
  for (const chapter of selected) chapterText.set(chapter.id, chapter.markdown);

  const allConcepts = runs.flatMap((run) => run.concepts);
  const allObjectives = runs.flatMap((run) => run.objectives);

  let merge: MergeApplyResult = {
    concepts: allConcepts,
    prerequisites: [],
    mergeMap: { clusters: [], finalized: [] },
    unresolvedPrereqs: [],
    resolution: new Map(allConcepts.map((concept) => [concept.id, concept.id])),
    unresolvedDuplicateIds: new Set(),
  };

  const canMerge =
    options.llmMode !== 'off' && options.llmClient !== undefined && allConcepts.length > 1;
  if (canMerge) {
    try {
      const prompt = buildMergePrompt(compactSummary(allConcepts));
      const call = await callStructured({
        ctx,
        stage: MERGE_STAGE,
        tier: 'fast',
        cacheId: 'book-merge',
        prompt,
        schema: MergeResultSchema,
        promptVersion: MERGE_PROMPT_VERSION,
        schemaVersion: MERGE_SCHEMA_VERSION,
        model: options.tierConfig.fast,
      });
      merge = applyMerge({ concepts: allConcepts, result: call.data, chapterText });
      report.totals.estimatedInputTokens += call.usage.inputTokens;
      report.totals.estimatedOutputTokens += call.usage.outputTokens;
      report.totals.estimatedCostUsd += call.usage.costUsd;
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        aborted = true;
        log(`merge skipped: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  report.spentUsd = budget.spentUsd;
  report.cacheHits = stats.cacheHits;
  report.totals.concepts = merge.concepts.length;
  report.totals.objectives = allObjectives.length;

  const conceptDocs = buildConceptDocs(merge.concepts, merge.prerequisites, manifest);

  const reviewDir = join(workingDir, 'review');
  writeJson(join(reviewDir, 'knowledge-model.json'), {
    documentId: manifest.id,
    concepts: merge.concepts,
    objectives: allObjectives,
  });
  const seenTerms = new Set<string>();
  const glossary: GlossaryCandidate[] = [];
  for (const concept of merge.concepts) {
    const term = concept.term.trim();
    const key = term.toLowerCase();
    if (term === '' || seenTerms.has(key)) continue;
    seenTerms.add(key);
    const source: GlossaryCandidate['source'] = {
      documentId: manifest.id,
      section: concept.chapterId,
    };
    if (concept.page !== undefined) source.page = concept.page;
    glossary.push({ term, definition: concept.summary, conceptId: concept.id, source });
  }
  writeJson(join(reviewDir, 'glossary-candidates.json'), glossary);
  writeJson(join(reviewDir, 'merge-map.json'), merge.mergeMap);
  writeJson(join(reviewDir, 'unresolved-prereqs.json'), { links: merge.unresolvedPrereqs });

  const curriculum = buildCurriculum(
    runs,
    merge.concepts,
    merge.resolution,
    merge.unresolvedDuplicateIds,
    options,
  );
  writeJson(join(reviewDir, 'curriculum-model.json'), curriculum ?? null);

  const knowledgeManifest: PackManifest = {
    format: 'openedu-pack',
    formatVersion: 1,
    type: 'knowledge',
    id: options.knowledgePackId,
    version: '0.1.0',
    name: options.knowledgeName,
    author: 'KnowledgeAssemble',
    language: 'en',
    requires: [],
    derivedFrom: 'document',
  };

  const sources = buildPackSources(manifest.id, manifest.title);

  const knowledgePack = emitKnowledgePack({
    outputDir: join(workingDir, 'packs'),
    manifest: knowledgeManifest,
    concepts: conceptDocs,
    sources,
  });

  let curriculumPackPaths: string[] = [];
  if (curriculum) {
    const curriculumManifest: PackManifest = {
      format: 'openedu-pack',
      formatVersion: 1,
      type: 'curriculum',
      id: options.curriculumPackId,
      version: '0.1.0',
      name: options.curriculumName,
      author: 'KnowledgeAssemble',
      language: 'en',
      requires: [options.knowledgePackId],
      derivedFrom: 'document',
    };
    const curriculumPack = emitCurriculumPack({
      outputDir: join(workingDir, 'packs'),
      manifest: curriculumManifest,
      curriculum,
      sources,
    });
    curriculumPackPaths = curriculumPack.paths;
    report.curriculumEmitted = true;
  } else {
    writeJson(join(reviewDir, 'gaps.json'), {
      status: 'no-curriculum-units',
      generatedAt: now().toISOString(),
    });
  }

  let packsValid = true;
  if (options.validate) {
    const knowledgeResult = validateKnowledgePack(dirname(knowledgePack.paths[0] ?? ''));
    let curriculumResult: PackResult = { ok: true, report: [] };
    if (curriculumPackPaths.length > 0) {
      const knowledgeConceptIds = new Set(conceptDocs.map((concept) => concept.id));
      curriculumResult = validateCurriculumPack(
        dirname(curriculumPackPaths[0] ?? ''),
        options.knowledgePackId,
        knowledgeConceptIds,
      );
    }
    packsValid = knowledgeResult.ok && curriculumResult.ok;
  }

  const anyLlmUsed = runs.some((run) => run.report.usedLlm);

  writeJson(join(reviewDir, 'fidelity-report.json'), {
    status: anyLlmUsed ? 'llm-assisted' : 'pending-llm',
  });

  const flagItems: Array<{ type: string; id: string; note: string }> = [];
  for (const run of runs) {
    for (const rejection of run.rejections) {
      flagItems.push({
        type: 'rejection',
        id: `${run.chapter.id}:${rejection.item}`,
        note: rejection.reason,
      });
    }
    if (run.pendingHuman) {
      flagItems.push({ type: 'pending-human', id: run.chapter.id, note: 'chapter unhealthy' });
    }
  }
  writeJson(join(reviewDir, 'human-review-flags.json'), {
    items: flagItems,
    generatedAt: now().toISOString(),
  });

  let exitCode = 0;
  if (aborted || !packsValid || !report.curriculumEmitted) exitCode = 1;
  if (report.pendingHuman.length > 0 && !options.allowPartial) exitCode = 1;

  report.exitCode = exitCode;
  writeJson(join(reviewDir, 'run-report.json'), report);

  return { exitCode, report };
}
