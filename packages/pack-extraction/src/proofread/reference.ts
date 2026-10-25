import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PageComplexityStats, ParseResult, ScreenshotResult } from '@llamaindex/liteparse';
import {
  DEFAULT_SCREENSHOT_DPI,
  MIN_SCREENSHOT_DPI,
  type PageReference,
  type ReferenceBundle,
  type ReferenceKind,
  type ReferenceManifest,
  type ReferenceMode,
} from './types.js';
import { sha256, stableJson } from './util.js';

const require = createRequire(import.meta.url);

const MAX_SCREENSHOT_PIXELS = 8_000_000;
const VISION_TEXT_THRESHOLD = 200;

export interface ReferenceParseOptions {
  ocrLanguage?: string;
  noOcr?: boolean;
  ocrServerUrl?: string;
  tessdataPath?: string;
  dpi?: number;
  imageMode?: 'off' | 'placeholder' | 'embed';
  extractImages?: boolean;
  targetPages?: string;
  maxPages?: number;
  keepHeadersFooters?: boolean;
  preserveVerySmallText?: boolean;
  extractLinks?: boolean;
  cropBox?: { top: number; right: number; bottom: number; left: number };
}

export interface ReferenceRawProvenance {
  liteparseVersion?: string;
  parseOptionsSha256?: string;
}

export interface ReferenceBuildDependencies {
  parse?: (pdfPath: string) => Promise<ParseResult>;
  screenshot?: (pdfPath: string, dpi: number, pageNumbers: number[]) => Promise<ScreenshotResult[]>;
  liteparseVersion?: string;
}

export interface BuildReferenceOptions {
  pdfPath: string;
  cacheDir: string;
  rawMarkdown: string;
  parseOptions?: ReferenceParseOptions;
  screenshotDpi?: number;
  referenceMode?: ReferenceMode;
  rawProvenance?: ReferenceRawProvenance;
  force?: boolean;
  /** Planning pass: read the text reference but never render new screenshots. */
  cacheOnly?: boolean;
  now?: () => Date;
  dependencies?: ReferenceBuildDependencies;
}

interface CachePage extends Omit<PageReference, 'screenshotPath'> {
  screenshotFile?: string;
}

function liteparseVersion(): string {
  try {
    return String((require('@llamaindex/liteparse/package.json') as { version?: string }).version);
  } catch {
    return 'unknown';
  }
}

function effectiveOptions(options: ReferenceParseOptions = {}): Record<string, unknown> {
  return {
    ocrLanguage: options.ocrLanguage ?? 'en',
    ocrEnabled: options.noOcr !== true,
    ocrServerUrl: options.ocrServerUrl ?? null,
    tessdataPath: options.tessdataPath ?? null,
    dpi: options.dpi ?? DEFAULT_SCREENSHOT_DPI,
    outputFormat: 'json',
    imageMode: options.imageMode ?? 'placeholder',
    extractImages: options.extractImages ?? false,
    targetPages: options.targetPages ?? null,
    maxPages: options.maxPages ?? null,
    keepHeadersFooters: options.keepHeadersFooters ?? false,
    preserveVerySmallText: options.preserveVerySmallText ?? false,
    extractLinks: options.extractLinks ?? true,
    cropBox: options.cropBox ?? null,
    includeComplexity: true,
  };
}

function complexityOf(page: { complexity?: PageComplexityStats }): PageComplexityStats | undefined {
  return page.complexity;
}

function layoutOf(complexity: PageComplexityStats | undefined): PageComplexityStats['layout'] {
  return complexity?.layout;
}

/** Whether a page carries enough of a visual signal to require a screenshot. */
export function shouldRouteToVision(input: {
  text: string;
  markdown: string;
  complexity?: PageComplexityStats;
}): boolean {
  const { text, markdown, complexity } = input;
  if (complexity?.needsOcr === true) return true;
  if (complexity?.fullPageImage === true) return true;
  if (complexity?.isGarbled === true) return true;
  const layout = layoutOf(complexity);
  if (layout?.isComplex === true) return true;
  if ((layout?.ruledTableCount ?? 0) > 0) return true;
  if ((layout?.textTableRunCount ?? 0) > 0) return true;
  if ((layout?.figureCount ?? 0) > 0) return true;

  const combined = `${text}\n${markdown}`;
  if (/!\[[^\]]*\]\([^)]+\)/.test(combined)) return true;
  if (/\$\$|\\begin\{|\\\[/.test(combined)) return true;
  if (text.trim().length < VISION_TEXT_THRESHOLD) return true;
  if (text.includes('\uFFFD')) return true;
  return false;
}

export function routePage(
  input: {
    text: string;
    markdown: string;
    complexity?: PageComplexityStats;
  },
  mode: ReferenceMode = 'auto',
): ReferenceKind {
  if (mode === 'vision') return 'vision';
  if (mode === 'text') return 'text';
  return shouldRouteToVision(input) ? 'vision' : 'text';
}

export function isContentPage(page: PageReference): boolean {
  if (page.text.trim().length > 0) return true;
  if (page.pageMarkdown.trim().length > 0) return true;
  if (page.complexity) {
    const stats = page.complexity as PageComplexityStats;
    if (stats.fullPageImage === true) return true;
    if ((stats.imageBlockCount ?? 0) > 0) return true;
  }
  return false;
}

function pageQuality(text: string): PageReference['quality'] {
  return {
    chars: text.length,
    replacementChars: (text.match(/\uFFFD/g) ?? []).length,
  };
}

function toReference(page: ParseResult['pages'][number], mode: ReferenceMode): PageReference {
  const complexity = complexityOf(page);
  const kind = routePage(
    { text: page.text ?? '', markdown: page.markdown ?? '', complexity },
    mode,
  );
  return {
    pageNum: page.pageNum,
    kind,
    text: page.text ?? '',
    pageMarkdown: page.markdown ?? '',
    ...(complexity === undefined ? {} : { complexity }),
    quality: pageQuality(page.text ?? ''),
    hasScreenshot: false,
  };
}

function cachePaths(
  cacheDir: string,
  key: string,
): {
  dir: string;
  pages: string;
  manifest: string;
  screenshots: string;
} {
  const dir = join(cacheDir, 'reference', key);
  return {
    dir,
    pages: join(dir, 'pages.json'),
    manifest: join(dir, 'manifest.json'),
    screenshots: join(dir, 'screenshots'),
  };
}

function readCache(
  paths: ReturnType<typeof cachePaths>,
  key: string,
): { pages: PageReference[]; manifest: ReferenceManifest } | undefined {
  if (!existsSync(paths.pages) || !existsSync(paths.manifest)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8')) as ReferenceManifest & {
      cacheKey?: string;
    };
    if (manifest.cacheKey !== undefined && manifest.cacheKey !== key) return undefined;
    const cached = JSON.parse(readFileSync(paths.pages, 'utf8')) as CachePage[];
    const pages = cached.map((page) => {
      const { screenshotFile, ...rest } = page;
      const screenshotPath =
        screenshotFile === undefined ? undefined : join(paths.dir, screenshotFile);
      if (screenshotPath !== undefined && !existsSync(screenshotPath)) {
        return { ...rest, hasScreenshot: false } satisfies PageReference;
      }
      return {
        ...rest,
        ...(screenshotPath === undefined ? {} : { screenshotPath }),
      } satisfies PageReference;
    });
    return { pages, manifest };
  } catch {
    return undefined;
  }
}

function writeCache(
  paths: ReturnType<typeof cachePaths>,
  key: string,
  pages: PageReference[],
  manifest: ReferenceManifest,
): void {
  mkdirSync(paths.screenshots, { recursive: true });
  const cachePages: CachePage[] = pages.map((page) => {
    const { screenshotPath, ...rest } = page;
    return {
      ...rest,
      ...(screenshotPath === undefined
        ? {}
        : { screenshotFile: `screenshots/${page.pageNum}.png` }),
    };
  });
  writeFileSync(paths.pages, `${JSON.stringify(cachePages, null, 2)}\n`, 'utf8');
  writeFileSync(
    paths.manifest,
    `${JSON.stringify({ ...manifest, cacheKey: key }, null, 2)}\n`,
    'utf8',
  );
}

async function defaultParse(pdfPath: string, options: ReferenceParseOptions): Promise<ParseResult> {
  const { LiteParse } = await import('@llamaindex/liteparse');
  const effective = effectiveOptions(options);
  const lite = new LiteParse({
    ocrLanguage: effective.ocrLanguage as string,
    ocrEnabled: effective.ocrEnabled as boolean,
    outputFormat: 'json',
    includeComplexity: true,
    dpi: effective.dpi as number,
    imageMode: (effective.imageMode as 'off' | 'placeholder' | 'embed') ?? 'placeholder',
    extractImages: effective.extractImages as boolean,
    targetPages: (effective.targetPages as string | null) ?? undefined,
    maxPages: (effective.maxPages as number | null) ?? undefined,
    keepHeadersFooters: effective.keepHeadersFooters as boolean,
    preserveVerySmallText: effective.preserveVerySmallText as boolean,
    extractLinks: effective.extractLinks as boolean,
    ...((effective.ocrServerUrl as string | null) === null
      ? {}
      : { ocrServerUrl: effective.ocrServerUrl as string }),
    ...((effective.tessdataPath as string | null) === null
      ? {}
      : { tessdataPath: effective.tessdataPath as string }),
    ...(effective.cropBox === null
      ? {}
      : { cropBox: effective.cropBox as ReferenceParseOptions['cropBox'] }),
  });
  return lite.parse(pdfPath);
}

async function defaultScreenshot(
  pdfPath: string,
  dpi: number,
  pageNumbers: number[],
): Promise<ScreenshotResult[]> {
  const { LiteParse } = await import('@llamaindex/liteparse');
  const lite = new LiteParse({ dpi });
  return lite.screenshot(pdfPath, pageNumbers);
}

/**
 * Build (or load) the per-page reference bundle. The cache key covers PDF bytes,
 * LitParse version, every mirrored parse option, and screenshot DPI.
 */
export async function buildReference(options: BuildReferenceOptions): Promise<ReferenceBundle> {
  const now = options.now ?? (() => new Date());
  const version = options.dependencies?.liteparseVersion ?? liteparseVersion();
  const parseOptions = effectiveOptions(options.parseOptions);
  const screenshotDpi = options.screenshotDpi ?? DEFAULT_SCREENSHOT_DPI;
  const rawMarkdownSha256 = sha256(options.rawMarkdown);
  const pdfBytes = existsSync(options.pdfPath) ? readFileSync(options.pdfPath) : Buffer.from('');
  const pdfSha256 = sha256(pdfBytes);
  const parseOptionsSha256 = sha256(stableJson(parseOptions));
  const key = sha256(
    [pdfBytes.toString('base64'), version, parseOptionsSha256, String(screenshotDpi)].join(
      '\u0000',
    ),
  );
  const paths = cachePaths(options.cacheDir, key);

  const mismatch =
    options.rawProvenance?.liteparseVersion === undefined ||
    options.rawProvenance.liteparseVersion !== version ||
    (options.rawProvenance.parseOptionsSha256 !== undefined &&
      options.rawProvenance.parseOptionsSha256 !== parseOptionsSha256);

  if (!options.force) {
    const cached = readCache(paths, key);
    const complete =
      cached !== undefined &&
      (options.cacheOnly === true ||
        cached.pages.every((page) => page.kind !== 'vision' || page.hasScreenshot));
    if (cached && complete) {
      return {
        available: true,
        pages: cached.pages,
        manifest: {
          ...cached.manifest,
          rawMarkdownSha256,
          referenceMismatch: mismatch,
        },
      };
    }
  }

  const parse =
    options.dependencies?.parse ?? ((pdfPath) => defaultParse(pdfPath, options.parseOptions ?? {}));
  const parsed = await parse(options.pdfPath);
  const mode = options.referenceMode ?? 'auto';
  const pages = parsed.pages.map((page) => toReference(page, mode));

  const manifest: ReferenceManifest = {
    pdfSha256,
    rawMarkdownSha256,
    liteparseVersion: version,
    parseOptions,
    parseOptionsSha256,
    screenshotDpi,
    createdAt: now().toISOString(),
    referenceMismatch: mismatch,
  };

  if (!options.cacheOnly) {
    const visionPages = pages.filter((page) => page.kind === 'vision').map((page) => page.pageNum);
    if (visionPages.length > 0) {
      const screenshot = options.dependencies?.screenshot ?? defaultScreenshot;
      let rendered: ScreenshotResult[] = [];
      try {
        rendered = await screenshot(options.pdfPath, screenshotDpi, visionPages);
      } catch {
        rendered = [];
      }
      let byPage = new Map(rendered.map((shot) => [shot.pageNum, shot]));
      const oversized = rendered.filter((shot) => shot.width * shot.height > MAX_SCREENSHOT_PIXELS);
      if (oversized.length > 0 && screenshotDpi > MIN_SCREENSHOT_DPI) {
        try {
          const retry = await screenshot(
            options.pdfPath,
            MIN_SCREENSHOT_DPI,
            oversized.map((shot) => shot.pageNum),
          );
          byPage = new Map([...byPage, ...retry.map((shot) => [shot.pageNum, shot] as const)]);
          for (const shot of retry) {
            const page = pages.find((candidate) => candidate.pageNum === shot.pageNum);
            if (page) page.screenshotDpi = MIN_SCREENSHOT_DPI;
          }
        } catch {
          // Keep the original render; the orchestrator marks it unverified if too large.
        }
      }

      mkdirSync(paths.screenshots, { recursive: true });
      for (const page of pages) {
        if (page.kind !== 'vision') continue;
        const shot = byPage.get(page.pageNum);
        if (!shot) continue;
        if (shot.width * shot.height > MAX_SCREENSHOT_PIXELS) {
          page.hasScreenshot = false;
          continue;
        }
        const screenshotPath = join(paths.screenshots, `${page.pageNum}.png`);
        writeFileSync(screenshotPath, shot.imageBuffer);
        page.screenshotPath = screenshotPath;
        page.screenshotDpi = page.screenshotDpi ?? screenshotDpi;
        page.hasScreenshot = true;
      }
    }
  }

  writeCache(paths, key, pages, manifest);
  return { available: true, pages, manifest };
}

/** No-PDF mode: an explicitly unavailable bundle; no pages or provenance. */
export function unavailableReference(rawMarkdown: string): ReferenceBundle {
  return {
    available: false,
    pages: [],
    manifest: {
      pdfSha256: '',
      rawMarkdownSha256: sha256(rawMarkdown),
      liteparseVersion: 'unknown',
      parseOptions: {},
      parseOptionsSha256: '',
      screenshotDpi: 0,
      createdAt: new Date().toISOString(),
      referenceMismatch: false,
    },
  };
}
