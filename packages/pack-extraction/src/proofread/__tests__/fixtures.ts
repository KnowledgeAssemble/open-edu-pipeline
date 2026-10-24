import type { PageReference, ReferenceBundle } from '../types.js';

export function makePage(
  pageNum: number,
  pageMarkdown: string,
  overrides: Partial<PageReference> = {},
): PageReference {
  return {
    pageNum,
    kind: 'text',
    text: pageMarkdown,
    pageMarkdown,
    quality: { chars: pageMarkdown.length, replacementChars: 0 },
    hasScreenshot: false,
    ...overrides,
  };
}

export function makeReference(
  pages: PageReference[],
  overrides: Partial<ReferenceBundle['manifest']> = {},
): ReferenceBundle {
  return {
    available: true,
    pages,
    manifest: {
      pdfSha256: 'pdf-hash',
      rawMarkdownSha256: 'raw-hash',
      liteparseVersion: 'test',
      parseOptions: {},
      parseOptionsSha256: 'options-hash',
      screenshotDpi: 150,
      createdAt: '2026-01-01T00:00:00.000Z',
      referenceMismatch: false,
      ...overrides,
    },
  };
}
