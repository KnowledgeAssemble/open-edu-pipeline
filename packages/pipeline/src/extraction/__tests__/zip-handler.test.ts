import { describe, it, expect, beforeEach } from 'vitest';
import { ZipHandler } from '../zip-handler.js';
import { ExtractorRouter } from '../router.js';
import type { Extractor } from '../interface.js';

function makeFakeExtractor(id: string, extensions: string[]): Extractor {
  return {
    id,
    supportedExtensions: extensions,
    canHandle: (input) => extensions.some((ext) => input.filePath.endsWith(ext)),
    extract: async (input) => ({
      contentMd: `# ${id} output for ${input.filePath}`,
      manifest: {
        id: 'test',
        sourceType: 'test',
        extractor: id,
        version: '1.0.0',
        pages: 1,
        images: 0,
        tables: 0,
        warnings: [],
        createdAt: new Date().toISOString(),
        complexity: 'low' as const,
      },
      assets: [],
    }),
  };
}

describe('ZipHandler', () => {
  let router: ExtractorRouter;
  let handler: ZipHandler;

  beforeEach(() => {
    router = new ExtractorRouter();
    router.register(makeFakeExtractor('liteparse', ['.pdf', '.docx', '.pptx', '.png', '.jpg']));
    handler = new ZipHandler(router);
  });

  it('canHandle returns true for .zip files', () => {
    expect(handler.canHandle({ filePath: '/tmp/archive.zip' })).toBe(true);
  });

  it('canHandle returns false for non-zip files', () => {
    expect(handler.canHandle({ filePath: '/tmp/doc.pdf' })).toBe(false);
  });

  it('lists extractable files from a zip', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { execSync } = await import('node:child_process');

    const tmpDir = `/tmp/zip-test-${Date.now()}`;
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'hello');
    fs.writeFileSync(path.join(tmpDir, 'doc.pdf'), 'fake pdf');

    const zipPath = `/tmp/test-${Date.now()}.zip`;
    execSync(`cd "${tmpDir}" && zip "${zipPath}" *.txt *.pdf`);

    const files = handler.listZipContents(zipPath);
    expect(files).toContain('readme.txt');
    expect(files).toContain('doc.pdf');

    fs.rmSync(tmpDir, { recursive: true });
    fs.unlinkSync(zipPath);
  });
});
