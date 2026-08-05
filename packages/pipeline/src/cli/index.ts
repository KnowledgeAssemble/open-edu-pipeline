#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { LlmRouter } from '@open-edu/pipeline-llm';
import { resolveStageConfigs, logStageConfigs, parseStageOverride } from '../config/config.js';
import { runPipelineV2 } from '../graph/index.js';
import type { PipelineResult } from '../graph/index.js';
import { resolveProfile } from '../profile/registry.js';
import { parseScope } from '../scope/types.js';
import * as logger from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

config();
config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

interface CLIOptions {
  pdf: string;
  level: string;
  subject: string;
  force: boolean;
  profileId?: string;
  curriculum?: string;
  scope: string;
  language: string;
  locale: string;
  widgetCategories: string[];
  llmProvider?: string;
  llmModel?: string;
  dryRun: boolean;
  resume: boolean;
  verbose: boolean;
  outputDir: string;
  maxRetries: number;
  format: 'md' | 'json' | 'both';
  stageOverrides?: string[];
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    pdf: '',
    level: 'B',
    subject: 'math',
    force: false,
    scope: 'all',
    language: 'en',
    locale: 'en-IN',
    widgetCategories: [],
    dryRun: false,
    resume: false,
    verbose: false,
    outputDir: join(__dirname, '..', '..', '..', '..', 'output'),
    maxRetries: 3,
    format: 'both',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pdf':
        options.pdf = args[++i] || '';
        break;
      case '--level':
        options.level = args[++i] || 'B';
        break;
      case '--subject':
        options.subject = args[++i] || 'math';
        break;
      case '--profile':
        options.profileId = args[++i];
        break;
      case '--curriculum':
        options.curriculum = args[++i];
        break;
      case '--scope':
        options.scope = args[++i] || 'all';
        break;
      case '--language':
        options.language = args[++i] || 'en';
        break;
      case '--locale':
        options.locale = args[++i] || 'en-IN';
        break;
      case '--widget-category':
        options.widgetCategories.push(args[++i] || '');
        break;
      case '--force':
        options.force = true;
        break;
      case '--llm-provider':
        options.llmProvider = args[++i];
        break;
      case '--llm-model':
        options.llmModel = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--resume':
        options.resume = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--output-dir':
        options.outputDir = args[++i] || options.outputDir;
        break;
      case '--max-retries':
        options.maxRetries = parseInt(args[++i] || '3', 10);
        break;
      case '--format': {
        const formatVal = args[++i] || 'both';
        if (!['md', 'json', 'both'].includes(formatVal)) {
          console.error(`Invalid format: ${formatVal}. Use md, json, or both.`);
          process.exit(1);
        }
        options.format = formatVal as 'md' | 'json' | 'both';
        break;
      }
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
OpenEdu Pipeline — Curriculum Generator

Usage: pnpm --filter @open-edu/pipeline curriculum:generate [options]

Options:
  --pdf <path>            Path to the input file (PDF, DOCX, PPTX, Markdown, ZIP) (required)
  --level <code>          Level code (default: B)
  --subject <name>        Subject name (default: math)
  --profile <id>          Curriculum profile (generic, math, science, nios)
  --curriculum <id>       Curriculum adapter (e.g., nios)
  --scope <value>         Scope: all, chapter-index:N, chapter-id:ID, pages:A-B, source-units:id,id
  --language <code>       Content language (default: en)
  --locale <locale>       Locale (default: en-IN)
  --widget-category <id>  Repeatable widget category filter (core, math, science, etc.)
  --force                 Overwrite existing output file
  --llm-provider <name>   LLM provider override (default: from env)
  --llm-model <name>      LLM model override (default: from env)
  --interactive           Enable human-in-the-loop checkpoints
  --dry-run               Validate but don't write files
  --resume                Resume from intermediate artifacts when possible
  --verbose               Detailed logging per stage
  --output-dir <path>     Custom output directory (default: ./output)
  --max-retries <num>     Max retries per concept (default: 3)
  --format <type>         Output format: md, json, both (default: both)
  --help, -h              Show this help message

Examples:
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./textbook.pdf --level B --subject math
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./textbook.pdf --scope chapter-index:1 --profile math --verbose
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./science.pdf --subject science --profile science
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./lesson.docx --subject english --profile generic
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./slides.pptx --subject biology --profile science
  pnpm --filter @open-edu/pipeline curriculum:generate --pdf ./archive.zip --subject history --profile generic
`);
}

function validateArgs(options: CLIOptions): string[] {
  const errors: string[] = [];

  const supportedInput = ['.pdf', '.docx', '.pptx', '.md', '.zip'];
  if (!options.pdf) {
    errors.push('Missing required option: --pdf <path>');
  } else if (!existsSync(options.pdf)) {
    errors.push(`Input file not found: ${options.pdf}`);
  } else if (!supportedInput.some((ext) => options.pdf.toLowerCase().endsWith(ext))) {
    errors.push(`Unsupported file type: ${options.pdf}. Supported: ${supportedInput.join(', ')}`);
  }

  if (!options.level.match(/^[a-zA-Z0-9]+$/)) {
    errors.push('Level must be alphanumeric (e.g., B, C)');
  }

  if (!options.subject.match(/.+/)) {
    errors.push('Subject must not be empty');
  }

  return errors;
}

export async function runPipelineCLI(): Promise<void> {
  const options = parseArgs();

  const cwd = process.env.INIT_CWD || process.cwd();
  if (options.pdf) options.pdf = resolve(cwd, options.pdf);
  options.outputDir = resolve(cwd, options.outputDir);

  logger.divider();
  logger.info('OpenEdu Pipeline — Curriculum Generator');
  logger.divider();
  logger.info(`PDF:      ${options.pdf || '(not specified)'}`);
  logger.info(`Level:    ${options.level}`);
  logger.info(`Subject:  ${options.subject.charAt(0).toUpperCase() + options.subject.slice(1)}`);
  logger.info(`Profile:  ${options.profileId || '(auto)'}`);
  logger.info(`Scope:    ${options.scope}`);
  logger.info(`Language: ${options.language}`);
  logger.info(`Locale:   ${options.locale}`);
  logger.info(`Output:   ${options.outputDir}`);
  if (options.dryRun) logger.info('Mode:     Dry run (no files written)');

  const validationErrors = validateArgs(options);
  if (validationErrors.length > 0) {
    logger.error('Validation errors:');
    for (const err of validationErrors) {
      logger.error(`  ${err}`);
    }
    printHelp();
    process.exit(1);
  }

  logger.info('');

  let router: LlmRouter;
  try {
    const stageOverrides = (options.stageOverrides || []).map(parseStageOverride);

    if (options.verbose) {
      logger.info(`Stage overrides from CLI: ${stageOverrides.length}`);
    }

    const stageConfigs = resolveStageConfigs(stageOverrides);
    router = new LlmRouter(stageConfigs);

    if (options.verbose) {
      logger.verbose('Per-stage configs:', true);
      logStageConfigs(stageConfigs, (msg: string) => logger.verbose(msg, true));
    }

    logger.success('LLM router initialized');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to initialize LLM router: ${msg}`);
    process.exit(1);
  }

  let resolvedProfile;
  try {
    resolvedProfile = resolveProfile({
      profileId: options.profileId,
      subject: options.subject,
      curriculum: options.curriculum,
    });
    logger.info(`Using profile: ${resolvedProfile.id} (${resolvedProfile.subject})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to resolve profile: ${msg}`);
    process.exit(1);
  }

  try {
    const result: PipelineResult = await runPipelineV2(router, {
      pdfPath: options.pdf,
      levelCode: options.level.toUpperCase(),
      subject: options.subject,
      force: options.force,
      scope: parseScope(options.scope),
      profile: resolvedProfile,
      outputDir: options.outputDir,
      verbose: options.verbose,
      dryRun: options.dryRun,
      resume: options.resume,
      maxRetries: options.maxRetries,
      format: options.format,
      widgetCategories:
        options.widgetCategories.length > 0
          ? options.widgetCategories
          : resolvedProfile.widgetCategories,
      language: options.language,
      locale: options.locale,
    });

    const r = result.report;
    const durationSec = (r.durationMs / 1000).toFixed(1);

    logger.divider();
    logger.info(`Summary — ${r.status} (${durationSec}s)`);
    logger.divider();

    logger.reportTable([
      {
        label: 'Concepts',
        value: r.conceptCount,
        status: r.conceptCount > 0 ? 'ok' : 'fail',
      },
      {
        label: 'Widget Validation',
        value: `${r.widgetValidation.passed}/${r.widgetValidation.totalChecked}`,
        status: r.widgetValidation.failed === 0 ? 'ok' : 'fail',
      },
      {
        label: 'Assets Generated',
        value: r.assetCount,
        status: r.assetCount > 0 ? 'ok' : 'fail',
      },
      {
        label: 'Dependency Cycles',
        value: r.hasCycles ? 'yes' : 'no',
        status: r.hasCycles ? 'fail' : 'ok',
      },
    ]);

    if (r.reviewItems.length > 0) {
      logger.warn(`\nReview items (${r.reviewItems.length}):`);
      for (const item of r.reviewItems.slice(0, 10)) {
        logger.warn(`  • ${item}`);
      }
      if (r.reviewItems.length > 10) {
        logger.warn(`  ... and ${r.reviewItems.length - 10} more`);
      }
    }

    process.exit(r.status === 'complete' ? 0 : 1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Pipeline failed: ${msg}`);
    process.exit(1);
  }
}

runPipelineCLI();
