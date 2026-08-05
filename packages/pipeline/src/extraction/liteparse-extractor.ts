import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Extractor } from './interface.js';
import type { ExtractionInput, ExtractionResult, ExtractionManifest, AssetInfo } from './types.js';

const SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.docm',
  '.odt',
  '.rtf',
  '.ppt',
  '.pptx',
  '.pptm',
  '.odp',
  '.key',
  '.xls',
  '.xlsx',
  '.xlsm',
  '.ods',
  '.csv',
  '.tsv',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.tiff',
  '.webp',
  '.svg',
  '.md',
  '.markdown',
  '.txt',
];

interface ComplexityPage {
  page_number: number;
  needs_ocr: boolean;
  reasons: string[];
}

export class LiteParseExtractor implements Extractor {
  readonly id = 'liteparse';
  readonly supportedExtensions = [...SUPPORTED_EXTENSIONS];

  canHandle(input: ExtractionInput): boolean {
    return SUPPORTED_EXTENSIONS.some((ext) => input.filePath.toLowerCase().endsWith(ext));
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const ext = this.getExtension(input.filePath);

    if (['.md', '.markdown', '.txt'].includes(ext)) {
      return this.extractMarkdown(input.filePath);
    }

    return this.extractViaLiteParse(input);
  }

  private extractMarkdown(filePath: string): ExtractionResult {
    const contentMd = readFileSync(filePath, 'utf-8');

    const manifest: ExtractionManifest = {
      id: this.generateId(filePath),
      sourceType: 'markdown',
      extractor: this.id,
      version: '1.0.0',
      pages: 1,
      images: 0,
      tables: 0,
      warnings: [],
      createdAt: new Date().toISOString(),
      complexity: 'low',
    };

    return { contentMd, manifest, assets: [] };
  }

  private extractViaLiteParse(input: ExtractionInput): ExtractionResult {
    const filePath = input.filePath;
    const opts = input.options;
    const ext = this.getExtension(filePath);
    const sourceType = this.getSourceType(ext);

    const args = this.buildLitArgs(filePath, opts);
    const markdown = execFileSync('lit', args, {
      encoding: 'utf-8',
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    });

    const complexity = this.checkComplexity(filePath);
    const assets = this.extractAssetRefs(markdown);
    const tableCount = this.countTables(markdown);
    const pageCount = this.countPages(filePath, complexity);
    const warnings = this.buildWarnings(complexity);

    const manifest: ExtractionManifest = {
      id: this.generateId(filePath),
      sourceType,
      extractor: this.id,
      version: '1.0.0',
      pages: pageCount,
      images: assets.length,
      tables: tableCount,
      warnings,
      createdAt: new Date().toISOString(),
      complexity: this.deriveComplexity(complexity),
    };

    return { contentMd: markdown.trim(), manifest, assets };
  }

  private buildLitArgs(filePath: string, opts?: ExtractionInput['options']): string[] {
    const args = ['parse', filePath, '--format', 'markdown'];

    if (opts?.noOcr) args.push('--no-ocr');
    if (opts?.ocrLanguage) args.push('--ocr-language', opts.ocrLanguage);
    if (opts?.ocrServerUrl) args.push('--ocr-server-url', opts.ocrServerUrl);
    if (opts?.extractImages) args.push('--extract-images');
    if (opts?.imageMode) args.push('--image-mode', opts.imageMode);
    if (opts?.targetPages) args.push('--target-pages', opts.targetPages);
    if (opts?.maxPages) args.push('--max-pages', String(opts.maxPages));
    args.push('-q');

    return args;
  }

  private checkComplexity(filePath: string): ComplexityPage[] {
    try {
      const output = execFileSync('lit', ['is-complex', filePath, '--compact', '-q'], {
        encoding: 'utf-8',
        timeout: 30_000,
      });
      return JSON.parse(output);
    } catch {
      return [];
    }
  }

  private deriveComplexity(pages: ComplexityPage[]): 'low' | 'medium' | 'high' {
    if (pages.length === 0) return 'low';
    const ocrPages = pages.filter((p) => p.needs_ocr).length;
    const ratio = ocrPages / pages.length;
    if (ratio >= 0.5 || pages.length > 50) return 'high';
    if (ratio > 0.1 || pages.length > 15) return 'medium';
    return 'low';
  }

  private extractAssetRefs(markdown: string): AssetInfo[] {
    const assets: AssetInfo[] = [];
    const pattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = pattern.exec(markdown)) !== null) {
      const originalName = match[2];
      if (!originalName || originalName.startsWith('http')) continue;
      const ext = originalName.split('.').pop() || 'png';
      assets.push({
        filename: `image-${String(assets.length + 1).padStart(3, '0')}.${ext}`,
        originalName,
        mediaType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        sizeBytes: 0,
      });
    }
    return assets;
  }

  private countTables(markdown: string): number {
    const tableRows = markdown.match(/^\|.*\|$/gm) || [];
    return Math.floor(tableRows.length / 3);
  }

  private countPages(filePath: string, complexity: ComplexityPage[]): number {
    if (complexity.length > 0) {
      return Math.max(...complexity.map((p) => p.page_number));
    }
    return 1;
  }

  private buildWarnings(complexity: ComplexityPage[]): string[] {
    const warnings: string[] = [];
    const ocrPages = complexity.filter((p) => p.needs_ocr);
    if (ocrPages.length > 0) {
      warnings.push(
        `${ocrPages.length} page(s) require OCR: pages ${ocrPages.map((p) => p.page_number).join(', ')}`,
      );
    }
    return warnings;
  }

  private getExtension(filePath: string): string {
    const lower = filePath.toLowerCase();
    for (const ext of SUPPORTED_EXTENSIONS) {
      if (lower.endsWith(ext)) return ext;
    }
    return '';
  }

  private getSourceType(ext: string): string {
    if (ext === '.pdf') return 'pdf';
    if (['.doc', '.docx', '.docm', '.odt', '.rtf'].includes(ext)) return 'docx';
    if (['.ppt', '.pptx', '.pptm', '.odp', '.key'].includes(ext)) return 'pptx';
    if (['.xls', '.xlsx', '.xlsm', '.ods', '.csv', '.tsv'].includes(ext)) return 'spreadsheet';
    if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.svg'].includes(ext))
      return 'image';
    return 'unknown';
  }

  private generateId(filePath: string): string {
    return createHash('sha256').update(filePath).digest('hex').slice(0, 12);
  }
}
