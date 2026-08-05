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
import { parseArgs, printHelp, type CLIOptions } from './parse-args.js';
import * as logger from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

config();
config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

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
