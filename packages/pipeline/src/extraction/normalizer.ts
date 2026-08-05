const SETEXT_H1 = /^(.+)\n={3,}\s*$/gm;
const SETEXT_H2 = /^(.+)\n-{3,}\s*$/gm;
const DUPLICATE_BLANKS = /\n{3,}/g;
const TRAILING_SPACES = / +$/gm;
const IMAGE_REF = /!\[([^\]]*)\]\((?!assets\/)([^)]+)\)/g;

export class MarkdownNormalizer {
  normalize(raw: string): string {
    let md = raw;

    md = this.normalizeHeadings(md);
    md = this.normalizeWhitespace(md);
    md = this.normalizeAssets(md);

    return md.trim();
  }

  private normalizeHeadings(md: string): string {
    md = md.replace(SETEXT_H1, '# $1');
    md = md.replace(SETEXT_H2, '## $1');
    return md;
  }

  private normalizeWhitespace(md: string): string {
    md = md.replace(DUPLICATE_BLANKS, '\n\n');
    md = md.replace(TRAILING_SPACES, '');
    return md;
  }

  private normalizeAssets(md: string): string {
    const seen = new Map<string, string>();
    let counter = 0;

    return md.replace(IMAGE_REF, (_match, alt: string, originalPath: string) => {
      if (!seen.has(originalPath)) {
        counter++;
        const ext = originalPath.split('.').pop() || 'png';
        const newName = `image-${String(counter).padStart(3, '0')}.${ext}`;
        seen.set(originalPath, newName);
      }
      return `![${alt}](assets/${seen.get(originalPath)})`;
    });
  }
}
