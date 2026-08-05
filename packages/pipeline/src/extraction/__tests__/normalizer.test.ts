import { describe, it, expect } from 'vitest';
import { MarkdownNormalizer } from '../normalizer.js';

describe('MarkdownNormalizer', () => {
  const normalizer = new MarkdownNormalizer();

  describe('heading normalization', () => {
    it('converts setext headings to ATX', () => {
      const input = 'Heading\n=======\n\nBody';
      const result = normalizer.normalize(input);
      expect(result).toContain('# Heading');
      expect(result).not.toContain('=======');
    });

    it('converts setext h2', () => {
      const input = 'Subheading\n-----------\n\nBody';
      const result = normalizer.normalize(input);
      expect(result).toContain('## Subheading');
    });

    it('preserves existing ATX headings', () => {
      const input = '# Already ATX\n\n## Also ATX';
      const result = normalizer.normalize(input);
      expect(result).toContain('# Already ATX');
      expect(result).toContain('## Also ATX');
    });
  });

  describe('whitespace normalization', () => {
    it('removes duplicate blank lines', () => {
      const input = 'Para 1\n\n\n\n\nPara 2';
      const result = normalizer.normalize(input);
      expect(result).not.toMatch(/\n{3,}/);
    });

    it('removes trailing spaces from lines', () => {
      const input = 'Line one   \nLine two  ';
      const result = normalizer.normalize(input);
      expect(result).not.toMatch(/ +\n/);
    });

    it('trims leading/trailing whitespace from document', () => {
      const input = '\n\n# Title\n\nBody\n\n';
      const result = normalizer.normalize(input);
      expect(result.startsWith('# Title')).toBe(true);
    });
  });

  describe('asset normalization', () => {
    it('renames image references deterministically', () => {
      const input = '![Chart](IMG_1234.png)\n\n![Diagram](temp/image1.png)';
      const result = normalizer.normalize(input);
      expect(result).toMatch(/!\[Chart\]\(assets\/image-001\.png\)/);
      expect(result).toMatch(/!\[Diagram\]\(assets\/image-002\.png\)/);
    });

    it('preserves image alt text', () => {
      const input = '![My Chart](random_name.png)';
      const result = normalizer.normalize(input);
      expect(result).toContain('![My Chart]');
    });

    it('handles mixed asset references', () => {
      const input = '![](a.png)\n\n![](b.jpg)\n\n![](c.png)';
      const result = normalizer.normalize(input);
      expect(result).toContain('image-001.png');
      expect(result).toContain('image-002.jpg');
      expect(result).toContain('image-003.png');
    });
  });

  describe('link normalization', () => {
    it('converts relative asset paths to assets/ prefix', () => {
      const input = '![Image](temp/a.png)';
      const result = normalizer.normalize(input);
      expect(result).toContain('(assets/');
    });
  });

  describe('UTF-8 output', () => {
    it('preserves unicode characters', () => {
      const input =
        '# \u0939\u093f\u0902\u0926\u0940 \u0936\u0940\u0930\u094d\u0937\u0915\n\n\u092f\u0939 \u090f\u0915 \u092a\u0930\u0940\u0915\u094d\u0937\u0923 \u0939\u0948\u0964';
      const result = normalizer.normalize(input);
      expect(result).toContain(
        '\u0939\u093f\u0902\u0926\u0940 \u0936\u0940\u0930\u094d\u0937\u0915',
      );
    });
  });

  describe('full normalization pipeline', () => {
    it('produces clean, deterministic output', () => {
      const messy = `
Title
=======


Para one   

![](ugly_NAME.png)



## Section
More content here   `;

      const result = normalizer.normalize(messy);
      expect(result).toMatch(/^# Title/m);
      expect(result).not.toMatch(/={5,}/);
      expect(result).not.toMatch(/\n{3,}/);
      expect(result).not.toMatch(/ +\n/);
      expect(result).toContain('assets/');
    });
  });
});
