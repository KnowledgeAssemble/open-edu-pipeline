import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SourceManifest } from '../ingest/types.js';
import { deriveManifest } from '../ingest/manifest.js';
import { parseMarkdown } from '../source-model/normalize.js';
import { segmentMarkdown } from '../source-model/segment.js';
import { parseToMarkdown } from '../parse/index.js';
import { extractKnowledge } from '../knowledge/extract.js';
import { extractCurriculum, toCurriculum } from '../curriculum/extract.js';
import {
  writeJson,
  emitKnowledgePack,
  emitCurriculumPack,
  buildPackSources,
} from '../emit/write.js';
import { validateKnowledgePack, validateCurriculumPack } from '../validate/pack.js';
import { canMergeEnrichmentIntoPack, runEnrichment } from '../enrich/index.js';
import { orchestrate } from '../run/orchestrate.js';
import { resolveTierConfig } from '../config/stage-config.js';
import type { TierConfig } from '../config/stage-config.js';
import type { LlmClient } from '../llm/client.js';
import type { Concept, PackManifest } from '../schemas/index.js';
import type { ProofreadResult } from '../proofread/types.js';
import {
  buildProofreadClients,
  consumeProofreadFlag,
  defaultProofreadCliConfig,
  resolveProofreadConfig,
} from '../proofread/cli.js';
import type { ProofreadCliConfig } from '../proofread/cli.js';
import { runProofread } from '../proofread/orchestrate.js';

type LlmMode = 'auto' | 'force' | 'off';

interface CliOptions {
  source: string;
  manifest: string;
  output: string;
  curriculumPackId: string;
  knowledgePackId: string;
  parser: 'liteparse' | 'auto';
  lessonHeading?: RegExp;
  enrich: boolean;
  llmProvider?: string;
  llmModel?: string;
  validate: boolean;
  help: boolean;
  llmMode: LlmMode;
  provider?: string;
  fastModel?: string;
  escalationModel?: string;
  maxBudgetUsd: number;
  dryRun: boolean;
  force: boolean;
  chapters?: string;
  tocPages?: string;
  chapterHeading?: RegExp;
  allowPartial: boolean;
  legacy: boolean;
  proofread: ProofreadCliConfig;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    source: '',
    manifest: '',
    output: './output',
    curriculumPackId: 'nios-math-slice',
    knowledgePackId: 'nios-math-a-knowledge',
    parser: 'liteparse',
    enrich: false,
    validate: false,
    help: false,
    llmMode: 'auto',
    maxBudgetUsd: 2.0,
    dryRun: false,
    force: false,
    allowPartial: false,
    legacy: false,
    proofread: defaultProofreadCliConfig(),
  };
  const errors: string[] = [];

  const requireValue = (name: string, value: string | undefined): string => {
    if (value === undefined) errors.push(`${name} requires a value`);
    return value ?? '';
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    try {
      const consumed = consumeProofreadFlag(argv, index, options.proofread);
      if (consumed !== undefined) {
        index = consumed;
        continue;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    switch (arg) {
      case '--source':
        options.source = requireValue('--source', argv[index + 1]);
        index += 1;
        break;
      case '--manifest':
        options.manifest = requireValue('--manifest', argv[index + 1]);
        index += 1;
        break;
      case '--output':
        options.output = requireValue('--output', argv[index + 1]) || options.output;
        index += 1;
        break;
      case '--curriculum-pack-id':
        options.curriculumPackId =
          requireValue('--curriculum-pack-id', argv[index + 1]) || options.curriculumPackId;
        index += 1;
        break;
      case '--knowledge-pack-id':
        options.knowledgePackId =
          requireValue('--knowledge-pack-id', argv[index + 1]) || options.knowledgePackId;
        index += 1;
        break;
      case '--parser': {
        const value = requireValue('--parser', argv[index + 1]) || options.parser;
        if (value !== 'liteparse' && value !== 'auto') {
          errors.push(`--parser must be "liteparse" or "auto" (got "${value}")`);
        } else {
          options.parser = value;
        }
        index += 1;
        break;
      }
      case '--lesson-heading': {
        const value = requireValue('--lesson-heading', argv[index + 1]);
        if (value) {
          try {
            options.lessonHeading = new RegExp(value);
          } catch {
            errors.push(`--lesson-heading is not a valid regular expression: ${value}`);
          }
        }
        index += 1;
        break;
      }
      case '--enrich':
        options.enrich = true;
        break;
      case '--llm-provider':
        options.llmProvider = requireValue('--llm-provider', argv[index + 1]) || undefined;
        index += 1;
        break;
      case '--llm-model':
        options.llmModel = requireValue('--llm-model', argv[index + 1]) || undefined;
        index += 1;
        break;
      case '--llm':
        options.llmMode = 'force';
        break;
      case '--no-llm':
        options.llmMode = 'off';
        break;
      case '--provider':
        options.provider = requireValue('--provider', argv[index + 1]) || undefined;
        index += 1;
        break;
      case '--fast-model':
        options.fastModel = requireValue('--fast-model', argv[index + 1]) || undefined;
        index += 1;
        break;
      case '--escalation-model':
        options.escalationModel = requireValue('--escalation-model', argv[index + 1]) || undefined;
        index += 1;
        break;
      case '--max-budget-usd': {
        const value = Number.parseFloat(requireValue('--max-budget-usd', argv[index + 1]));
        if (!Number.isFinite(value) || value < 0) {
          errors.push('--max-budget-usd must be a non-negative number');
        } else {
          options.maxBudgetUsd = value;
        }
        index += 1;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--chapters':
        options.chapters = requireValue('--chapters', argv[index + 1]) || undefined;
        index += 1;
        break;
      case '--toc-pages':
        options.tocPages = requireValue('--toc-pages', argv[index + 1]) || undefined;
        index += 1;
        break;
      case '--chapter-heading': {
        const value = requireValue('--chapter-heading', argv[index + 1]);
        if (value) {
          try {
            options.chapterHeading = new RegExp(value);
          } catch {
            errors.push(`--chapter-heading is not a valid regular expression: ${value}`);
          }
        }
        index += 1;
        break;
      }
      case '--allow-partial':
        options.allowPartial = true;
        break;
      case '--legacy':
        options.legacy = true;
        break;
      case '--validate':
        options.validate = true;
        break;
      case '--help':
        options.help = true;
        break;
      default:
        errors.push(`unknown option: ${arg}`);
    }
  }

  if (errors.length > 0 && !options.help) throw new Error(errors.join('\n'));

  return options;
}

function printUsage(): void {
  console.log(
    [
      'Usage: pack-extract --source <file> [--manifest <manifest-file>] [options]',
      '',
      'Options:',
      '  --source <file>              Markdown/plain text or PDF/DOCX/PPTX (required)',
      '  --manifest <file>            Source manifest JSON (derived when omitted)',
      '  --output <dir>               Output directory (default: ./output)',
      '  --parser <liteparse|auto>    Parser for non-markdown sources (default: liteparse)',
      '  --lesson-heading <regex>     H1 heading pattern used to split lessons',
      '  --curriculum-pack-id <id>    Curriculum pack id (default: nios-math-slice)',
      '  --knowledge-pack-id <id>     Knowledge pack id (default: nios-math-a-knowledge)',
      '  --enrich                     Run optional LLM enrichment into review/ only',
      '  --llm-provider <name>        Enrichment provider (openai|openrouter)',
      '  --llm-model <model>          Enrichment model',
      '  --llm / --no-llm             Force LLM for all chapters / forbid LLM (default: auto)',
      '  --provider <name>            Chapter-pipeline provider (openai|openrouter)',
      '  --fast-model <model>         Fast tier model (honors LLM_FAST_MODEL)',
      '  --escalation-model <model>   Escalation tier model (honors LLM_ESCALATION_MODEL)',
      '  --max-budget-usd <n>         Estimated spend cap (default: 2.0)',
      '  --dry-run                    Chapter plan + cost estimate, no calls',
      '  --force                      Bust the response cache',
      '  --chapters <slugs|ranges>    Subset re-run (e.g. unit-3 or unit-3..unit-5)',
      '  --toc-pages <range>          TOC page range hint (e.g. 12-14)',
      '  --chapter-heading <regex>    Explicit chapter heading fallback',
      '  --allow-partial              Treat pending-human chapters as warnings',
      '  --proofread                   Run the proofreading pre-stage',
      '  --proofread-mode <report|apply>  Report-only or apply verified corrections',
      '  --proofread-pdf <file>       Original PDF for a Markdown source',
      '  --proofread-reference <auto|vision|text>  Reference routing',
      '  --proofread-model <model>    Vision review model',
      '  --proofread-provider <name>  Proofreading provider',
      '  --proofread-verifier-model <model>  Independent verifier model',
      '  --proofread-verifier-provider <name>  Independent verifier provider',
      '  --proofread-budget-usd <n>   Proofreading sub-cap (default: 1.0)',
      '  --proofread-pages <range>    Subset re-run (e.g. 12-20)',
      '  --proofread-window <n>       Text pages per review call (default: 2)',
      '  --proofread-page-markers     Insert pdf-page markers at safe boundaries',
      '  --proofread-verify <changed|full>  Verification scope',
      '  --proofread-strict           Exit 1 on NEEDS_REVIEW or PARTIAL',
      '  --validate                   Validate emitted packs',
      '  --help                       Show this help',
    ].join('\n'),
  );
}

function toConcept(candidate: {
  id: string;
  title: string;
  summary: string;
  domainTags: string[];
  source: { documentId: string; section: string; page?: number };
  examples: string[];
  misconceptions: string[];
  prerequisites: string[];
}): Concept {
  return {
    id: candidate.id,
    title: candidate.title,
    summary: candidate.summary,
    domainTags: candidate.domainTags,
    examples: candidate.examples,
    misconceptions: candidate.misconceptions,
    prerequisites: candidate.prerequisites,
    source: candidate.source,
  };
}

function isPlainTextSource(filePath: string): boolean {
  return /\.(md|markdown|txt)$/i.test(filePath);
}

interface ReadSourceResult {
  markdown: string;
  sourceFilename: string;
  writeSource: (sourceDir: string) => void;
}

async function readSource(sourcePath: string, manifest: SourceManifest): Promise<ReadSourceResult> {
  if (isPlainTextSource(sourcePath)) {
    const markdown = readFileSync(sourcePath, 'utf8');
    const sourceFilename = basename(sourcePath);
    return {
      markdown,
      sourceFilename,
      writeSource: (sourceDir) => copyFileSync(sourcePath, join(sourceDir, sourceFilename)),
    };
  }

  const result = await parseToMarkdown(sourcePath);
  const sourceFilename = `${basename(sourcePath, extname(sourcePath))}.md`;
  if (manifest.pages === undefined) manifest.pages = result.manifest.pages;
  if (manifest.parser === undefined) manifest.parser = result.manifest.extractor;
  return {
    markdown: result.contentMd,
    sourceFilename,
    writeSource: (sourceDir) =>
      writeFileSync(join(sourceDir, sourceFilename), result.contentMd, 'utf8'),
  };
}

interface LessonEmitInput {
  markdown: string;
  lessonTitle?: string;
  manifest: SourceManifest;
  workingDir: string;
  sourceFilename: string;
  writeSource: (sourceDir: string) => void;
  knowledgePackId: string;
  curriculumPackId: string;
  knowledgeName: string;
  curriculumName: string;
  options: CliOptions;
}

async function emitLesson(input: LessonEmitInput): Promise<number> {
  const { options, manifest, workingDir } = input;

  const doc = parseMarkdown(input.markdown);
  doc.document.id = manifest.id;
  if (doc.document.title === '' && input.lessonTitle) {
    doc.document.title = input.lessonTitle;
  }

  const sourceDir = join(workingDir, 'source');
  mkdirSync(sourceDir, { recursive: true });
  input.writeSource(sourceDir);
  writeJson(join(workingDir, 'source-model', 'source-model.json'), doc);

  const knowledge = extractKnowledge(doc, manifest);

  writeJson(join(workingDir, 'review', 'knowledge-model.json'), knowledge);
  writeJson(join(workingDir, 'review', 'glossary-candidates.json'), knowledge.glossary);

  const curriculum = toCurriculum(extractCurriculum(knowledge, doc), {
    knowledgePackId: input.knowledgePackId,
    curriculumPackId: input.curriculumPackId,
  });

  writeJson(join(workingDir, 'review', 'curriculum-model.json'), curriculum);

  const sources = buildPackSources(manifest.id, manifest.title);

  const knowledgeManifest: PackManifest = {
    format: 'openedu-pack',
    formatVersion: 1,
    type: 'knowledge',
    id: input.knowledgePackId,
    version: '0.1.0',
    name: input.knowledgeName,
    author: 'KnowledgeAssemble',
    language: 'en',
    requires: [],
    derivedFrom: 'document',
  };

  const curriculumManifest: PackManifest = {
    format: 'openedu-pack',
    formatVersion: 1,
    type: 'curriculum',
    id: input.curriculumPackId,
    version: '0.1.0',
    name: input.curriculumName,
    author: 'KnowledgeAssemble',
    language: 'en',
    requires: [input.knowledgePackId],
    derivedFrom: 'document',
  };

  const knowledgePack = emitKnowledgePack({
    outputDir: join(workingDir, 'packs'),
    manifest: knowledgeManifest,
    concepts: knowledge.concepts.map(toConcept),
    sources,
  });

  const curriculumPack = emitCurriculumPack({
    outputDir: join(workingDir, 'packs'),
    manifest: curriculumManifest,
    curriculum,
    sources,
  });

  if (options.validate) {
    const knowledgeConceptIds = new Set(knowledge.concepts.map((concept) => concept.id));
    const knowledgeResult = validateKnowledgePack(dirname(knowledgePack.paths[0] ?? ''));
    const curriculumResult = validateCurriculumPack(
      dirname(curriculumPack.paths[0] ?? ''),
      input.knowledgePackId,
      knowledgeConceptIds,
    );

    if (!knowledgeResult.ok || !curriculumResult.ok) {
      if (!knowledgeResult.ok) {
        for (const error of knowledgeResult.errors) console.error(`knowledge: ${error}`);
      }
      if (!curriculumResult.ok) {
        for (const error of curriculumResult.errors) console.error(`curriculum: ${error}`);
      }
      return 1;
    }
  }

  writeJson(join(workingDir, 'review', 'fidelity-report.json'), { status: 'pending-llm' });
  writeJson(join(workingDir, 'review', 'human-review-flags.json'), {
    items: [],
    generatedAt: new Date().toISOString(),
  });

  if (options.enrich) {
    const enrichment = await runEnrichment({
      doc,
      knowledge,
      config: { provider: options.llmProvider, model: options.llmModel },
    });
    // Provenance guard: enriched output is review-only and never merged into
    // packs whose manifest is `derivedFrom: "document"`.
    if (!canMergeEnrichmentIntoPack(knowledgeManifest.derivedFrom)) {
      writeJson(join(workingDir, 'review', 'enrichment.json'), enrichment);
    }
  }

  return 0;
}

function hasLlmCredentials(): boolean {
  return Boolean(
    process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY,
  );
}

async function createLlmClient(tierConfig: TierConfig): Promise<LlmClient> {
  const { PipelineLlmClient } = await import('../llm/pipeline-llm-client.js');
  return new PipelineLlmClient({
    provider: tierConfig.provider,
    fastModel: tierConfig.fast,
    escalationModel: tierConfig.escalation,
  });
}

export async function run(argv: string[]): Promise<number> {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      printUsage();
      return 0;
    }

    if (options.source === '') {
      printUsage();
      return 1;
    }

    const manifest = options.manifest
      ? (JSON.parse(readFileSync(options.manifest, 'utf8')) as SourceManifest)
      : deriveManifest(options.source);

    const source = await readSource(options.source, manifest);

    const nonMarkdown = !isPlainTextSource(options.source);
    const chapterSelectors =
      options.llmMode === 'force' ||
      options.llmMode === 'off' ||
      options.force ||
      options.chapters !== undefined ||
      options.tocPages !== undefined ||
      options.chapterHeading !== undefined;
    const explicitPipeline = chapterSelectors || (options.dryRun && !options.proofread.enabled);
    const autoChapter = options.manifest !== '' && nonMarkdown && hasLlmCredentials();
    const useChapterPipeline = !options.legacy && (explicitPipeline || autoChapter);

    if (options.llmMode === 'force' && !hasLlmCredentials()) {
      console.error(
        '--llm requested but no API key found (LLM_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY)',
      );
      return 1;
    }

    let proofreadResult: ProofreadResult | undefined;
    let selectedMarkdown = source.markdown;

    if (options.proofread.enabled) {
      const proofreadPdf = options.proofread.pdf ?? (nonMarkdown ? options.source : undefined);
      if (proofreadPdf === undefined) {
        if (options.proofread.reference === 'vision') {
          throw new Error('--proofread-reference vision requires a PDF reference');
        }
        if (options.proofread.pageMarkers) {
          throw new Error('--proofread-page-markers requires a PDF reference');
        }
        if (options.proofread.pages !== undefined) {
          throw new Error('--proofread-pages requires a PDF reference');
        }
      }
      const resolved = resolveProofreadConfig(options.proofread);
      const clients = buildProofreadClients(resolved);
      const base = source.sourceFilename.replace(/\.[^.]+$/, '');
      proofreadResult = await runProofread({
        documentId: manifest.id,
        markdown: source.markdown,
        ...(proofreadPdf === undefined ? {} : { pdfPath: proofreadPdf }),
        title: manifest.title,
        ...(manifest.language === undefined ? {} : { language: manifest.language }),
        workingDir: join(options.output, manifest.id),
        reviewDir: join(options.output, manifest.id, 'review', 'proofread'),
        proofreadMarkdownPath: join(options.output, manifest.id, 'source', `${base}.proofread.md`),
        mode: resolved.mode,
        referenceMode: resolved.reference,
        ...(resolved.screenshotDpi === undefined ? {} : { screenshotDpi: resolved.screenshotDpi }),
        pageMarkers: resolved.pageMarkers,
        windowSize: resolved.windowSize,
        verify: resolved.verify,
        force: options.force,
        dryRun: options.dryRun,
        budgetUsd: Math.min(resolved.budgetUsd, options.maxBudgetUsd),
        ...(resolved.pagesList === undefined ? {} : { pages: resolved.pagesList }),
        strict: resolved.strict,
        allowReferenceFailure: !nonMarkdown,
        ...clients,
        log: (message) => console.log(message),
      });
      selectedMarkdown = proofreadResult.selectedMarkdown;
      if (options.dryRun && !useChapterPipeline) {
        return proofreadStrictExit(options, proofreadResult);
      }
    }

    if (proofreadResult !== undefined && !useChapterPipeline) {
      writeJson(join(options.output, manifest.id, 'review', 'proofread-status.json'), {
        status: proofreadResult.status,
        statusReasons: proofreadResult.statusReasons,
        downstreamSource: proofreadResult.downstreamSource,
        partialFallbackUsed: proofreadResult.partialFallbackUsed,
        reportPath: proofreadResult.artifacts.reportPath,
        issuesPath: proofreadResult.artifacts.issuesPath,
        patchesPath: proofreadResult.artifacts.patchesPath,
        pageMapPath: proofreadResult.artifacts.pageMapPath,
      });
    }

    if (useChapterPipeline) {
      const tierConfig = resolveTierConfig({
        provider: options.provider,
        fastModel: options.fastModel,
        escalationModel: options.escalationModel,
      });
      let llmClient: LlmClient | undefined;
      if (options.llmMode !== 'off' && hasLlmCredentials()) {
        llmClient = await createLlmClient(tierConfig);
      }
      const remainingBudget =
        proofreadResult === undefined
          ? options.maxBudgetUsd
          : Math.max(0, options.maxBudgetUsd - proofreadResult.spentUsd);
      const result = await orchestrate({
        markdown: selectedMarkdown,
        manifest,
        workingDir: join(options.output, manifest.id),
        knowledgePackId: options.knowledgePackId,
        curriculumPackId: options.curriculumPackId,
        knowledgeName: `${manifest.title} — Knowledge`,
        curriculumName: `${manifest.title} — Curriculum`,
        sourceFilename: source.sourceFilename,
        writeSource: source.writeSource,
        llmMode: options.llmMode,
        llmClient,
        tierConfig,
        maxBudgetUsd: remainingBudget,
        dryRun: options.dryRun,
        force: options.force,
        chapters: options.chapters,
        tocPages: options.tocPages,
        chapterHeading: options.chapterHeading,
        allowPartial: options.allowPartial,
        validate: options.validate,
        ...(proofreadResult === undefined
          ? {}
          : {
              proofread: {
                status: proofreadResult.status,
                downstreamSource: proofreadResult.downstreamSource,
                partialFallbackUsed: proofreadResult.partialFallbackUsed,
                reportPath: proofreadResult.artifacts.reportPath,
                issuesPath: proofreadResult.artifacts.issuesPath,
                patchesPath: proofreadResult.artifacts.patchesPath,
                pageMapPath: proofreadResult.artifacts.pageMapPath,
              },
            }),
        log: (message) => console.log(message),
      });
      return Math.max(result.exitCode, proofreadStrictExit(options, proofreadResult));
    }

    const lessons = segmentMarkdown(selectedMarkdown, { lessonHeading: options.lessonHeading });

    if (lessons.length > 1) {
      for (const lesson of lessons) {
        const lessonSlug = slugifyLesson(lesson.title);
        const lessonManifest: SourceManifest = {
          ...manifest,
          id: `${manifest.id}-${lessonSlug}`,
          title: lesson.title,
        };
        const code = await emitLesson({
          markdown: lesson.markdown,
          lessonTitle: lesson.title,
          manifest: lessonManifest,
          workingDir: join(options.output, manifest.id, 'lessons', lessonSlug),
          sourceFilename: source.sourceFilename,
          writeSource: source.writeSource,
          knowledgePackId: `${options.knowledgePackId}-${lessonSlug}`,
          curriculumPackId: `${options.curriculumPackId}-${lessonSlug}`,
          knowledgeName: `${lesson.title} — Knowledge`,
          curriculumName: `${lesson.title} — Curriculum`,
          options,
        });
        if (code !== 0) return Math.max(code, proofreadStrictExit(options, proofreadResult));
      }
      return proofreadStrictExit(options, proofreadResult);
    }

    const singleCode = await emitLesson({
      markdown: selectedMarkdown,
      manifest,
      workingDir: join(options.output, manifest.id),
      sourceFilename: source.sourceFilename,
      writeSource: source.writeSource,
      knowledgePackId: options.knowledgePackId,
      curriculumPackId: options.curriculumPackId,
      knowledgeName: 'NIOS Mathematics Level A — Knowledge',
      curriculumName: 'NIOS Mathematics Level A — Curriculum Slice',
      options,
    });
    return Math.max(singleCode, proofreadStrictExit(options, proofreadResult));
  } catch (error) {
    console.error(error);
    return 1;
  }
}

function proofreadStrictExit(options: CliOptions, result: ProofreadResult | undefined): number {
  if (result === undefined) return 0;
  if (!options.proofread.strict) return 0;
  return result.status === 'PASS' || result.status === 'PASS_WITH_WARNINGS' ? 0 : 1;
}

function slugifyLesson(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'lesson';
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
