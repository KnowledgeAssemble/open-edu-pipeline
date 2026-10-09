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
import { writeJson, emitKnowledgePack, emitCurriculumPack } from '../emit/write.js';
import { validateKnowledgePack, validateCurriculumPack } from '../validate/pack.js';
import { canMergeEnrichmentIntoPack, runEnrichment } from '../enrich/index.js';
import type { Concept, PackManifest } from '../schemas/index.js';

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
  };
  const errors: string[] = [];

  const requireValue = (name: string, value: string | undefined): string => {
    if (value === undefined) errors.push(`${name} requires a value`);
    return value ?? '';
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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

  const sources = {
    documents: [{ documentId: manifest.id, title: manifest.title, file: input.sourceFilename }],
  };

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
    requires: [],
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

    const lessons = segmentMarkdown(source.markdown, { lessonHeading: options.lessonHeading });

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
        if (code !== 0) return code;
      }
      return 0;
    }

    return await emitLesson({
      markdown: source.markdown,
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
  } catch (error) {
    console.error(error);
    return 1;
  }
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
