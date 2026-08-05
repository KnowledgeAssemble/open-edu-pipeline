import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExtractorRouter } from './router.js';
import type { ExtractionInput, ExtractionResult, ExtractionManifest, AssetInfo } from './types.js';

export class ZipHandler {
  private router: ExtractorRouter;

  constructor(router: ExtractorRouter) {
    this.router = router;
  }

  canHandle(input: ExtractionInput): boolean {
    return input.filePath.toLowerCase().endsWith('.zip');
  }

  listZipContents(zipPath: string): string[] {
    const output = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf-8' });
    const lines = output.split('\n');
    const files: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith('Archive:') ||
        trimmed.startsWith('Length') ||
        trimmed.startsWith('---')
      )
        continue;
      const parts = trimmed.split(/\s+/);
      const name = parts[parts.length - 1];
      if (name && !name.endsWith('/')) {
        files.push(name);
      }
    }
    return files;
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const tmpDir = join(tmpdir(), `oep-zip-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      execFileSync('unzip', ['-o', input.filePath, '-d', tmpDir], { encoding: 'utf-8' });
    } catch {
      throw new Error(`Failed to extract ZIP: ${input.filePath}`);
    }

    const files = readdirSync(tmpDir, { recursive: true }) as string[];
    const allContent: string[] = [];
    const allAssets: AssetInfo[] = [];
    const allWarnings: string[] = [];
    let totalPages = 0;
    let totalImages = 0;
    let totalTables = 0;

    for (const file of files) {
      const filePath = join(tmpDir, file);
      const ext = file.toLowerCase();

      if (
        ext.endsWith('.png') ||
        ext.endsWith('.jpg') ||
        ext.endsWith('.jpeg') ||
        ext.endsWith('.webp')
      ) {
        totalImages++;
        continue;
      }

      if (
        ext.endsWith('.pdf') ||
        ext.endsWith('.docx') ||
        ext.endsWith('.pptx') ||
        ext.endsWith('.md') ||
        ext.endsWith('.txt')
      ) {
        const extractionInput: ExtractionInput = { filePath };
        const extractor = this.router.resolve(extractionInput);
        if (extractor) {
          try {
            const result = await extractor.extract(extractionInput);
            allContent.push(result.contentMd);
            allAssets.push(...result.assets);
            allWarnings.push(...result.manifest.warnings);
            totalPages += result.manifest.pages;
            totalImages += result.manifest.images;
            totalTables += result.manifest.tables;
          } catch {
            allWarnings.push(`Failed to extract: ${file}`);
          }
        }
      }
    }

    rmSync(tmpDir, { recursive: true, force: true });

    const manifest: ExtractionManifest = {
      id: `zip-${Date.now()}`,
      sourceType: 'zip',
      extractor: 'zip-handler',
      version: '1.0.0',
      pages: totalPages,
      images: totalImages,
      tables: totalTables,
      warnings: allWarnings,
      createdAt: new Date().toISOString(),
      complexity: 'medium',
    };

    return {
      contentMd: allContent.join('\n\n'),
      manifest,
      assets: allAssets,
    };
  }
}
