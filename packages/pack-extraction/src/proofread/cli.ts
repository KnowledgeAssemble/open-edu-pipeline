import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deriveManifest } from '../ingest/manifest.js';
import { runProofread } from './orchestrate.js';
import { HttpProofreadClient } from './http-client.js';
import type { ProofreadClient, ReferenceMode } from './types.js';
import {
  DEFAULT_PROOFREAD_BUDGET_USD,
  DEFAULT_PROOFREAD_MODEL,
  DEFAULT_WINDOW_PAGES,
} from './types.js';
import { parsePageRange } from './util.js';

export interface ProofreadCliConfig {
  enabled: boolean;
  mode: 'report' | 'apply';
  pdf?: string;
  reference: ReferenceMode;
  model?: string;
  provider?: string;
  verifierModel?: string;
  verifierProvider?: string;
  budgetUsd: number;
  pages?: string;
  windowSize: number;
  pageMarkers: boolean;
  verify: 'changed' | 'full';
  strict: boolean;
}

function referenceFromEnv(): ReferenceMode {
  const value = process.env.PROOFREAD_REFERENCE;
  return value === 'vision' || value === 'text' ? value : 'auto';
}

export function defaultProofreadCliConfig(): ProofreadCliConfig {
  return {
    enabled: false,
    mode: 'apply',
    reference: referenceFromEnv(),
    budgetUsd:
      Number.parseFloat(process.env.PROOFREAD_BUDGET_USD ?? '') || DEFAULT_PROOFREAD_BUDGET_USD,
    windowSize: DEFAULT_WINDOW_PAGES,
    pageMarkers: false,
    verify: 'changed',
    strict: false,
  };
}

function required(name: string, value: string | undefined): string {
  if (value === undefined) throw new Error(`${name} requires a value`);
  return value;
}

/**
 * Shared proofreading flag consumer. Both `proofread-md` and `pack-extract` use
 * it, and each accepts the other's spelling as an alias.
 */
export function consumeProofreadFlag(
  argv: string[],
  index: number,
  config: ProofreadCliConfig,
): number | undefined {
  const arg = argv[index];
  switch (arg) {
    case '--proofread':
      config.enabled = true;
      return index;
    case '--proofread-mode':
    case '--mode': {
      const value = required(arg, argv[index + 1]);
      if (value !== 'report' && value !== 'apply') {
        throw new Error(`${arg} must be "report" or "apply" (got "${value}")`);
      }
      config.mode = value;
      return index + 1;
    }
    case '--proofread-pdf':
    case '--pdf':
      config.pdf = required(arg, argv[index + 1]);
      return index + 1;
    case '--proofread-reference':
    case '--reference': {
      const value = required(arg, argv[index + 1]);
      if (value !== 'auto' && value !== 'vision' && value !== 'text') {
        throw new Error(`${arg} must be "auto", "vision", or "text" (got "${value}")`);
      }
      config.reference = value;
      return index + 1;
    }
    case '--proofread-model':
    case '--proofread-provider':
    case '--proofread-verifier-model':
    case '--proofread-verifier-provider':
    case '--proofread-budget-usd':
    case '--proofread-pages':
    case '--proofread-window':
    case '--proofread-verify': {
      const value = required(arg, argv[index + 1]);
      switch (arg) {
        case '--proofread-model':
          config.model = value;
          break;
        case '--proofread-provider':
          config.provider = value;
          break;
        case '--proofread-verifier-model':
          config.verifierModel = value;
          break;
        case '--proofread-verifier-provider':
          config.verifierProvider = value;
          break;
        case '--proofread-budget-usd': {
          const budget = Number.parseFloat(value);
          if (!Number.isFinite(budget) || budget < 0) {
            throw new Error('--proofread-budget-usd must be a non-negative number');
          }
          config.budgetUsd = budget;
          break;
        }
        case '--proofread-pages':
          if (parsePageRange(value) === undefined) {
            throw new Error(`--proofread-pages is not a valid page range: ${value}`);
          }
          config.pages = value;
          break;
        case '--proofread-window': {
          const window = Number.parseInt(value, 10);
          if (!Number.isInteger(window) || window < 1) {
            throw new Error('--proofread-window must be a positive integer');
          }
          config.windowSize = window;
          break;
        }
        case '--proofread-verify':
          if (value !== 'changed' && value !== 'full') {
            throw new Error('--proofread-verify must be "changed" or "full"');
          }
          config.verify = value;
          break;
      }
      return index + 1;
    }
    case '--proofread-page-markers':
    case '--page-markers':
      config.pageMarkers = true;
      return index;
    case '--no-proofread-page-markers':
    case '--no-page-markers':
      config.pageMarkers = false;
      return index;
    case '--proofread-strict':
    case '--strict':
      config.strict = true;
      return index;
    default:
      return undefined;
  }
}

export interface ResolvedProofreadConfig extends ProofreadCliConfig {
  provider: string;
  model: string;
  verifierProvider: string;
  verifierModel: string;
  screenshotDpi?: number;
  pagesList?: number[];
}

function positiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveProofreadConfig(config: ProofreadCliConfig): ResolvedProofreadConfig {
  const provider =
    config.provider ?? process.env.PROOFREAD_PROVIDER ?? process.env.LLM_PROVIDER ?? 'openai';
  const model =
    config.model ??
    process.env.PROOFREAD_MODEL ??
    process.env.LLM_ESCALATION_MODEL ??
    DEFAULT_PROOFREAD_MODEL;
  const verifierProvider =
    config.verifierProvider ?? process.env.PROOFREAD_VERIFIER_PROVIDER ?? provider;
  const verifierModel =
    config.verifierModel ??
    process.env.PROOFREAD_VERIFIER_MODEL ??
    process.env.LLM_ESCALATION_MODEL ??
    model;
  const budget = config.budgetUsd;
  const pageRange = config.pages;
  return {
    ...config,
    provider,
    model,
    verifierProvider,
    verifierModel,
    budgetUsd: Number.isFinite(budget) ? budget : DEFAULT_PROOFREAD_BUDGET_USD,
    ...(positiveInt(process.env.PROOFREAD_DPI) === undefined
      ? {}
      : { screenshotDpi: positiveInt(process.env.PROOFREAD_DPI) }),
    ...(pageRange === undefined ? {} : { pagesList: parsePageRange(pageRange) }),
  };
}

export function hasProofreadCredentials(): boolean {
  return Boolean(
    process.env.PROOFREAD_API_KEY ||
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENROUTER_API_KEY,
  );
}

export interface ProofreadClients {
  reviewClient?: ProofreadClient;
  verifierClient?: ProofreadClient;
}

export function buildProofreadClients(
  config: ResolvedProofreadConfig,
  options: { requireCredentials?: boolean } = {},
): ProofreadClients {
  if (options.requireCredentials !== false && !hasProofreadCredentials()) {
    return {};
  }
  const maxTokens = positiveInt(process.env.PROOFREAD_MAX_OUTPUT_TOKENS);
  const reviewClient = new HttpProofreadClient({
    provider: config.provider,
    model: config.model,
    ...(maxTokens === undefined ? {} : { maxTokens }),
  });
  const verifierClient = new HttpProofreadClient({
    provider: config.verifierProvider,
    model: config.verifierModel,
    ...(maxTokens === undefined ? {} : { maxTokens }),
  });
  return { reviewClient, verifierClient };
}

interface StandaloneOptions extends ProofreadCliConfig {
  markdown: string;
  output: string;
  docId?: string;
  dryRun: boolean;
  force: boolean;
  help: boolean;
}

function parseStandaloneArgs(argv: string[]): StandaloneOptions {
  const config = defaultProofreadCliConfig();
  const options: StandaloneOptions = {
    ...config,
    markdown: '',
    output: './output',
    dryRun: false,
    force: false,
    help: false,
  };
  const errors: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    try {
      const consumed = consumeProofreadFlag(argv, index, options);
      if (consumed !== undefined) {
        index = consumed;
        continue;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    switch (arg) {
      case '--markdown':
      case '--source':
        options.markdown = required(arg, argv[index + 1]);
        index += 1;
        break;
      case '--output':
        options.output = required('--output', argv[index + 1]);
        index += 1;
        break;
      case '--doc-id':
        options.docId = required('--doc-id', argv[index + 1]);
        index += 1;
        break;
      case '--model':
        options.model = required(arg, argv[index + 1]);
        index += 1;
        break;
      case '--provider':
        options.provider = required(arg, argv[index + 1]);
        index += 1;
        break;
      case '--verifier-model':
        options.verifierModel = required(arg, argv[index + 1]);
        index += 1;
        break;
      case '--verifier-provider':
        options.verifierProvider = required(arg, argv[index + 1]);
        index += 1;
        break;
      case '--budget-usd': {
        const budget = Number.parseFloat(required(arg, argv[index + 1]));
        if (!Number.isFinite(budget) || budget < 0) {
          errors.push('--budget-usd must be a non-negative number');
        } else {
          options.budgetUsd = budget;
        }
        index += 1;
        break;
      }
      case '--pages': {
        const value = required(arg, argv[index + 1]);
        if (parsePageRange(value) === undefined) {
          errors.push(`--pages is not a valid page range: ${value}`);
        } else {
          options.pages = value;
        }
        index += 1;
        break;
      }
      case '--window': {
        const window = Number.parseInt(required(arg, argv[index + 1]), 10);
        if (!Number.isInteger(window) || window < 1) {
          errors.push('--window must be a positive integer');
        } else {
          options.windowSize = window;
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
      'Usage: proofread-md --markdown <file> [--pdf <file>] [--output <dir>] [options]',
      '',
      'Options:',
      '  --markdown <file>               Markdown under review (required; alias --source)',
      '  --pdf <file>                    Original PDF (alias --proofread-pdf)',
      '  --output <dir>                  Output directory (default: ./output)',
      '  --mode <report|apply>           Report-only or apply verified corrections (default: apply)',
      '  --reference <auto|vision|text>  Page reference routing (default: auto)',
      '  --model <model>                 Vision review model (also PROOFREAD_MODEL)',
      '  --provider <name>               Proofreading provider (also PROOFREAD_PROVIDER)',
      '  --verifier-model <model>        Independent verifier model',
      '  --verifier-provider <name>      Independent verifier provider',
      '  --budget-usd <n>                Proofreading budget cap (default: 1.0)',
      '  --pages <range>                 Subset re-run, e.g. 12-20',
      '  --window <n>                    Text pages per review call (default: 2)',
      '  --page-markers / --no-page-markers',
      '  --verify <changed|full>         Verification scope (default: changed)',
      '  --strict                        Exit 1 on NEEDS_REVIEW or PARTIAL',
      '  --dry-run                       Plan routing and cost; no calls',
      '  --force                         Bust reference/review/verification caches',
      '  --help                          Show this help',
    ].join('\n'),
  );
}

export async function runProofreadCli(argv: string[]): Promise<number> {
  try {
    const options = parseStandaloneArgs(argv);
    if (options.help) {
      printUsage();
      return 0;
    }
    if (options.markdown === '') {
      printUsage();
      return 1;
    }
    if (options.pdf === undefined && options.reference === 'vision') {
      throw new Error('--reference vision requires --pdf; no page reference is available');
    }
    if (options.pdf === undefined && options.pageMarkers) {
      throw new Error('--page-markers requires --pdf; no page map is available');
    }
    if (options.pdf === undefined && options.pages !== undefined) {
      throw new Error('--pages requires --pdf; no page map is available');
    }

    const resolved = resolveProofreadConfig(options);
    const clients = buildProofreadClients(resolved);
    const manifest = deriveManifest(options.markdown);
    const docId = options.docId ?? manifest.id;
    const reviewDir = join(options.output, 'proofread');

    const result = await runProofread({
      documentId: docId,
      markdown: readMarkdown(options.markdown),
      ...(options.pdf === undefined ? {} : { pdfPath: options.pdf }),
      title: manifest.title,
      workingDir: options.output,
      reviewDir,
      proofreadMarkdownPath: join(options.output, `${docId}.proofread.md`),
      reportCopyPath: join(options.output, `${docId}.proofread-report.md`),
      mode: resolved.mode,
      referenceMode: resolved.reference,
      ...(resolved.screenshotDpi === undefined ? {} : { screenshotDpi: resolved.screenshotDpi }),
      pageMarkers: resolved.pageMarkers,
      windowSize: resolved.windowSize,
      verify: resolved.verify,
      force: options.force,
      dryRun: options.dryRun,
      budgetUsd: resolved.budgetUsd,
      ...(resolved.pagesList === undefined ? {} : { pages: resolved.pagesList }),
      strict: resolved.strict,
      allowReferenceFailure: true,
      ...clients,
      log: (message) => console.log(message),
    });

    console.log('');
    console.log(`Status: ${result.status}`);
    console.log(`Corrected conversion errors: ${result.summary.conversionErrorsCorrected}`);
    console.log(`Unresolved issues: ${result.summary.unresolvedIssues}`);
    console.log(
      `Manual review pages: ${
        result.summary.manualReviewPages.length === 0
          ? 'none'
          : result.summary.manualReviewPages.join(', ')
      }`,
    );
    console.log(`Proofread Markdown: ${result.artifacts.proofreadMarkdownPath ?? 'n/a'}`);
    console.log(`Report: ${result.artifacts.reportPath ?? 'n/a'}`);
    console.log(`Issues: ${result.artifacts.issuesPath ?? 'n/a'}`);

    return result.status === 'PASS' || result.status === 'PASS_WITH_WARNINGS' ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}

function readMarkdown(path: string): string {
  return readFileSync(path, 'utf8');
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  runProofreadCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
