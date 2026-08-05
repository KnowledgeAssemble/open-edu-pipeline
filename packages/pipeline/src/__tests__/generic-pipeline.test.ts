import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerBuiltinProfiles, resolveProfile, clearRegistry } from '../profile/registry.js';
import type { SourceInventory } from '../source/types.js';
import { SourceInventorySchema } from '../source/types.js';
import { createSyntheticChapter } from '../structure/detect.js';
import { getValidatorsForProfile } from '../validation/registry.js';
// Trigger MathValidator registration
import '../validation/math.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Generic Pipeline', () => {
  beforeAll(() => {
    clearRegistry();
    registerBuiltinProfiles();
  });

  it('generic profile produces valid output', () => {
    const profile = resolveProfile({ subject: 'history' });
    expect(profile.id).toBe('generic');
    expect(profile.widgetCategories).toContain('core');
    expect(profile.assetRendererTypes).toEqual([]);
    expect(profile.validatorIds).toEqual([]);
  });

  it('math profile resolves for mathematics subject', () => {
    const profile = resolveProfile({ subject: 'mathematics' });
    expect(profile.id).toBe('math');
    expect(profile.validatorIds).toContain('math');
    expect(profile.assetRendererTypes.length).toBeGreaterThan(0);
  });

  it('science profile resolves for science subject', () => {
    const profile = resolveProfile({ subject: 'science' });
    expect(profile.id).toBe('science');
    expect(profile.conceptKinds).toContain('process');
    expect(profile.widgetCategories).toContain('science');
  });

  it('nios profile resolves for nios curriculum', () => {
    const profile = resolveProfile({ curriculum: 'nios' });
    expect(profile.id).toBe('nios');
    expect(profile.sourceTaxonomy.lessonLabels).toContain('पाठ');
  });

  it('source inventory JSON is valid for generic science fixture', () => {
    const inventoryPath = join(
      __dirname,
      '..',
      'fixtures',
      'generic-science',
      'source-inventory.json',
    );
    const inventory: SourceInventory = JSON.parse(readFileSync(inventoryPath, 'utf-8'));
    expect(inventory.units.length).toBeGreaterThan(0);
    expect(SourceInventorySchema.safeParse(inventory).success).toBe(true);
  });

  it('single chapter produces synthetic chapter', () => {
    const pages = [{ pageNum: 1, text: 'No headings here' }];
    const chapter = createSyntheticChapter(pages);
    expect(chapter.id).toBe('document-chapter-1');
    expect(chapter.confidence).toBe(0.5);
  });

  it('profile-specific validators run only when enabled', () => {
    const validators = getValidatorsForProfile(resolveProfile({ subject: 'history' }));
    const validatorIds = validators.map((v) => v.id);
    expect(validatorIds).toContain('structure');

    const mathValidators = getValidatorsForProfile(resolveProfile({ subject: 'mathematics' }));
    const mathIds = mathValidators.map((v) => v.id);
    expect(mathIds).toContain('math');
  });
});
