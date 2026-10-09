import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseToMarkdown } from '../index.js';

const tempDirs: string[] = [];

function tempFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-extraction-md-'));
  tempDirs.push(dir);
  const filePath = join(dir, name);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('parseToMarkdown markdown passthrough', () => {
  it('reads and normalizes a markdown file without invoking liteparse', async () => {
    const filePath = tempFile('lesson.md', '# Title\n\n\nBody   \n');
    const result = await parseToMarkdown(filePath);
    expect(result.contentMd).toBe('# Title\n\nBody');
    expect(result.manifest.sourceType).toBe('markdown');
  });
});
