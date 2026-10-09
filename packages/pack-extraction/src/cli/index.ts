import { copyFileSync, readFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SourceManifest } from '../ingest/types.js';
import { parseMarkdown } from '../source-model/normalize.js';
import { extractKnowledge } from '../knowledge/extract.js';
import { extractCurriculum, toCurriculum } from '../curriculum/extract.js';
import { writeJson, emitKnowledgePack, emitCurriculumPack } from '../emit/write.js';
import { validateKnowledgePack, validateCurriculumPack } from '../validate/pack.js';
import type { Concept, PackManifest } from '../schemas/index.js';

interface CliOptions {
  source: string;
  manifest: string;
  output: string;
  curriculumPackId: string;
  knowledgePackId: string;
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
      'Usage: pack-extract --source <markdown-file> --manifest <manifest-file> [options]',
      '',
      'Options:',
      '  --source <file>              Markdown source file (required)',
      '  --manifest <file>            Source manifest JSON (required)',
      '  --output <dir>               Output directory (default: ./output)',
      '  --curriculum-pack-id <id>    Curriculum pack id (default: nios-math-slice)',
      '  --knowledge-pack-id <id>     Knowledge pack id (default: nios-math-a-knowledge)',
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

export async function run(argv: string[]): Promise<number> {
  try {
    const options = parseArgs(argv);

    if (options.help) {
      printUsage();
      return 0;
    }

    if (options.source === '' || options.manifest === '') {
      printUsage();
      return 1;
    }

    const manifest = JSON.parse(readFileSync(options.manifest, 'utf8')) as SourceManifest;
    const markdown = readFileSync(options.source, 'utf8');

    const workingDir = join(options.output, manifest.id);

    const doc = parseMarkdown(markdown);
    doc.document.id = manifest.id;

    const sourceDir = join(workingDir, 'source');
    mkdirSync(sourceDir, { recursive: true });
    copyFileSync(options.source, join(sourceDir, basename(options.source)));
    writeJson(join(workingDir, 'source-model', 'source-model.json'), doc);

    const knowledge = extractKnowledge(doc, manifest);

    writeJson(join(workingDir, 'review', 'knowledge-model.json'), knowledge);
    writeJson(join(workingDir, 'review', 'glossary-candidates.json'), knowledge.glossary);

    const curriculum = toCurriculum(extractCurriculum(knowledge, doc), {
      knowledgePackId: options.knowledgePackId,
      curriculumPackId: options.curriculumPackId,
    });

    writeJson(join(workingDir, 'review', 'curriculum-model.json'), curriculum);

    const sources = {
      documents: [
        { documentId: manifest.id, title: manifest.title, file: basename(options.source) },
      ],
    };

    const knowledgeManifest: PackManifest = {
      format: 'openedu-pack',
      formatVersion: 1,
      type: 'knowledge',
      id: options.knowledgePackId,
      version: '0.1.0',
      name: 'NIOS Mathematics Level A — Knowledge',
      author: 'KnowledgeAssemble',
      language: 'en',
      requires: [],
      derivedFrom: 'document',
    };

    const curriculumManifest: PackManifest = {
      format: 'openedu-pack',
      formatVersion: 1,
      type: 'curriculum',
      id: options.curriculumPackId,
      version: '0.1.0',
      name: 'NIOS Mathematics Level A — Curriculum Slice',
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
        options.knowledgePackId,
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

    return 0;
  } catch (error) {
    console.error(error);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
