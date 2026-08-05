import { createHash } from 'node:crypto';
import type { LlmRouter } from '@open-edu/pipeline-llm';
import { legacyAdapter, type LlmStage } from '@open-edu/pipeline-llm';
import { buildSourceInventory } from '../source/inventory.js';
import type { PageContent } from '../source/inventory.js';
import type { SourceInventory } from '../source/types.js';
import { generateConceptMap } from '../concepts/index.js';
import type { Concept } from '../concepts/types.js';
import { generateLessonBlueprints } from '../blueprint/index.js';
import type { LessonBlueprint } from '../blueprint/types.js';
import { generateActivitiesFromBlueprint } from '../generate-activities/index.js';
import type { CurriculumProfile } from '../profile/types.js';
import { validateWidgetConfig, type WidgetValidationResult } from '../validation/widgets.js';
import { buildCoverageLedger } from '../coverage/index.js';
import { generateQualityReport, type QualityReport } from '../validation/report.js';
import { getValidatorsForProfile, type ValidationIssue } from '../validation/registry.js';
import '../validation/math.js';
import { writeCourseSpecOutput, writeCourseSpecJSONOutput } from '../output/index.js';
import { generateAssetFiles } from '../assets/manifest.js';
import type { AssetManifest } from '../assets/types.js';
import { AssetPlanResponseSchema } from '../assets/types.js';
import { buildAssetPlanPrompt } from '../assets/asset-plan-prompt.js';
import type { GeneratedActivity, ConceptActivityPair } from '../types.js';
import { resolveScope } from '../scope/resolve.js';
import { scopeToString, type DocumentScope } from '../scope/types.js';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface PipelineResult {
  report: QualityReport;
  outputPaths: string[];
  coverageLedger: any;
  assetManifest: AssetManifest | null;
}

export async function runPipelineV2(
  router: LlmRouter,
  options: {
    pdfPath: string;
    levelCode: string;
    subject: string;
    force: boolean;
    scope?: DocumentScope;
    profile: CurriculumProfile;
    outputDir: string;
    verbose: boolean;
    dryRun: boolean;
    resume: boolean;
    maxRetries: number;
    format: 'md' | 'json' | 'both';
    widgetCategories: string[];
    language?: string;
    locale?: string;
  },
): Promise<PipelineResult> {
  const startTime = Date.now();
  const outputPaths: string[] = [];
  const reviewItems: string[] = [];
  const retries = 0;
  const profile = options.profile;

  if (!existsSync(options.outputDir)) mkdirSync(options.outputDir, { recursive: true });

  function computeConfigHash(): string {
    const hash = createHash('sha256');
    try {
      const pdfContent = readFileSync(options.pdfPath);
      const pdfHash = createHash('sha256').update(pdfContent).digest('hex');
      hash.update(pdfHash);
    } catch {
      hash.update(options.pdfPath);
    }
    const cfg = JSON.stringify({
      pdfPath: options.pdfPath,
      profileId: profile.id,
      subject: options.subject,
      levelCode: options.levelCode,
      language: options.language || 'en',
      locale: options.locale || 'en-IN',
      scope: options.scope ? scopeToString(options.scope) : 'all',
      promptVersion: '2.0',
      stages: [
        'source_inventory',
        'concept_map',
        'concept_enrichment',
        'lesson_blueprint',
        'asset_plan',
        'activity_generation',
        'review',
      ].map((s) => ({ stage: s, ...router.getStageConfig(s as LlmStage) })),
    });
    hash.update(cfg);
    return hash.digest('hex').slice(0, 16);
  }

  const configHash = computeConfigHash();
  const hashPath = join(options.outputDir, '.pipeline-hash');
  const previousHash =
    options.resume && existsSync(hashPath) ? readFileSync(hashPath, 'utf-8').trim() : '';

  function canResume(filename: string): boolean {
    if (!options.resume) return false;
    if (previousHash && previousHash !== configHash) return false;
    const manifestPath = join(options.outputDir, 'pipeline-manifest.json');
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const currentScope = options.scope ? scopeToString(options.scope) : 'all';
        if (manifest.scope !== currentScope) return false;
        if (manifest.profileId !== profile.id) return false;
      } catch {
        return false;
      }
    }
    return existsSync(join(options.outputDir, filename));
  }

  if (options.force) {
    if (options.verbose) console.log('--force set: regenerating all artifacts');
  } else if (options.resume && previousHash !== configHash) {
    if (options.verbose) console.log('Config changed since last run. Regenerating all artifacts.');
  }

  const shouldRun = !options.dryRun;
  function maybeWrite(path: string, content: string, force?: boolean): void {
    if (shouldRun || force) {
      writeFileSync(path, content, 'utf-8');
      outputPaths.push(path);
    }
  }
  if (options.dryRun && options.verbose)
    console.log('--dry-run: skipping LLM calls and file writes');

  // Stage 1: Extract (pluggable extraction framework)
  if (options.verbose) console.log('[1/8] Extracting content...');
  let pages: PageContent[] = [];
  let pdfMeta = { metadata: { title: options.subject } };

  if (!options.dryRun) {
    const { runExtraction, toPageContent } = await import('../extraction/index.js');
    const extractionResult = await runExtraction({ filePath: options.pdfPath });
    pages = toPageContent(extractionResult);
    const firstH1 = extractionResult.contentMd.match(/^#\s+(.+)$/m);
    pdfMeta = {
      metadata: { title: firstH1?.[1]?.trim() || options.subject },
    };
  }

  // Stage 2: Build source inventory
  const invPath = join(options.outputDir, 'source-inventory.json');
  let inventory: SourceInventory;
  if (canResume('source-inventory.json')) {
    inventory = JSON.parse(readFileSync(invPath, 'utf-8'));
    if (options.verbose) console.log('[2/8] Resumed source inventory from cache');
  } else {
    if (options.verbose) console.log('[2/8] Building source inventory...');
    inventory = !options.dryRun
      ? await buildSourceInventory(router, pages, pdfMeta.metadata.title, profile.sourceTaxonomy)
      : { documentId: 'dry-run', title: 'Dry Run', totalPages: 0, units: [], warnings: [] };
    maybeWrite(invPath, JSON.stringify(inventory, null, 2));
  }

  // Apply scope filter
  if (options.scope) {
    const resolvedScope = resolveScope(options.scope, inventory);
    inventory.units = resolvedScope.filteredUnits;
    inventory.warnings.push(...resolvedScope.warnings);
    if (options.verbose) {
      console.log(`Scope filter: keeping ${inventory.units.length} units`);
      for (const w of resolvedScope.warnings) console.log(`  Warning: ${w}`);
    }
  }

  // Stage 3: Generate concept map
  const cmPath = join(options.outputDir, 'concept-map.json');
  let concepts: Concept[] = [];
  let conceptWarnings: string[] = [];
  if (canResume('concept-map.json')) {
    const cm = JSON.parse(readFileSync(cmPath, 'utf-8'));
    concepts = cm.concepts;
    conceptWarnings = cm.warnings || [];
    if (options.verbose) console.log('[3/8] Resumed concept map from cache');
  } else {
    if (options.verbose) console.log('[3/8] Generating concept map...');
    if (!options.dryRun) {
      const result = await generateConceptMap(
        router,
        inventory.units,
        `${options.subject} ${options.levelCode}`,
        profile,
      );
      concepts = result.concepts;
      conceptWarnings = result.warnings;
      reviewItems.push(...conceptWarnings);
    }
    maybeWrite(cmPath, JSON.stringify({ concepts, warnings: conceptWarnings }, null, 2));
  }

  // Stage 4: Generate lesson blueprints
  const bpPath = join(options.outputDir, 'lesson-blueprints.json');
  let blueprints: LessonBlueprint[] = [];
  let bpWarnings: string[] = [];
  if (canResume('lesson-blueprints.json')) {
    blueprints = JSON.parse(readFileSync(bpPath, 'utf-8'));
    if (options.verbose) console.log('[4/8] Resumed lesson blueprints from cache');
  } else {
    if (options.verbose) console.log('[4/8] Generating lesson blueprints...');
    if (!options.dryRun) {
      const result = await generateLessonBlueprints(router, concepts, inventory.units, profile);
      blueprints = result.blueprints;
      bpWarnings = result.warnings;
      reviewItems.push(...bpWarnings);
    }
    maybeWrite(bpPath, JSON.stringify(blueprints, null, 2));
  }

  // Stage 5: Generate activities from blueprints using real concepts
  const conceptActivityPairs: ConceptActivityPair[] = [];
  const conceptActivityMap = new Map<string, GeneratedActivity[]>();
  if (canResume('course-spec.json')) {
    if (options.verbose) console.log('[5/8] Activities already generated (resuming)');
  } else {
    if (options.verbose) console.log('[5/8] Generating activities from blueprints...');
    if (!options.dryRun) {
      const provider = legacyAdapter(router, 'activity_generation');
      for (const bp of blueprints) {
        const concept = concepts.find((c) => c.conceptId === bp.conceptId);
        if (!concept) {
          reviewItems.push(`No concept found for blueprint: ${bp.conceptId}`);
          continue;
        }
        const result = await generateActivitiesFromBlueprint(provider, {
          concept,
          blueprint: bp,
          profile,
          sourceUnits: inventory.units,
        });
        const pair: ConceptActivityPair = {
          concept: {
            conceptId: concept.conceptId,
            chapterCode: bp.lessonArc[0]?.step || 'hook',
            chapterName: concept.label,
            learningObjective: concept.learningObjective,
            coreIdea: concept.coreIdea,
            examples: [],
            misconceptions: concept.misconceptionTargets ?? [],
            supports: { visual: concept.representations.includes('visual') },
            masteryCriteria: concept.masteryThreshold,
            difficulty: concept.difficulty as 'beginner' | 'intermediate' | 'advanced',
            estimatedDuration: concept.estimatedMinutes ?? 30,
            dependencies: concept.prerequisites ?? [],
          },
          activities: result.activities,
        };
        conceptActivityPairs.push(pair);
        conceptActivityMap.set(bp.conceptId, result.activities);
        reviewItems.push(...result.errors);
      }
    }
  }

  // Stage 6: Generate assets from blueprints via asset_plan
  let assetManifest: AssetManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    assets: [],
  };
  if (canResume('asset-manifest.json')) {
    const am = JSON.parse(readFileSync(join(options.outputDir, 'asset-manifest.json'), 'utf-8'));
    assetManifest = am;
    if (options.verbose) console.log('[6/8] Resumed asset manifest from cache');
  } else {
    if (options.verbose) console.log('[6/8] Generating assets from blueprints...');
    if (!options.dryRun && blueprints.length > 0) {
      try {
        const prompt = buildAssetPlanPrompt(blueprints, profile);
        const plan = await router.generateStructuredRaw(
          'asset_plan',
          prompt,
          AssetPlanResponseSchema,
          { temperature: 0.2 },
        );
        assetManifest = {
          version: 1,
          generatedAt: new Date().toISOString(),
          assets: plan.assets,
        };
      } catch (err) {
        reviewItems.push(
          'Asset plan generation failed: ' + (err instanceof Error ? err.message : String(err)),
        );
      }
    }
    maybeWrite(
      join(options.outputDir, 'asset-manifest.json'),
      JSON.stringify(assetManifest, null, 2),
    );
  }

  if (!options.dryRun) {
    const { written: _written } = generateAssetFiles(assetManifest, options.outputDir);
  }
  const assetsPath = join(options.outputDir, 'assets', 'manifest.json');
  outputPaths.push(assetsPath);

  // Stage 7: Validate via validator registry
  if (options.verbose) console.log('[7/8] Running validation...');
  const allActivities = conceptActivityPairs.flatMap((p) => p.activities);

  const allValidationIssues: ValidationIssue[] = [];
  const validators = getValidatorsForProfile(profile);
  for (const validator of validators) {
    const conceptIssues = validator.validateConcepts({
      concepts,
      blueprints,
      activities: allActivities,
      assets: assetManifest.assets,
      sourceUnits: inventory.units,
      profile,
    });
    const activityIssues = validator.validateActivities({
      concepts,
      blueprints,
      activities: allActivities,
      assets: assetManifest.assets,
      sourceUnits: inventory.units,
      profile,
    });
    allValidationIssues.push(...conceptIssues, ...activityIssues);
  }

  const widgetResults: WidgetValidationResult[] = [];
  for (const activity of allActivities) {
    if (activity.courseSpecType === 'widget' && activity.widgetId && activity.widgetConfig) {
      widgetResults.push(validateWidgetConfig(activity.widgetId, activity.widgetConfig));
    }
  }

  const activityIdMap = new Map<string, string[]>();
  for (const [key, acts] of conceptActivityMap) {
    activityIdMap.set(
      key,
      acts.map((a) => `${a.step}-${a.order}`),
    );
  }
  const coverageLedger = buildCoverageLedger(
    inventory.units,
    concepts,
    blueprints,
    assetManifest.assets,
    activityIdMap,
  );

  const clPath = join(options.outputDir, 'coverage-ledger.json');
  maybeWrite(clPath, JSON.stringify(coverageLedger, null, 2));

  // Stage 8: Write course-spec artifacts + quality report
  if (options.verbose) console.log('[8/8] Generating outputs and quality report...');
  if (!options.dryRun) {
    const filenamePrefix = `${options.levelCode}-${options.subject}`.toLowerCase();
    if (options.format === 'md' || options.format === 'both') {
      writeCourseSpecOutput(options.outputDir, filenamePrefix, conceptActivityPairs, options.force);
      outputPaths.push(join(options.outputDir, `${filenamePrefix}-course-spec.md`));
    }
    if (options.format === 'json' || options.format === 'both') {
      writeCourseSpecJSONOutput(
        options.outputDir,
        filenamePrefix,
        conceptActivityPairs,
        options.force,
      );
      outputPaths.push(join(options.outputDir, `${filenamePrefix}-course-spec.json`));
    }
  }

  // Write pipeline manifest
  const pipelineManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    configHash,
    pdfPath: options.pdfPath,
    profileId: profile.id,
    subject: options.subject,
    levelCode: options.levelCode,
    scope: options.scope ? scopeToString(options.scope) : 'all',
  };
  maybeWrite(
    join(options.outputDir, 'pipeline-manifest.json'),
    JSON.stringify(pipelineManifest, null, 2),
    true,
  );

  maybeWrite(hashPath, configHash, true);

  const durationMs = Date.now() - startTime;
  const stageUsage: Record<string, { provider: string; model: string }> = {};
  for (const stage of [
    'source_inventory',
    'concept_map',
    'concept_enrichment',
    'lesson_blueprint',
    'asset_plan',
    'activity_generation',
    'review',
  ] as const) {
    const cfg = router.getStageConfig(stage as LlmStage);
    stageUsage[stage] = { provider: cfg.provider, model: cfg.model };
  }

  const report = generateQualityReport({
    stageUsage,
    retries,
    durationMs,
    coverage: coverageLedger.summary,
    validationIssues: allValidationIssues,
    widgetResults,
    reviewItems,
    assetCount: assetManifest.assets.length,
    conceptCount: concepts.length,
    hasCycles: conceptWarnings.some((w) => w.includes('cycle')),
  });

  const qrPath = join(options.outputDir, 'quality-report.json');
  maybeWrite(qrPath, JSON.stringify(report, null, 2), true);

  return { report, outputPaths, coverageLedger, assetManifest };
}
